import { createMoveCoalescer, formatInputLine, type RawInputEvent } from '@scrim/core';
import type { ChunkWriter, ChunkClock } from './chunk-writer';
import type { InputSource, InputStartResult } from './input-source';

export interface InputRecorderOptions {
  source: InputSource;
  /** The main recording clock, in milliseconds since the recording began. */
  clock: ChunkClock;
  /** Opens `input.ndjson`. Called only once the hook has started, so a recording without a hook leaves no file. */
  openWriter: () => Promise<ChunkWriter>;
  /** How many bytes of lines to collect before writing them. */
  batchBytes?: number;
  /** The longest a line waits before it is written, checked as events arrive and on `tick`. */
  batchMs?: number;
}

const DEFAULT_BATCH_BYTES = 8 * 1024;
const DEFAULT_BATCH_MS = 250;

/**
 * Writes the mouse log while a recording runs: each event is stamped on the main clock, thinned
 * to 120 moves a second, turned into a line and appended to `input.ndjson` through the same
 * writer that handles the video tracks, so it is synced on the same schedule and on every pause
 * and stop. Events that arrive while paused are dropped here and again when the log is converted.
 */
export class InputRecorder {
  private readonly options: InputRecorderOptions;
  private readonly encoder = new TextEncoder();
  private readonly coalescer = createMoveCoalescer();
  private writer: ChunkWriter | undefined;
  private paused = false;
  private lines = '';
  private firstLineAt = 0;
  private seq = 0;
  private events = 0;

  constructor(options: InputRecorderOptions) {
    this.options = options;
  }

  get eventCount(): number {
    return this.events;
  }

  get bytesWritten(): number {
    return this.writer?.stats.bytesWritten ?? 0;
  }

  /** Starts the hook. When it cannot start, nothing is written and the reason comes back. */
  async start(): Promise<InputStartResult> {
    const result = await this.options.source.start((event) => {
      if (this.paused || this.writer === undefined) return;
      this.accept({ ...event, at: this.options.clock.now() });
    });
    if (result.status !== 'started') return result;
    try {
      this.writer = await this.options.openWriter();
    } catch (error) {
      this.options.source.stop();
      return {
        status: 'unavailable',
        reason: 'error',
        detail: error instanceof Error ? error.message : 'The input log could not be opened.',
      };
    }
    return result;
  }

  /** Writes what is waiting if it has waited long enough. The service calls this on its heartbeat. */
  tick(): void {
    if (this.lines !== '' && this.options.clock.now() - this.firstLineAt >= this.batchMs()) {
      this.writeBatch();
    }
  }

  /** Stops logging, writes everything and syncs. Events are dropped until `resume`. */
  async pause(): Promise<void> {
    this.paused = true;
    await this.drain();
  }

  resume(): void {
    this.paused = false;
  }

  /** Stops the hook, writes everything, syncs and closes the file. */
  async stop(): Promise<void> {
    this.options.source.stop();
    this.paused = true;
    await this.drain();
    await this.writer?.close();
  }

  private accept(event: RawInputEvent): void {
    for (const kept of this.coalescer.push(event)) this.append(kept);
    if (this.lines.length >= (this.options.batchBytes ?? DEFAULT_BATCH_BYTES)) this.writeBatch();
    else this.tick();
  }

  private append(event: RawInputEvent): void {
    if (this.lines === '') this.firstLineAt = this.options.clock.now();
    this.lines += formatInputLine(event);
    this.events += 1;
  }

  private batchMs(): number {
    return this.options.batchMs ?? DEFAULT_BATCH_MS;
  }

  private async drain(): Promise<void> {
    for (const held of this.coalescer.flush()) this.append(held);
    this.writeBatch();
    await this.writer?.flush();
  }

  private writeBatch(): void {
    if (this.lines === '' || this.writer === undefined) return;
    const data = this.encoder.encode(this.lines);
    this.lines = '';
    void this.writer.write({
      seq: this.seq,
      byteLength: data.byteLength,
      mediaTimeMs: this.options.clock.now(),
      data,
    });
    this.seq += 1;
  }
}
