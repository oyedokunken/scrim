import { describe, expect, it } from 'vitest';
import {
  ChunkWriter,
  type Chunk,
  type ChunkClock,
  type FileSink,
} from '../../src/main/recording/chunk-writer';

class FakeClock implements ChunkClock {
  time = 0;
  now(): number {
    return this.time;
  }
}

class FakeSink implements FileSink {
  readonly log: string[] = [];
  readonly written: number[] = [];
  failAppendWith: Error | undefined;
  failSyncWith: Error | undefined;
  failCloseWith: Error | undefined;
  holdAppend: Promise<void> | undefined;

  async append(data: Uint8Array): Promise<void> {
    if (this.holdAppend !== undefined) await this.holdAppend;
    if (this.failAppendWith !== undefined) throw this.failAppendWith;
    this.written.push(...data);
    this.log.push(`append:${String(data.byteLength)}`);
  }
  sync(): Promise<void> {
    if (this.failSyncWith !== undefined) return Promise.reject(this.failSyncWith);
    this.log.push('sync');
    return Promise.resolve();
  }
  close(): Promise<void> {
    if (this.failCloseWith !== undefined) return Promise.reject(this.failCloseWith);
    this.log.push('close');
    return Promise.resolve();
  }
}

const chunk = (seq: number, size = 4, fill = seq): Chunk => ({
  seq,
  byteLength: size,
  mediaTimeMs: seq * 1000,
  data: new Uint8Array(size).fill(fill),
});

const nodeError = (code: string, message = code): Error =>
  Object.assign(new Error(message), { code });

function setup(options: { syncIntervalMs?: number } = {}) {
  const sink = new FakeSink();
  const clock = new FakeClock();
  const synced: number[] = [];
  const failures: string[] = [];
  const writer = new ChunkWriter({
    sink,
    clock,
    ...options,
    onSynced: (bytes) => synced.push(bytes),
    onFailure: (failure) => failures.push(failure.code ?? failure.message),
  });
  return { sink, clock, writer, synced, failures };
}

describe('ChunkWriter ordering', () => {
  it('appends chunks in the order they were sent', async () => {
    const { sink, writer } = setup();
    for (let seq = 0; seq < 5; seq += 1) {
      await writer.write(chunk(seq, 2, seq + 10));
    }
    expect(sink.written).toEqual([10, 10, 11, 11, 12, 12, 13, 13, 14, 14]);
  });

  it('keeps order when writes are queued without waiting', async () => {
    const { sink, writer } = setup();
    const results = await Promise.all([0, 1, 2, 3].map((seq) => writer.write(chunk(seq, 1, seq))));
    expect(results.every((result) => result.status === 'written')).toBe(true);
    expect(sink.written).toEqual([0, 1, 2, 3]);
  });

  it('ignores a repeated chunk and counts it', async () => {
    const { sink, writer } = setup();
    await writer.write(chunk(0));
    await writer.write(chunk(1));
    const again = await writer.write(chunk(1));
    expect(again).toEqual({ status: 'duplicate', seq: 1 });
    expect(sink.written).toHaveLength(8);
    expect(writer.stats.duplicates).toBe(1);
  });

  it('writes a chunk after a gap and reports it', async () => {
    const { sink, writer } = setup();
    await writer.write(chunk(0));
    const outcome = await writer.write(chunk(3));
    expect(outcome).toEqual({
      status: 'written',
      issues: [{ kind: 'gap', expected: 1, got: 3 }],
    });
    expect(sink.written).toHaveLength(8);
    expect(writer.stats.gaps).toBe(1);
    const next = await writer.write(chunk(4));
    expect(next).toEqual({ status: 'written', issues: [] });
  });

  it('reports a declared size that differs from the data, and trusts the data', async () => {
    const { sink, writer } = setup();
    const outcome = await writer.write({ ...chunk(0, 4), byteLength: 9 });
    expect(outcome).toEqual({
      status: 'written',
      issues: [{ kind: 'length-mismatch', declared: 9, actual: 4 }],
    });
    expect(sink.written).toHaveLength(4);
    expect(writer.stats.bytesWritten).toBe(4);
  });
});

