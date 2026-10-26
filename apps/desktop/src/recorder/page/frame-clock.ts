/** One video frame as far as timing goes: its capture timestamp in microseconds. */
export interface FrameStamp {
  timestampUs: number;
}

/**
 * A stream of frames from a track. The real one wraps a `MediaStreamTrackProcessor`. Reading a
 * frame must close it, so no frame is held. It returns undefined when the track ends.
 */
export interface FrameSource {
  read(): Promise<FrameStamp | undefined>;
  cancel(): void;
}

export interface FrameClockOptions {
  source: FrameSource;
  /** Milliseconds from `performance.now()`, the page clock. */
  now: () => number;
}

/**
 * Finds out exactly when the video's first frame was captured. Every frame carries the time it
 * was captured on a steady system clock, in a different zero from the page's. The two differ by a
 * constant, and a frame can only be seen after it was captured, so across many frames the largest
 * of `timestamp minus time seen` is the constant with the least delivery delay in it. A frame's
 * capture time on the page clock is then its timestamp minus that constant.
 *
 * The recorder's time zero is the first frame it receives after `start()`, so the capture time of
 * the first frame seen after the call is where the video's media time is zero. This replaces a
 * fixed delay measured on one computer.
 */
export class FrameClock {
  private readonly options: FrameClockOptions;
  private offsetMs = Number.NEGATIVE_INFINITY;
  private calledAt: number | undefined;
  private firstTimestampMs: number | undefined;
  private stopped = false;
  private reading: Promise<void> | undefined;

  constructor(options: FrameClockOptions) {
    this.options = options;
  }

  /** Starts reading frames. Safe to call once. */
  begin(): void {
    if (this.reading !== undefined) return;
    this.reading = this.loop();
  }

  /** Remembers when the recorder was started, so the first frame after it can be picked out. */
  markStart(calledAt: number): void {
    this.calledAt = calledAt;
  }

  /**
   * The raw timestamp of that same frame, in milliseconds on the system's steady clock. The main
   * process can compare it with its own steady clock directly, which does not depend on any
   * estimate of how late frames are delivered.
   */
  firstFrameStampMs(): number | undefined {
    return this.firstTimestampMs;
  }

  /**
   * The capture time, on the page clock, of the first frame seen at or after the call to
   * `start()`. Undefined until such a frame has been seen.
   */
  firstFrameAt(): number | undefined {
    if (this.firstTimestampMs === undefined || !Number.isFinite(this.offsetMs)) return undefined;
    return this.firstTimestampMs - this.offsetMs;
  }

  stop(): void {
    this.stopped = true;
    this.options.source.cancel();
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      let frame: FrameStamp | undefined;
      try {
        frame = await this.options.source.read();
      } catch {
        return;
      }
      if (frame === undefined) return;
      const seenAt = this.options.now();
      const timestampMs = frame.timestampUs / 1000;
      this.offsetMs = Math.max(this.offsetMs, timestampMs - seenAt);
      if (
        this.calledAt !== undefined &&
        this.firstTimestampMs === undefined &&
        seenAt >= this.calledAt
      ) {
        this.firstTimestampMs = timestampMs;
      }
    }
  }
}
