import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { FileSink } from '../../../src/main/recording/chunk-writer';
import type { ProcessResult, RunProcess } from '../../../src/main/recording/ffmpeg';
import { realServiceFs, type ServiceFs } from '../../../src/main/recording/fs-adapter';
import type { InputSource, UnstampedEvent } from '../../../src/main/recording/input-source';
import { RecorderHost } from '../../../src/main/recording/recorder-host';
import type {
  BoundsStartResult,
  WindowBoundsSource,
  WindowRect,
} from '../../../src/main/recording/window-bounds-source';
import { RecordingService, type ServiceDeps } from '../../../src/main/recording/recording-service';
import { createSessionIndex } from '../../../src/main/recording/session-store';
import type {
  RecordingEvent,
  RecordingOptions,
  SourceSpec,
} from '../../../src/main/recording/types';
import type { TrackKind } from '../../../src/recorder/protocol';
import { FakePage } from './fake-page';

class FakeBounds implements WindowBoundsSource {
  listener: ((rect: WindowRect) => void) | undefined;
  stopped = false;
  result: BoundsStartResult = { status: 'started' };
  start(onRect: (rect: WindowRect) => void): Promise<BoundsStartResult> {
    this.listener = onRect;
    return Promise.resolve(this.result);
  }
  stop(): void {
    this.stopped = true;
  }
  move(x: number, y: number, width = 800, height = 600): void {
    this.listener?.({ x, y, width, height });
  }
}

class FakeInput implements InputSource {
  listener: ((event: UnstampedEvent) => void) | undefined;
  stopped = false;
  result: Awaited<ReturnType<InputSource['start']>> = { status: 'started' };
  start(onEvent: (event: UnstampedEvent) => void): ReturnType<InputSource['start']> {
    this.listener = onEvent;
    return Promise.resolve(this.result);
  }
  stop(): void {
    this.stopped = true;
  }
  click(x = 100, y = 100): void {
    this.listener?.({ type: 'down', x, y, button: 'left' });
  }
}

interface Faults {
  /** Makes appends to files whose name contains this text fail with this error code. */
  appendFail?: { match: string; code: string } | undefined;
  mkdirFail?: string | undefined;
  freeBytes?: number | undefined;
  openAppendFail?: { match: string; code: string } | undefined;
  heartbeatWriteFail?: string | undefined;
}

export interface HarnessOptions {
  /** Tracks the page fails to open, with the reason. */
  failedTracks?: { kind: TrackKind; reason: 'permission-denied' | 'device-missing' }[];
  cursor?: 'hidden' | 'shown' | 'unknown';
  alivePids?: number[];
  /** Pixels per device independent pixel of the pretend display. */
  scaleFactor?: number;
  /** Whether the page can read frame timestamps. When not, video time zero falls back. */
  frameTimestamps?: boolean;
}

const ERR = (code: string): Error => Object.assign(new Error(code), { code });