describe('ChunkWriter sync schedule', () => {
  it('syncs the first chunk, then at most once per interval', async () => {
    const { sink, clock, writer } = setup({ syncIntervalMs: 2000 });
    await writer.write(chunk(0));
    clock.time = 1000;
    await writer.write(chunk(1));
    clock.time = 1999;
    await writer.write(chunk(2));
    expect(sink.log.filter((entry) => entry === 'sync')).toHaveLength(1);
    clock.time = 2000;
    await writer.write(chunk(3));
    expect(sink.log.filter((entry) => entry === 'sync')).toHaveLength(2);
  });

  it('reports the byte count after each sync, for the heartbeat', async () => {
    const { clock, writer, synced } = setup();
    await writer.write(chunk(0, 10));
    clock.time = 2500;
    await writer.write(chunk(1, 5));
    expect(synced).toEqual([10, 15]);
    expect(writer.stats.lastSyncAt).toBe(2500);
  });

  it('syncs on flush even when the interval has not passed', async () => {
    const { sink, clock, writer } = setup();
    await writer.write(chunk(0));
    clock.time = 100;
    await writer.write(chunk(1));
    const before = sink.log.filter((entry) => entry === 'sync').length;
    await writer.flush();
    expect(sink.log.filter((entry) => entry === 'sync')).toHaveLength(before + 1);
    expect(sink.log.at(-1)).toBe('sync');
  });

  it('syncs before it closes, and closes once', async () => {
    const { sink, clock, writer } = setup();
    await writer.write(chunk(0));
    clock.time = 10;
    await writer.write(chunk(1));
    await writer.close();
    await writer.close();
    expect(sink.log.slice(-2)).toEqual(['sync', 'close']);
    expect(sink.log.filter((entry) => entry === 'close')).toHaveLength(1);
  });
});

describe('ChunkWriter queue and stats', () => {
  it('counts queued bytes while the disk is slow and empties it afterwards', async () => {
    const { sink, writer } = setup();
    let release: () => void = () => undefined;
    sink.holdAppend = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = writer.write(chunk(0, 100));
    const second = writer.write(chunk(1, 50));
    expect(writer.stats.queuedBytes).toBe(150);
    release();
    await Promise.all([first, second]);
    expect(writer.stats.queuedBytes).toBe(0);
    expect(writer.stats.bytesWritten).toBe(150);
    expect(writer.stats.chunksWritten).toBe(2);
  });
});

describe('ChunkWriter failures', () => {
  it('reports the first failure with its code, once, and then stops writing', async () => {
    const { sink, writer, failures } = setup();
    await writer.write(chunk(0));
    sink.failAppendWith = nodeError('ENOSPC', 'no space left on device');
    const failed = await writer.write(chunk(1));
    expect(failed).toEqual({
      status: 'failed',
      failure: { code: 'ENOSPC', message: 'no space left on device' },
    });
    sink.failAppendWith = undefined;
    const after = await writer.write(chunk(2));
    expect(after.status).toBe('failed');
    expect(failures).toEqual(['ENOSPC']);
    expect(writer.failed?.code).toBe('ENOSPC');
    expect(writer.stats.queuedBytes).toBe(0);
  });

  it('fails the queued writes behind a failed one without appending them', async () => {
    const { sink, writer } = setup();
    sink.failAppendWith = nodeError('EIO');
    const outcomes = await Promise.all([0, 1, 2].map((seq) => writer.write(chunk(seq))));
    expect(outcomes.every((outcome) => outcome.status === 'failed')).toBe(true);
    expect(sink.written).toEqual([]);
  });

  it('turns a failing sync into a failure', async () => {
    const { sink, writer } = setup();
    sink.failSyncWith = nodeError('EIO');
    const outcome = await writer.write(chunk(0));
    expect(outcome.status).toBe('failed');
    expect(writer.failed?.code).toBe('EIO');
  });

  it('fails a flush after a failure and still closes the sink', async () => {
    const { sink, writer } = setup();
    sink.failAppendWith = nodeError('ENOENT');
    await writer.write(chunk(0));
    expect((await writer.flush()).status).toBe('failed');
    const closed = await writer.close();
    expect(closed.status).toBe('failed');
    expect(sink.log).toEqual(['close']);
  });

  it('reports a failing close', async () => {
    const { sink, writer } = setup();
    await writer.write(chunk(0));
    sink.failCloseWith = nodeError('EIO');
    const outcome = await writer.close();
    expect(outcome.status).toBe('failed');
  });

  it('handles an error that is not an Error object', async () => {
    const { sink, writer } = setup();
    sink.append = () => Promise.reject(new Error('plain'));
    const outcome = await writer.write(chunk(0));
    expect(outcome).toEqual({ status: 'failed', failure: { code: undefined, message: 'plain' } });
  });
});
