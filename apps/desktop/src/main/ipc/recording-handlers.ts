import type { z } from 'zod';
import type {
  FinishedRecording,
  Outcome,
  RecordingError,
  RecordingEvent,
  RecordingOptions,
  RecordingSnapshot,
  RecoverableSession,
  Warning,
} from '../recording/types';
import type {
  finishedSchema,
  recordingErrorSchema,
  snapshotSchema,
  warningSchema,
} from '../../shared/recording-contract';
import type { Handlers } from './dispatcher';

/** The part of the recording service the bridge uses. The real service fits it as it is. */
export interface RecordingApi {
  start: (options: RecordingOptions) => Promise<Outcome<{ folder: string }>>;
  pause: () => Promise<Outcome<void>>;
  resume: () => Promise<Outcome<void>>;
  stop: () => Promise<Outcome<FinishedRecording>>;
  snapshot: () => RecordingSnapshot;
  listRecoverable: () => Promise<RecoverableSession[]>;
  recover: (folder: string) => Promise<Outcome<FinishedRecording>>;
  dismiss: (folder: string) => Promise<void>;
}

type BridgeError = z.infer<typeof recordingErrorSchema>;
type BridgeSnapshot = z.infer<typeof snapshotSchema>;
type BridgeFinished = z.infer<typeof finishedSchema>;
type BridgeWarning = z.infer<typeof warningSchema>;

/** The error without its technical detail, which can hold a path or an error number. */
export function toBridgeError(error: RecordingError): BridgeError {
  return { code: error.code, message: error.message, nextStep: error.nextStep };
}

/** The state without the session folder, so the page never needs to know where it is. */
export function toBridgeSnapshot(snapshot: RecordingSnapshot): BridgeSnapshot {
  return {
    phase: snapshot.phase,
    elapsedMs: snapshot.elapsedMs,
    bytesWritten: snapshot.bytesWritten,
    tracks: snapshot.tracks.map((track) => ({
      kind: track.kind,
      bytesWritten: track.bytesWritten,
      ended: track.ended,
    })),
    warnings: snapshot.warnings.map(toBridgeWarning),
  };
}

export function toBridgeWarning(warning: Warning): BridgeWarning {
  return warning.code === 'disk-low'
    ? { code: warning.code, message: warning.message, freeBytes: warning.freeBytes }
    : { code: warning.code, message: warning.message };
}

export function toBridgeFinished(result: FinishedRecording): BridgeFinished {
  return {
    folder: result.folder,
    name: result.name,
    files: result.files.map((file) => ({ kind: file.kind, path: file.path })),
    durationMs: result.durationMs,
    bytes: result.bytes,
    ...(result.inputLog === undefined ? {} : { inputLog: result.inputLog }),
    recovered: result.recovered,
    warnings: result.warnings,
  };
}

function mapOutcome<T, U>(
  result: Outcome<T>,
  convert: (value: T) => U,
): { ok: true; value: U } | { ok: false; error: BridgeError } {
  return result.ok
    ? { ok: true, value: convert(result.value) }
    : { ok: false, error: toBridgeError(result.error) };
}

/** An engine event as the typed event the renderer receives, or nothing for an unknown kind. */
export function toBridgeEvent(
  event: RecordingEvent,
):
  | { channel: 'recording:state'; payload: BridgeSnapshot }
  | { channel: 'recording:warning'; payload: BridgeWarning }
  | { channel: 'recording:error'; payload: BridgeError }
  | { channel: 'recording:finished'; payload: BridgeFinished } {
  switch (event.type) {
    case 'state':
      return { channel: 'recording:state', payload: toBridgeSnapshot(event.snapshot) };
    case 'warning':
      return { channel: 'recording:warning', payload: toBridgeWarning(event.warning) };
    case 'error':
      return { channel: 'recording:error', payload: toBridgeError(event.error) };
    case 'finished':
      return { channel: 'recording:finished', payload: toBridgeFinished(event.result) };
  }
}

export interface RecordingHandlerDeps {
  recording: RecordingApi;
  /** The folder the person chose, or null for the default. It never comes from the page. */
  destination: () => string | null;
}

type RecordingChannels = Pick<
  Handlers,
  | 'recording:start'
  | 'recording:pause'
  | 'recording:resume'
  | 'recording:stop'
  | 'recording:snapshot'
  | 'recording:list-recoverable'
  | 'recording:recover'
  | 'recording:dismiss'
>;

/**
 * The recording calls. The page chooses what to record and with which devices. Where it is saved
 * comes from the main process, and recover or dismiss work only on a folder that the list of
 * recoverable recordings offered, so the page cannot point them at some other folder.
 */
export function createRecordingHandlers(deps: RecordingHandlerDeps): RecordingChannels {
  const { recording } = deps;
  const offered = new Set<string>();

  const requireOffered = (folder: string): void => {
    if (!offered.has(folder)) throw new Error('folder was not offered');
  };

  return {
    'recording:start': async (input) => {
      const destination = deps.destination();
      const result = await recording.start({
        source: input.source,
        camera: input.camera,
        mic: input.mic,
        ...(destination === null ? {} : { destination }),
        ...(input.name === undefined ? {} : { name: input.name }),
      });
      return mapOutcome(result, () => ({}));
    },
    'recording:pause': async () => mapOutcome(await recording.pause(), () => undefined),
    'recording:resume': async () => mapOutcome(await recording.resume(), () => undefined),
    'recording:stop': async () => mapOutcome(await recording.stop(), toBridgeFinished),
    'recording:snapshot': () => toBridgeSnapshot(recording.snapshot()),
    'recording:list-recoverable': async () => {
      const found = await recording.listRecoverable();
      offered.clear();
      for (const session of found) offered.add(session.folder);
      return found.map((session) => ({
        folder: session.folder,
        name: session.name,
        createdAt: session.createdAt,
        bytes: session.bytes,
      }));
    },
    'recording:recover': async ({ folder }) => {
      requireOffered(folder);
      const result = await recording.recover(folder);
      if (result.ok) offered.delete(folder);
      return mapOutcome(result, toBridgeFinished);
    },
    'recording:dismiss': async ({ folder }) => {
      requireOffered(folder);
      await recording.dismiss(folder);
      offered.delete(folder);
    },
  };
}
