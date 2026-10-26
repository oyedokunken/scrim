/** The source of time and frames. The browser provides one, tests provide a manual one. */
export interface Clock {
  /** Milliseconds, from any fixed starting point. */
  now(): number;
  /** Calls back once, at the next frame. Returns a handle for `cancelFrame`. */
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
}

export const browserClock: Clock = {
  now: () => performance.now(),
  requestFrame: (callback) =>
    requestAnimationFrame(() => {
      callback();
    }),
  cancelFrame: (handle) => {
    cancelAnimationFrame(handle);
  },
};

/** A long gap means the tab slept. Time then moves on by a little, not by the whole gap. */
const MAX_STEP_MS = 250;

export interface DemoPlayerOptions {
  /** Length of one loop. */
  durationMs: number;
  clock: Clock;
  /** Called with the position in the loop each frame, and after a seek or refresh. */
  onFrame: (timeMs: number) => void;
}

/**
 * Plays a looping timeline. It keeps its position when paused and resumes from the same place.
 * It reads time only from the injected clock, so a test can step it deterministically.
 */
export class DemoPlayer {
  private position = 0;
  private lastNow: number | null = null;
  private handle: number | null = null;

  constructor(private readonly options: DemoPlayerOptions) {
    if (!(options.durationMs > 0)) {
      throw new RangeError('The loop must have a positive duration.');
    }
  }

  get isPlaying(): boolean {
    return this.handle !== null;
  }

  /** The position in the loop, in milliseconds. */
  get time(): number {
    return this.position;
  }

  play(): void {
    if (this.isPlaying) {
      return;
    }
    this.lastNow = this.options.clock.now();
    this.schedule();
  }

  pause(): void {
    if (this.handle !== null) {
      this.options.clock.cancelFrame(this.handle);
      this.handle = null;
    }
    this.lastNow = null;
  }

  /** Jumps to a position, wrapping around the loop, and draws it. */
  seek(timeMs: number): void {
    const { durationMs } = this.options;
    this.position = ((timeMs % durationMs) + durationMs) % durationMs;
    this.options.onFrame(this.position);
  }

  /** Draws the current position again, for example after a setting changed. */
  refresh(): void {
    this.options.onFrame(this.position);
  }

  dispose(): void {
    this.pause();
  }

  private schedule(): void {
    this.handle = this.options.clock.requestFrame(() => {
      this.tick();
    });
  }

  private tick(): void {
    const now = this.options.clock.now();
    const step = Math.min(Math.max(0, now - (this.lastNow ?? now)), MAX_STEP_MS);
    this.lastNow = now;
    this.position = (this.position + step) % this.options.durationMs;
    this.options.onFrame(this.position);
    this.schedule();
  }
}
