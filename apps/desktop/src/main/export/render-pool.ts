import type { Layout } from '@scrim/core/render';
import type { Frame } from '@scrim/core';
import { Compositor } from './compositor';
import type { CursorPaint, FrameInput } from './compositor';

/** What a worker is told once, before any picture. `base` is shared memory. */
export interface WorkerInit {
  type: 'init';
  layout: Layout;
  source: Frame;
  base: SharedArrayBuffer;
  paint: CursorPaint;
}

/** One picture to draw. The big arrays are shared memory, so nothing is copied. */
export interface WorkerFrame {
  type: 'frame';
  id: number;
  screen: SharedArrayBuffer;
  camera: SharedArrayBuffer | null;
  cameraSize: number;
  view: FrameInput['view'];
  cursor: FrameInput['cursor'];
  bubble: FrameInput['bubble'];
  texts?: FrameInput['texts'];
  out: SharedArrayBuffer;
}

export type WorkerReply =
  { type: 'done'; id: number } | { type: 'error'; id: number; message: string };

/** The few parts of a worker thread the pool uses, so a test can stand in for one. */
export interface WorkerLike {
  postMessage: (message: WorkerInit | WorkerFrame) => void;
  on: {
    (event: 'message', listener: (reply: WorkerReply) => void): unknown;
    (event: 'error', listener: (error: Error) => void): unknown;
    (event: 'exit', listener: (code: number) => void): unknown;
  };
  terminate: () => unknown;
}

export interface RenderBackend {
  /** Memory for one picture. Shared memory when pictures are drawn on other threads. */
  alloc: (bytes: number) => Buffer;
  render: (input: FrameInput, out: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  /** How many pictures are drawn at once. */
  readonly parallel: number;
}

/** Draws on the calling thread. Used in tests, and for the retry with safer settings. */
export function createInlineBackend(compositor: Compositor): RenderBackend {
  return {
    alloc: (bytes) => Buffer.allocUnsafe(bytes),
    render: (input, out) => {
      compositor.render(input, out);
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
    parallel: 1,
  };
}

/** Number of threads: all cores but one, at least two, at most six. */
export function workerCount(cores: number): number {
  return Math.min(6, Math.max(2, cores - 1));
}

function shared(bytes: Uint8Array): SharedArrayBuffer {
  if (bytes.buffer instanceof SharedArrayBuffer && bytes.byteOffset === 0) {
    return bytes.buffer;
  }
  const copy = new SharedArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/**
 * Pictures are drawn by several worker threads at once, each picture whole, so the result is
 * the same bytes as drawing them one after another. The caller keeps the order.
 */
export function createWorkerBackend(options: {
  count: number;
  spawn: () => WorkerLike;
  layout: Layout;
  source: Frame;
  base: Uint8Array;
  paint: CursorPaint;
}): RenderBackend {
  const baseShared = shared(options.base);
  const workers: WorkerLike[] = [];
  const idle: WorkerLike[] = [];
  const waiting: ((worker: WorkerLike) => void)[] = [];
  const running = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  let nextId = 0;
  let failure: Error | undefined;
  let closing = false;
  // Read through a function so the checks around awaits are not narrowed away.
  const failed = (): Error | undefined => failure;

  const release = (worker: WorkerLike): void => {
    const next = waiting.shift();
    if (next === undefined) idle.push(worker);
    else next(worker);
  };
  const failAll = (error: Error): void => {
    failure = error;
    for (const task of running.values()) task.reject(error);
    running.clear();
  };

  for (let i = 0; i < options.count; i += 1) {
    const worker = options.spawn();
    worker.on('message', (reply) => {
      const task = running.get(reply.id);
      running.delete(reply.id);
      if (task !== undefined) {
        if (reply.type === 'done') task.resolve();
        else task.reject(new Error(reply.message));
      }
      release(worker);
    });
    worker.on('error', (error) => {
      failAll(error);
    });
    // A thread that ends on its own would leave its picture waiting for ever.
    worker.on('exit', () => {
      if (!closing) failAll(new Error('A drawing thread stopped.'));
    });
    worker.postMessage({
      type: 'init',
      layout: options.layout,
      source: options.source,
      base: baseShared,
      paint: options.paint,
    });
    workers.push(worker);
    idle.push(worker);
  }

  const take = (): Promise<WorkerLike> => {
    const worker = idle.pop();
    return worker === undefined
      ? new Promise((resolve) => {
          waiting.push(resolve);
        })
      : Promise.resolve(worker);
  };

  return {
    alloc: (bytes) => Buffer.from(new SharedArrayBuffer(bytes)),
    parallel: options.count,
    async render(input, out) {
      const before = failed();
      if (before !== undefined) throw before;
      const worker = await take();
      const after = failed();
      if (after !== undefined) throw after;
      const id = (nextId += 1);
      const done = new Promise<void>((resolve, reject) => {
        running.set(id, { resolve, reject });
      });
      worker.postMessage({
        type: 'frame',
        id,
        screen: shared(input.screen),
        camera: input.camera === null ? null : shared(input.camera),
        cameraSize: input.cameraSize,
        view: input.view,
        cursor: input.cursor,
        bubble: input.bubble,
        ...(input.texts === undefined || input.texts.length === 0 ? {} : { texts: input.texts }),
        out: shared(out),
      });
      await done;
    },
    async close() {
      closing = true;
      await Promise.all(workers.map((worker) => worker.terminate()));
    },
  };
}

/** The drawing a worker thread does for one message. Kept here so tests can run it in process. */
export function createWorkerHandler(
  reply: (message: WorkerReply) => void,
): (message: WorkerInit | WorkerFrame) => void {
  let compositor: Compositor | undefined;
  return (message) => {
    if (message.type === 'init') {
      compositor = new Compositor(
        message.layout,
        message.source,
        new Uint8Array(message.base),
        message.paint,
      );
      return;
    }
    try {
      if (compositor === undefined) throw new Error('The drawing thread was not set up.');
      compositor.render(
        {
          screen: new Uint8Array(message.screen),
          camera: message.camera === null ? null : new Uint8Array(message.camera),
          cameraSize: message.cameraSize,
          view: message.view,
          cursor: message.cursor,
          bubble: message.bubble,
          texts: message.texts,
        },
        new Uint8Array(message.out),
      );
      reply({ type: 'done', id: message.id });
    } catch (error) {
      reply({
        type: 'error',
        id: message.id,
        message: error instanceof Error ? error.message : 'drawing failed',
      });
    }
  };
}
