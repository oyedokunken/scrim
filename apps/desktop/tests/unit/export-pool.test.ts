import { computeLayout } from '@scrim/core/render';
import { describe, expect, it } from 'vitest';
import { Compositor } from '../../src/main/export/compositor';
import type { FrameInput } from '../../src/main/export/compositor';
import { cursorPaintFor } from '../../src/main/export/look';
import {
  createInlineBackend,
  createWorkerBackend,
  createWorkerHandler,
  workerCount,
} from '../../src/main/export/render-pool';
import type {
  WorkerFrame,
  WorkerInit,
  WorkerLike,
  WorkerReply,
} from '../../src/main/export/render-pool';
import { buildBase } from '../../src/main/export/raster';

const source = { width: 96, height: 54 };
const output = { width: 160, height: 90 };
const layout = computeLayout(source, output, {
  spec: { kind: 'preset', id: 'dots' },
  paddingShare: 0.08,
  radiusShare: 0.1,
});
const paint = cursorPaintFor('brand');

/** A worker that runs the real handler in this thread, one message at a time, a tick later. */
function fakeWorker(failOn?: number): WorkerLike {
  let onMessage: (reply: WorkerReply) => void = () => undefined;
  let onError: (error: Error) => void = () => undefined;
  const handle = createWorkerHandler((reply) => {
    setTimeout(() => {
      onMessage(reply);
    }, 1);
  });
  return {
    postMessage: (message: WorkerInit | WorkerFrame) => {
      if (message.type === 'frame' && message.id === failOn) {
        setTimeout(() => {
          onError(new Error('thread died'));
        }, 1);
        return;
      }
      handle(message);
    },
    on: ((event: 'message' | 'error', listener: never) => {
      if (event === 'message') onMessage = listener;
      else onError = listener;
    }) as WorkerLike['on'],
    terminate: () => undefined,
  };
}

function picture(seed: number, size: { width: number; height: number }): Uint8Array {
  const data = new Uint8Array(size.width * size.height * 4);
  for (let i = 0; i < data.length; i += 1) data[i] = (i * 7 + seed * 31) & 255;
  return data;
}

function input(seed: number): FrameInput {
  return {
    screen: picture(seed, source),
    camera: picture(seed + 1, { width: 16, height: 16 }),
    cameraSize: 16,
    view: { x: seed * 2.5, y: seed, width: 80, height: 45 },
    cursor: { halo: { x: 40 + seed, y: 20, radius: 5 }, ripples: [] },
    bubble: { x: 100, y: 50, side: 24, radius: 12 },
  };
}

describe('drawing threads', () => {
  it('draw exactly the bytes that one thread draws, in any order they finish', async () => {
    const base = buildBase(layout);
    const inline = createInlineBackend(new Compositor(layout, source, base, paint));
    const pool = createWorkerBackend({
      count: 3,
      spawn: () => fakeWorker(),
      layout,
      source,
      base,
      paint,
    });
    const jobs = [0, 1, 2, 3, 4, 5, 6].map(async (seed) => {
      const expected = new Uint8Array(output.width * output.height * 4);
      await inline.render(input(seed), expected);
      const got = pool.alloc(output.width * output.height * 4);
      await pool.render(input(seed), got);
      return { expected, got };
    });
    for (const { expected, got } of await Promise.all(jobs)) {
      expect(Buffer.compare(Buffer.from(expected), got)).toBe(0);
    }
    await pool.close();
  });

  it('rejects the picture and the pictures after it when a thread dies', async () => {
    const base = buildBase(layout);
    const pool = createWorkerBackend({
      count: 2,
      spawn: () => fakeWorker(2),
      layout,
      source,
      base,
      paint,
    });
    const out = pool.alloc(output.width * output.height * 4);
    await pool.render(input(0), out);
    await expect(pool.render(input(1), out)).rejects.toThrow('thread died');
    await expect(pool.render(input(2), out)).rejects.toThrow('thread died');
  });

  it('uses all cores but one, at least two and at most six', () => {
    expect(workerCount(1)).toBe(2);
    expect(workerCount(4)).toBe(3);
    expect(workerCount(8)).toBe(6);
    expect(workerCount(32)).toBe(6);
  });
});
