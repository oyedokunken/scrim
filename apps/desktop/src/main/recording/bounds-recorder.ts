import { formatBoundsLine } from '@scrim/core';
import type { ChunkClock, ChunkWriter } from './chunk-writer';
import type { BoundsStartResult, WindowBoundsSource, WindowRect } from './window-bounds-source';

export interface BoundsRecorderOptions {
  source: WindowBoundsSource;
  /** The main recording clock, in milliseconds since the recording began. */
  clock: ChunkClock;
  /** Opens `window-bounds.ndjson`. Called only once the source has started. */
  openWriter: () => Promise<ChunkWriter>;
}

/**
 * Writes the window's position to `window-bounds.ndjson` each time it changes, stamped on the main
 * clock, through the same kind of writer as the video tracks so it survives a crash. A rectangle
 * that repeats the one before it is not written again.
 */
export class BoundsRecorder {
  private readonly options: BoundsRecorderOptions;
  private readonly encoder = new TextEncoder();
  private writer: ChunkWriter | undefined;
  private last: WindowRect | undefined;
  private seq = 0;
  private samples = 0;

  constructor(options: BoundsRecorderOptions) {
    this.options = options;
  }

  get sampleCount(): number {
    return this.samples;
  }

  async start(): Promise<BoundsStartResult> {
    const result = await this.options.source.start((rect) => {
      this.accept(rect);
    });
    if (result.status !== 'started') return result;
    try {
      this.writer = await this.options.openWriter();
    } catch (error) {
      this.options.source.stop();
      return {
        status: 'unavailable',
        detail: error instanceof Error ? error.message : 'The window log could not be opened.',
      };
    }
    return result;
  }

  async stop(): Promise<void> {
    this.options.source.stop();
    await this.writer?.close();
  }

  private accept(rect: WindowRect): void {
    const writer = this.writer;
    if (writer === undefined) return;
    const previous = this.last;
    if (
      previous !== undefined &&
      previous.x === rect.x &&
      previous.y === rect.y &&
      previous.width === rect.width &&
      previous.height === rect.height
    ) {
      return;
    }
    this.last = rect;
    const at = this.options.clock.now();
    const data = this.encoder.encode(formatBoundsLine({ at, ...rect }));
    void writer.write({ seq: this.seq, byteLength: data.byteLength, mediaTimeMs: at, data });
    this.seq += 1;
    this.samples += 1;
  }
}