/** Everything a recording service test needs: a real folder, a fake page, clock, ffmpeg and mouse. */
export async function createHarness(options: HarnessOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'scrim-engine-'));
  const destination = join(dir, 'Scrim');
  const faults: Faults = {};
  const clock = { time: 100_000 };
  const page = new FakePage();
  const input = new FakeInput();
  const bounds = new FakeBounds();
  const events: RecordingEvent[] = [];
  const alive = new Set<number>(options.alivePids ?? []);
  const openSinks = new Set<string>();
  const sent: Record<TrackKind, number> = { screen: 0, camera: 0, mic: 0 };
  const sentBytes: Record<TrackKind, number> = { screen: 0, camera: 0, mic: 0 };
  const processes: { command: string; args: readonly string[] }[] = [];
  let heartbeat: (() => void) | undefined;
  let rendererClockOffset = -1000;

  const fs: ServiceFs = {
    ...realServiceFs,
    async mkdir(path) {
      if (faults.mkdirFail !== undefined) throw ERR(faults.mkdirFail);
      await realServiceFs.mkdir(path);
    },
    freeBytes: (path) =>
      faults.freeBytes === undefined
        ? realServiceFs.freeBytes(path)
        : Promise.resolve(faults.freeBytes),
    async openAppend(path): Promise<FileSink> {
      if (faults.openAppendFail !== undefined && path.includes(faults.openAppendFail.match)) {
        throw ERR(faults.openAppendFail.code);
      }
      const sink = await realServiceFs.openAppend(path);
      openSinks.add(path);
      return {
        append(data) {
          if (faults.appendFail !== undefined && path.includes(faults.appendFail.match)) {
            return Promise.reject(ERR(faults.appendFail.code));
          }
          return sink.append(data);
        },
        sync: () => sink.sync(),
        close: async () => {
          await sink.close();
          openSinks.delete(path);
        },
      };
    },
    async writeJsonAtomic(path, value) {
      if (faults.heartbeatWriteFail !== undefined && path.endsWith('session.json')) {
        throw ERR(faults.heartbeatWriteFail);
      }
      await realServiceFs.writeJsonAtomic(path, value);
    },
  };

  const run: RunProcess = async (command, args): Promise<ProcessResult> => {
    processes.push({ command, args });
    if (command.includes('ffprobe')) {
      const file = args.at(-1) ?? '';
      const audioOnly = basename(file).startsWith('mic');
      return {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          streams: audioOnly
            ? [{ codec_type: 'audio', codec_name: 'opus' }]
            : [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 }],
          format: { duration: '5.0' },
        }),
      };
    }
    const raw = args[args.indexOf('-i') + 1];
    const out = args.at(-1);
    if (raw === undefined || out === undefined) return { code: 1, stdout: '', stderr: 'bad args' };
    await copyFile(raw, out);
    return { code: 0, stdout: '', stderr: '' };
  };

  const deps: ServiceDeps = {
    fs,
    now: () => clock.time,
    wallNow: () => new Date('2026-10-26T12:00:00.000Z'),
    uuid: () => '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11',
    app: { version: '0.0.0', os: 'windows', arch: 'x64', pid: 4242 },
    createHost: (callbacks) =>
      new RecorderHost({
        transport: page,
        now: () => clock.time,
        ...callbacks,
        timeouts: { readyMs: 500, replyMs: 500 },
      }),
    createInputSource: () => input,
    createBoundsSource: () => bounds,
    run,
    ffmpeg: { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' },
    resolveSource: (spec: SourceSpec) =>
      Promise.resolve({
        ok: true,
        value: {
          kind: spec.kind,
          ...(spec.kind === 'region' ? { crop: spec.crop } : {}),
          origin: { x: 0, y: 0 },
          scaleFactor: options.scaleFactor ?? 1,
        },
      }),
    setCaptureTarget: () => undefined,
    defaultDestination: () => destination,
    index: createSessionIndex(join(dir, 'index.json'), realServiceFs),
    isProcessAlive: (pid) => alive.has(pid),
    log: () => undefined,
    timers: {
      setInterval: (callback) => {
        heartbeat = callback;
        return 1;
      },
      clearInterval: () => {
        heartbeat = undefined;
      },
    },
    waits: { chunkDrainMs: 200 },
  };

  page.reply = (command, p) => {
    switch (command.type) {
      case 'configure': {
        const failed = (options.failedTracks ?? []).filter((entry) =>
          command.tracks.some((track) => track.kind === entry.kind),
        );
        p.emit({
          type: 'ready',
          tracks: command.tracks
            .filter((track) => !failed.some((entry) => entry.kind === track.kind))
            .map((track) => ({
              kind: track.kind,
              mimeType: track.kind === 'mic' ? 'audio/webm;codecs=opus' : 'video/webm;codecs=h264',
            })),
          failed: failed.map((entry) => ({ ...entry, message: `${entry.kind} failed` })),
          cursor: options.cursor ?? 'hidden',
          frame: { width: 1920, height: 1080 },
        });
        break;
      }
      case 'ping':
        p.emit({
          type: 'pong',
          id: command.id,
          mainSentAt: command.mainSentAt,
          rendererNow: clock.time + rendererClockOffset,
        });
        break;
      case 'start':
        for (const kind of Object.keys(p.ports) as TrackKind[]) {
          p.emit({
            type: 'track-started',
            kind,
            rendererNow: clock.time + rendererClockOffset + 50,
            calledAt: clock.time + rendererClockOffset + 20,
            ...(options.frameTimestamps === false || kind === 'mic'
              ? {}
              : { firstFrameAt: clock.time + rendererClockOffset + 35 }),
          });
        }
        break;
      case 'pause':
        p.emit({ type: 'paused', rendererNow: clock.time + rendererClockOffset });
        break;
      case 'resume':
        p.emit({ type: 'resumed', rendererNow: clock.time + rendererClockOffset });
        break;
      case 'stop':
        p.emit({
          type: 'stopped',
          tracks: (Object.keys(p.ports) as TrackKind[]).map((kind) => ({
            kind,
            chunks: sent[kind],
            bytes: sentBytes[kind],
            stoppedAt: clock.time + rendererClockOffset,
          })),
        });
        break;
    }
  };

  const service = new RecordingService(deps);
  service.on((event) => events.push(event));

  const defaults: RecordingOptions = {
    source: { kind: 'display' },
    camera: { enabled: false },
    mic: { enabled: false },
  };

  return {
    dir,
    destination,
    faults,
    alive,
    openSinks,
    clock,
    page,
    input,
    bounds,
    events,
    service,
    deps,
    processes,
    options: defaults,
    /** Sends one chunk on a track's port, as the recorder page would. */
    sendChunk(kind: TrackKind, size = 100, fill = 7): void {
      const data = new Uint8Array(size).fill(fill).buffer;
      page.ports[kind]?.callback?.({
        track: kind,
        seq: sent[kind],
        byteLength: size,
        mediaTimeMs: clock.time,
        data,
      });
      sent[kind] += 1;
      sentBytes[kind] += size;
    },
    fireHeartbeat: () => heartbeat?.(),
    setRendererOffset: (value: number) => {
      rendererClockOffset = value;
    },
    read: (path: string) => readFile(path),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Waits for pending promise chains and file writes to settle. */
export async function flushWork(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
}
