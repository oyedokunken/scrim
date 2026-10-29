import { parentPort } from 'node:worker_threads';
import { createWorkerHandler } from './render-pool';
import type { WorkerFrame, WorkerInit } from './render-pool';

// The entry of one drawing thread. All the work is in render-pool.ts.
const port = parentPort;
if (port !== null) {
  const handle = createWorkerHandler((reply) => {
    port.postMessage(reply);
  });
  port.on('message', (message: WorkerInit | WorkerFrame) => {
    handle(message);
  });
}
