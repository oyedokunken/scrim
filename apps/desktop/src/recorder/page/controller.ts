import type {
  ChunkMessage,
  CursorState,
  RecorderCommand,
  RecorderEvent,
  TrackFailureReason,
  TrackKind,
  TrackRequest,
} from '../protocol';
import { pickMimeType } from './mime';
import { TrackRecorder, type RecorderLike, type TrackLike } from './track-recorder';

export interface MediaTrackLike extends TrackLike {
  readonly label: string;
  getSettings(): { width?: number; height?: number; cursor?: string };
}

export interface MediaStreamLike {
  getVideoTracks(): MediaTrackLike[];
  getAudioTracks(): MediaTrackLike[];
}

export interface PortLike {
  postMessage(message: ChunkMessage): void;
  close(): void;
}

export interface RecorderOptions {
  mimeType: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
}

export interface ControllerDeps {
  now(): number;
  isTypeSupported(mimeType: string): boolean;
  getDisplayMedia(): Promise<MediaStreamLike>;
  getUserMedia(constraints: {
    video?: Record<string, unknown>;
    audio?: Record<string, unknown>;
  }): Promise<MediaStreamLike>;
  createRecorder(stream: MediaStreamLike, options: RecorderOptions): RecorderLike;
  sendEvent(event: RecorderEvent): void;
}

const CAMERA_BITS_PER_SECOND = 2_500_000;
const AUDIO_BITS_PER_SECOND = 128_000;

/** Turns a getDisplayMedia or getUserMedia error into a reason the app can explain. */
export function failureReason(error: unknown): TrackFailureReason {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'device-missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'device-busy';
    case 'NotSupportedError':
    case 'TypeError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

function messageOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'The device could not be opened.';
}

function cursorState(setting: string | undefined): CursorState {
  if (setting === 'never') return 'hidden';
  if (setting === 'always' || setting === 'motion') return 'shown';
  return 'unknown';
}

/**
 * Runs inside the hidden recorder page. It opens the screen, camera and microphone that main asked
 * for, records each into its own MediaRecorder, and sends the chunks to main over one port per
 * track. It never decides anything: main sends commands and this answers with events.
 */
export class RecorderController {
  private readonly deps: ControllerDeps;
  private readonly recorders = new Map<TrackKind, TrackRecorder>();
  private readonly ports = new Map<TrackKind, PortLike>();
  private timesliceMs = 1000;

  constructor(deps: ControllerDeps) {
    this.deps = deps;
  }

  attachPorts(ports: Partial<Record<TrackKind, PortLike>>): void {
    for (const kind of ['screen', 'camera', 'mic'] as const) {
      const port = ports[kind];
      if (port !== undefined) this.ports.set(kind, port);
    }
    this.deps.sendEvent({ type: 'ports-attached', kinds: [...this.ports.keys()] });
  }

  async handle(command: RecorderCommand): Promise<void> {
    try {
      switch (command.type) {
        case 'configure':
          await this.configure(command);
          break;
        case 'ping':
          this.deps.sendEvent({
            type: 'pong',
            id: command.id,
            mainSentAt: command.mainSentAt,
            rendererNow: this.deps.now(),
          });
          break;
        case 'start':
          this.start();
          break;
        case 'pause':
          for (const recorder of this.recorders.values()) recorder.pause();
          this.deps.sendEvent({ type: 'paused', rendererNow: this.deps.now() });
          break;
        case 'resume':
          for (const recorder of this.recorders.values()) recorder.resume();
          this.deps.sendEvent({ type: 'resumed', rendererNow: this.deps.now() });
          break;
        case 'stop':
          await this.stop();
          break;
      }
    } catch (error) {
      this.deps.sendEvent({ type: 'fatal', message: messageOf(error) });
    }
  }

