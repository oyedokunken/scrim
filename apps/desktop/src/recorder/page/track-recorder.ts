import type { ChunkMessage, TrackKind } from '../protocol';

/** The slice of MediaRecorder this code uses, so tests can drive it without a browser. */
export interface RecorderLike {
  readonly state: 'inactive' | 'recording' | 'paused';
  ondataavailable: ((event: { data: BlobLike }) => void) | null;
  onstart: (() => void) | null;
  onstop: (() => void) | null;
  onpause: (() => void) | null;
  onresume: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start(timesliceMs: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export interface BlobLike {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** The slice of a media track this code uses. */
export interface TrackLike {
  onended: (() => void) | null;
  stop(): void;
}

/** What a track recorder needs from a frame clock, so audio tracks can go without one. */
interface FrameClockLike {
  markStart(calledAt: number): void;
  firstFrameAt(): number | undefined;
  firstFrameStampMs(): number | undefined;
  stop(): void;
}

export interface TrackRecorderOptions {
  kind: TrackKind;
  recorder: RecorderLike;
  track: TrackLike;
  /** Milliseconds from `performance.now()`. */
  now: () => number;
  /**
   * Sends a chunk to main on this track's port. The buffer is copied, not transferred: a message
   * whose buffer is in the transfer list arrives in the main process as null (measured in Electron
   * 44). One second of footage is a megabyte or two, so the copy costs nothing that matters.
   */
  post: (message: ChunkMessage) => void;
  onStarted: (
    rendererNow: number,
    calledAt: number,
    first: { at: number; stampMs: number } | undefined,
  ) => void;
  /** Frame timestamps for a video track. Left out for audio. */
  frames?: FrameClockLike | undefined;
  /** The device went away or the capture ended on its own. */
  onEnded: (rendererNow: number) => void;
  onError: (message: string, rendererNow: number) => void;
  /** Timing marks from the recorder itself, for diagnosing drift. Not part of recording. */
  onTrace: (what: string, rendererNow: number) => void;
}

/**
 * Records one track and sends its chunks to main, numbered from zero and in order. Each chunk
 * is read into a buffer and posted one after another, so a slow read can never reorder them.
 * `mediaTimeMs` is the recorded time at the end of the chunk, with paused time left out.
 */
export class TrackRecorder {
  readonly kind: TrackKind;
  private readonly recorder: RecorderLike;
  private readonly track: TrackLike;
  private readonly options: TrackRecorderOptions;

  private seq = 0;
  private bytes = 0;
  private startedAt = 0;
  private calledAt = 0;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private chain: Promise<void> = Promise.resolve();
  private stopping = false;
  private ended = false;
  private stoppedTime = 0;

  constructor(options: TrackRecorderOptions) {
    this.options = options;
    this.kind = options.kind;
    this.recorder = options.recorder;
    this.track = options.track;

    this.recorder.ondataavailable = (event) => {
      if (this.stopping)
        options.onTrace(`final chunk ${String(event.data.size)} bytes`, options.now());
      this.enqueue(event.data);
    };
    this.recorder.onstart = () => {
      this.startedAt = options.now();
      const at = options.frames?.firstFrameAt();
      const stampMs = options.frames?.firstFrameStampMs();
      options.onStarted(
        this.startedAt,
        this.calledAt,
        at === undefined || stampMs === undefined ? undefined : { at, stampMs },
      );
    };
    this.recorder.onpause = () => {
      options.onTrace('recorder paused', options.now());
    };
    this.recorder.onresume = () => {
      options.onTrace('recorder resumed', options.now());
    };
    this.recorder.onerror = (event) => {
      options.onError(describe(event), options.now());
    };
    // A device unplugged mid recording ends its track. Only this recorder is stopped.
    this.track.onended = () => {
      if (this.stopping || this.ended) return;
      this.ended = true;
      this.stoppedTime = options.now();
      options.onEnded(this.stoppedTime);
      this.stopRecorder();
    };
  }

  get stats(): { chunks: number; bytes: number } {
    return { chunks: this.seq, bytes: this.bytes };
  }

  get hasEnded(): boolean {
    return this.ended;
  }

  /** When the recorder stopped, on the page clock. Zero until it has. */
  get stoppedAt(): number {
    return this.stoppedTime;
  }

  start(timesliceMs: number): void {
    this.calledAt = this.options.now();
    this.options.frames?.markStart(this.calledAt);
    this.recorder.start(timesliceMs);
  }

  pause(): void {
    if (this.recorder.state !== 'recording') return;
    this.pausedAt = this.options.now();
    this.recorder.pause();
  }

  resume(): void {
    if (this.recorder.state !== 'paused') return;
    if (this.pausedAt !== null) this.pausedTotal += this.options.now() - this.pausedAt;
    this.pausedAt = null;
    this.recorder.resume();
  }

  /** Stops recording, waits for the last chunk to be posted, and releases the device. */
  async stop(): Promise<void> {
    this.options.onTrace('stop requested', this.options.now());
    this.stopping = true;
    if (this.recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        this.recorder.onstop = () => {
          this.stoppedTime = this.options.now();
          this.options.onTrace('recorder stopped', this.stoppedTime);
          resolve();
        };
        this.stopRecorder();
      });
    }
    await this.chain;
    this.options.frames?.stop();
    this.track.stop();
  }

  private stopRecorder(): void {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
  }

  private enqueue(blob: BlobLike): void {
    if (blob.size === 0) return;
    const seq = this.seq;
    this.seq += 1;
    const mediaTimeMs = Math.max(
      0,
      Math.round(this.options.now() - this.startedAt - this.pausedTotal),
    );
    this.chain = this.chain
      .then(() => blob.arrayBuffer())
      .then((data) => {
        this.bytes += data.byteLength;
        this.options.post({
          track: this.kind,
          seq,
          byteLength: data.byteLength,
          mediaTimeMs,
          data,
        });
      })
      .catch((error: unknown) => {
        this.options.onError(describe(error), this.options.now());
      });
  }
}

function describe(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return 'The recorder reported an error.';
}
