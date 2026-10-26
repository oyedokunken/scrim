import type {
  MediaStreamLike,
  MediaTrackLike,
  PortLike,
} from '../../../src/recorder/page/controller';
import type { BlobLike, RecorderLike } from '../../../src/recorder/page/track-recorder';
import type { ChunkMessage } from '../../../src/recorder/protocol';

export class FakeRecorder implements RecorderLike {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: BlobLike }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  timeslice = 0;

  start(timesliceMs: number): void {
    this.timeslice = timesliceMs;
    this.state = 'recording';
    this.onstart?.();
  }
  pause(): void {
    this.state = 'paused';
  }
  resume(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
  emit(blob: BlobLike): void {
    this.ondataavailable?.({ data: blob });
  }
}

/** A blob whose bytes arrive after `delayMs` of fake time, to prove order survives a slow read. */
export function blobOf(size: number, fill = 1, readDelay?: Promise<void>): BlobLike {
  return {
    size,
    async arrayBuffer() {
      if (readDelay !== undefined) await readDelay;
      return new Uint8Array(size).fill(fill).buffer;
    },
  };
}

export class FakeTrack implements MediaTrackLike {
  onended: (() => void) | null = null;
  stopped = false;
  constructor(
    readonly label = 'Fake device',
    private readonly settings: { width?: number; height?: number; cursor?: string } = {},
  ) {}
  getSettings(): { width?: number; height?: number; cursor?: string } {
    return this.settings;
  }
  stop(): void {
    this.stopped = true;
  }
  /** The device went away. */
  unplug(): void {
    this.onended?.();
  }
}

export class FakeStream implements MediaStreamLike {
  constructor(
    readonly video: FakeTrack[],
    readonly audio: FakeTrack[],
  ) {}
  getVideoTracks(): FakeTrack[] {
    return this.video;
  }
  getAudioTracks(): FakeTrack[] {
    return this.audio;
  }
}

export class FakePort implements PortLike {
  readonly posted: { message: ChunkMessage }[] = [];
  closed = false;
  postMessage(message: ChunkMessage): void {
    this.posted.push({ message });
  }
  close(): void {
    this.closed = true;
  }
}

/** Resolves every pending microtask and a few timers' worth of promise chains. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 100; i += 1) await Promise.resolve();
}

export const namedError = (name: string, message = name): Error =>
  Object.assign(new Error(message), { name });
