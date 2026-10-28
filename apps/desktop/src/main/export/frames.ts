import type { Readable } from 'node:stream';

/**
 * Cuts a byte stream into pictures of a fixed size. The stream is read only as fast as the
 * pictures are taken, so a fast decoder waits for a slow compositor instead of filling memory.
 */
export class FrameReader {
  private readonly iterator: AsyncIterator<unknown>;
  private leftover: Buffer = Buffer.alloc(0);

  constructor(
    stream: Readable,
    readonly frameBytes: number,
  ) {
    this.iterator = stream[Symbol.asyncIterator]();
  }

  /** The next whole picture, or null when the stream ended. A partial last picture is dropped. */
  async next(): Promise<Buffer | null> {
    const frame = Buffer.allocUnsafe(this.frameBytes);
    let have = 0;
    while (have < this.frameBytes) {
      if (this.leftover.length === 0) {
        let result: IteratorResult<unknown>;
        try {
          result = await this.iterator.next();
        } catch {
          return null;
        }
        if (result.done === true) return null;
        this.leftover = Buffer.isBuffer(result.value)
          ? result.value
          : Buffer.from(result.value as Uint8Array);
        continue;
      }
      const take = Math.min(this.frameBytes - have, this.leftover.length);
      this.leftover.copy(frame, have, 0, take);
      have += take;
      this.leftover = this.leftover.subarray(take);
    }
    return frame;
  }
}

/**
 * Gives the picture for a frame number, moving forward only. Asking for a number past the end
 * returns the last picture, which is how the final frame is held until the recording stopped.
 */
export class FrameCursor {
  private index = -1;
  private frame: Buffer | null = null;
  private ended = false;

  constructor(private readonly reader: FrameReader) {}

  async at(wanted: number): Promise<Buffer | null> {
    while (!this.ended && this.index < wanted) {
      const next = await this.reader.next();
      if (next === null) {
        this.ended = true;
        break;
      }
      this.frame = next;
      this.index += 1;
    }
    return this.frame;
  }

  /** True when the decoder ended before it gave a single picture. */
  get empty(): boolean {
    return this.ended && this.frame === null;
  }
}
