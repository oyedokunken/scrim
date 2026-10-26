/** Where a track's bytes go. The real one is a file opened for append. Tests use a fake. */
export interface FileSink {
  append(data: Uint8Array): Promise<void>;
  /** Forces what was appended to the disk. */
  sync(): Promise<void>;
  close(): Promise<void>;
}

/** Milliseconds from any steady clock. Injected so the sync schedule is testable. */
export interface ChunkClock {
  now(): number;
}

/** One piece of a track as the recorder page sent it. */
export interface Chunk {
  seq: number;
  /** The size the sender says the data has. A mismatch is reported, never trusted. */
  byteLength: number;
  mediaTimeMs: number;
  data: Uint8Array;
}

type ChunkIssue =
  | { kind: 'gap'; expected: number; got: number }
  | { kind: 'length-mismatch'; declared: number; actual: number };

export interface WriterFailure {
  /** The Node error code, such as `ENOSPC`, when there is one. */
  code: string | undefined;
  message: string;
}

export type WriteOutcome =
  | { status: 'written'; issues: ChunkIssue[] }
  | { status: 'duplicate'; seq: number }
  | { status: 'failed'; failure: WriterFailure };

export interface WriterStats {
  bytesWritten: number;
  chunksWritten: number;
  gaps: number;
  duplicates: number;
  /** Bytes accepted but not yet appended. High means a slow disk or a stuck write. */
  queuedBytes: number;
  lastSyncAt: number | null;
}

export interface ChunkWriterOptions {
  sink: FileSink;
  clock: ChunkClock;
  /** The longest time between syncs while chunks arrive. At most this much is ever unsynced. */
  syncIntervalMs?: number;
  /** Called after every sync with the bytes written so far, for the session heartbeat. */
  onSynced?: (bytesWritten: number) => void;
  /** Called once, with the first failure. The writer stops writing after it. */
  onFailure?: (failure: WriterFailure) => void;
}

const DEFAULT_SYNC_INTERVAL_MS = 2000;
/** Above this many queued bytes the UI should warn that the disk cannot keep up. */
export const QUEUE_WARNING_BYTES = 64 * 1024 * 1024;

function toFailure(error: unknown): WriterFailure {
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
    return { code, message };
  }
  return { code: undefined, message: String(error) };
}

/**
 * Writes one track's chunks to a sink, in order. Appends are queued so they never overlap, a
 * sync follows whenever the interval has passed, and `flush` and `close` always sync. Chunk
 * numbers must be contiguous from zero: a repeated number is ignored, a skipped number is
 * written anyway and reported as a gap. After the first I/O failure the writer stops and every
 * later write reports the same failure, so nothing is half written out of order.
 */
export class ChunkWriter {
  private readonly sink: FileSink;
  private readonly clock: ChunkClock;
  private readonly syncIntervalMs: number;
  private readonly onSynced: ((bytesWritten: number) => void) | undefined;
  private readonly onFailure: ((failure: WriterFailure) => void) | undefined;

  private expectedSeq = 0;
  private bytesWritten = 0;
  private chunksWritten = 0;
  private gaps = 0;
  private duplicates = 0;
  private queuedBytes = 0;
  private lastSyncAt: number | null = null;
  private unsyncedBytes = 0;
  private failure: WriterFailure | undefined;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: ChunkWriterOptions) {
    this.sink = options.sink;
    this.clock = options.clock;
    this.syncIntervalMs = options.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    this.onSynced = options.onSynced;
    this.onFailure = options.onFailure;
  }

  get stats(): WriterStats {
    return {
      bytesWritten: this.bytesWritten,
      chunksWritten: this.chunksWritten,
      gaps: this.gaps,
      duplicates: this.duplicates,
      queuedBytes: this.queuedBytes,
      lastSyncAt: this.lastSyncAt,
    };
  }

  get failed(): WriterFailure | undefined {
    return this.failure;
  }

  /** Queues a chunk and resolves once it has been appended, and synced if a sync was due. */
  write(chunk: Chunk): Promise<WriteOutcome> {
    if (this.failure !== undefined) {
      return Promise.resolve({ status: 'failed', failure: this.failure });
    }
    if (chunk.seq < this.expectedSeq) {
      this.duplicates += 1;
      return Promise.resolve({ status: 'duplicate', seq: chunk.seq });
    }

    const issues: ChunkIssue[] = [];
    if (chunk.seq > this.expectedSeq) {
      this.gaps += 1;
      issues.push({ kind: 'gap', expected: this.expectedSeq, got: chunk.seq });
    }
    if (chunk.byteLength !== chunk.data.byteLength) {
      issues.push({
        kind: 'length-mismatch',
        declared: chunk.byteLength,
        actual: chunk.data.byteLength,
      });
    }
    this.expectedSeq = chunk.seq + 1;
    const size = chunk.data.byteLength;
    this.queuedBytes += size;

    return this.enqueue(async (): Promise<WriteOutcome> => {
      try {
        if (this.failure !== undefined) return { status: 'failed', failure: this.failure };
        await this.sink.append(chunk.data);
        this.bytesWritten += size;
        this.chunksWritten += 1;
        this.unsyncedBytes += size;
        if (this.syncDue()) await this.syncNow();
        return { status: 'written', issues };
      } catch (error) {
        return { status: 'failed', failure: this.fail(error) };
      } finally {
        this.queuedBytes -= size;
      }
    });
  }

  /** Syncs everything written so far. Used on pause and stop. */
  flush(): Promise<WriteOutcome | { status: 'flushed' }> {
    return this.enqueue(async () => {
      if (this.failure !== undefined) return { status: 'failed' as const, failure: this.failure };
      try {
        await this.syncNow();
        return { status: 'flushed' as const };
      } catch (error) {
        return { status: 'failed' as const, failure: this.fail(error) };
      }
    });
  }

  /** Final sync, then closes the sink. Safe to call twice, and after a failure. */
  close(): Promise<WriteOutcome | { status: 'flushed' }> {
    return this.enqueue(async () => {
      if (this.closed) return { status: 'flushed' as const };
      this.closed = true;
      let outcome: WriteOutcome | { status: 'flushed' } = { status: 'flushed' };
      if (this.failure === undefined) {
        try {
          await this.syncNow();
        } catch (error) {
          outcome = { status: 'failed', failure: this.fail(error) };
        }
      } else {
        outcome = { status: 'failed', failure: this.failure };
      }
      try {
        await this.sink.close();
      } catch (error) {
        if (outcome.status !== 'failed') outcome = { status: 'failed', failure: this.fail(error) };
      }
      return outcome;
    });
  }

  private syncDue(): boolean {
    if (this.unsyncedBytes === 0) return false;
    return this.lastSyncAt === null || this.clock.now() - this.lastSyncAt >= this.syncIntervalMs;
  }

  private async syncNow(): Promise<void> {
    await this.sink.sync();
    this.lastSyncAt = this.clock.now();
    this.unsyncedBytes = 0;
    this.onSynced?.(this.bytesWritten);
  }

  private fail(error: unknown): WriterFailure {
    if (this.failure === undefined) {
      this.failure = toFailure(error);
      this.onFailure?.(this.failure);
    }
    return this.failure;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