  private async configure(command: Extract<RecorderCommand, { type: 'configure' }>): Promise<void> {
    this.timesliceMs = command.timesliceMs;
    const ready: Extract<RecorderEvent, { type: 'ready' }> = {
      type: 'ready',
      tracks: [],
      failed: [],
      cursor: 'unknown',
    };
    for (const request of command.tracks) {
      try {
        const opened = await this.open(request, command.screenBitsPerSecond);
        ready.tracks.push({ kind: request.kind, mimeType: opened.mimeType, label: opened.label });
        if (request.kind === 'screen') {
          ready.cursor = opened.cursor;
          if (opened.frame !== undefined) ready.frame = opened.frame;
        }
      } catch (error) {
        ready.failed.push({
          kind: request.kind,
          reason: failureReason(error),
          message: messageOf(error),
        });
      }
    }
    this.deps.sendEvent(ready);
  }

  private async open(
    request: TrackRequest,
    screenBitsPerSecond: number,
  ): Promise<{
    mimeType: string;
    label: string;
    cursor: CursorState;
    frame: { width: number; height: number } | undefined;
  }> {
    const { kind } = request;
    const stream = await this.streamFor(request);
    const media = kind === 'mic' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (media === undefined) {
      const error = new Error(`No ${kind} track was provided.`);
      error.name = 'NotFoundError';
      throw error;
    }
    const mimeType = pickMimeType(kind === 'mic' ? 'audio' : 'video', (type) =>
      this.deps.isTypeSupported(type),
    );
    if (mimeType === undefined) {
      media.stop();
      const error = new Error(`This computer cannot record ${kind}.`);
      error.name = 'NotSupportedError';
      throw error;
    }

    const options: RecorderOptions =
      kind === 'mic'
        ? { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND }
        : {
            mimeType,
            videoBitsPerSecond: kind === 'screen' ? screenBitsPerSecond : CAMERA_BITS_PER_SECOND,
          };
    const recorder = this.deps.createRecorder(stream, options);
    const deps = this.deps;
    this.recorders.set(
      kind,
      new TrackRecorder({
        kind,
        recorder,
        track: media,
        now: () => deps.now(),
        post: (message) => {
          this.ports.get(kind)?.postMessage(message);
        },
        onStarted: (rendererNow) => {
          deps.sendEvent({ type: 'track-started', kind, rendererNow });
        },
        onEnded: (rendererNow) => {
          deps.sendEvent({ type: 'track-ended', kind, rendererNow });
        },
        onError: (message, rendererNow) => {
          deps.sendEvent({ type: 'track-error', kind, message, rendererNow });
        },
      }),
    );

    const settings = media.getSettings();
    const frame =
      kind === 'screen' &&
      settings.width !== undefined &&
      settings.height !== undefined &&
      settings.width > 0 &&
      settings.height > 0
        ? { width: Math.round(settings.width), height: Math.round(settings.height) }
        : undefined;
    return { mimeType, label: media.label, cursor: cursorState(settings.cursor), frame };
  }

  private streamFor(request: TrackRequest): Promise<MediaStreamLike> {
    if (request.kind === 'screen') return this.deps.getDisplayMedia();
    const device = request.deviceId === undefined ? {} : { deviceId: { exact: request.deviceId } };
    if (request.kind === 'camera') {
      return this.deps.getUserMedia({
        video: {
          ...device,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      });
    }
    return this.deps.getUserMedia({ audio: device });
  }

  private start(): void {
    for (const kind of this.recorders.keys()) {
      if (!this.ports.has(kind)) {
        this.deps.sendEvent({ type: 'fatal', message: `No port was attached for ${kind}.` });
        return;
      }
    }
    for (const recorder of this.recorders.values()) recorder.start(this.timesliceMs);
  }

  private async stop(): Promise<void> {
    const stopped = [...this.recorders.values()];
    await Promise.all(stopped.map((recorder) => recorder.stop()));
    for (const port of this.ports.values()) port.close();
    this.ports.clear();
    this.recorders.clear();
    this.deps.sendEvent({
      type: 'stopped',
      tracks: stopped.map((recorder) => ({ kind: recorder.kind, ...recorder.stats })),
    });
  }
}
