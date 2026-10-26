import type { Clock } from '@/lib/demo/player';

/** A clock that only moves when a test says so. One frame lasts 16 milliseconds. */
export class ManualClock implements Clock {
  private time = 0;
  private nextHandle = 1;
  private queue = new Map<number, () => void>();

  now(): number {
    return this.time;
  }

  requestFrame(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.queue.set(handle, callback);
    return handle;
  }

  cancelFrame(handle: number): void {
    this.queue.delete(handle);
  }

  /** Number of frames waiting to run. */
  get pending(): number {
    return this.queue.size;
  }

  /** Moves time forward by whole frames, running each frame's callbacks. */
  advance(ms: number, frameMs = 16): void {
    let remaining = ms;
    while (remaining > 0) {
      const step = Math.min(frameMs, remaining);
      this.time += step;
      remaining -= step;
      const due = [...this.queue.entries()];
      this.queue.clear();
      for (const [, callback] of due) {
        callback();
      }
    }
  }

  /** Jumps time forward without running any frame, as a sleeping tab would. */
  skip(ms: number): void {
    this.time += ms;
  }
}
