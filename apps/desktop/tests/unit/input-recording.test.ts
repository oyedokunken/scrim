import { parseInputNdjson } from '@scrim/core';
import { describe, expect, it } from 'vitest';
import { ChunkWriter, type ChunkClock, type FileSink } from '../../src/main/recording/chunk-writer';
import { InputRecorder } from '../../src/main/recording/input-recorder';
import {
  buttonName,
  createHookSource,
  type HookPayload,
  type HookSourceDeps,
  type InputSource,
  type UnstampedEvent,
} from '../../src/main/recording/input-source';

class MemorySink implements FileSink {
  text = '';
  syncs = 0;
  closed = false;
  append(data: Uint8Array): Promise<void> {
    this.text += new TextDecoder().decode(data);
    return Promise.resolve();
  }
  sync(): Promise<void> {
    this.syncs += 1;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

class Clock implements ChunkClock {
  time = 0;
  now(): number {
    return this.time;
  }
}

class FakeSource implements InputSource {
  listener: ((event: UnstampedEvent) => void) | undefined;
  stopped = false;
  result: Awaited<ReturnType<InputSource['start']>> = { status: 'started' };
  start(onEvent: (event: UnstampedEvent) => void): ReturnType<InputSource['start']> {
    this.listener = onEvent;
    return Promise.resolve(this.result);
  }
  stop(): void {
    this.stopped = true;
  }
}

function recorderSetup() {
  const source = new FakeSource();
  const sink = new MemorySink();
  const clock = new Clock();
  const writer = new ChunkWriter({ sink, clock });
  const recorder = new InputRecorder({ source, clock, openWriter: () => Promise.resolve(writer) });
  return { source, sink, clock, recorder };
}

describe('InputRecorder', () => {
  it('stamps events on the main clock and writes them as lines', async () => {
    const { source, sink, clock, recorder } = recorderSetup();
    await recorder.start();
    clock.time = 100;
    source.listener?.({ type: 'move', x: 10, y: 20 });
    clock.time = 150;
    source.listener?.({ type: 'down', x: 10, y: 20, button: 'left' });
    await recorder.stop();
    const parsed = parseInputNdjson(sink.text);
    expect(parsed.events).toEqual([
      { type: 'move', at: 100, x: 10, y: 20 },
      { type: 'down', at: 150, x: 10, y: 20, button: 'left' },
    ]);
    expect(sink.closed).toBe(true);
    expect(source.stopped).toBe(true);
  });

  it('thins fast moves but keeps the last position before a click', async () => {
    const { source, sink, clock, recorder } = recorderSetup();
    await recorder.start();
    for (let t = 0; t < 40; t += 1) {
      clock.time = t;
      source.listener?.({ type: 'move', x: t, y: t });
    }
    clock.time = 40;
    source.listener?.({ type: 'down', x: 39, y: 39, button: 'left' });
    await recorder.stop();
    const { events } = parseInputNdjson(sink.text);
    expect(events.filter((event) => event.type === 'move').length).toBeLessThan(10);
    expect(events.at(-2)).toMatchObject({ type: 'move', x: 39 });
    expect(events.at(-1)?.type).toBe('down');
  });

  it('drops events while paused, flushes and syncs on pause, and carries on after resume', async () => {
    const { source, sink, clock, recorder } = recorderSetup();
    await recorder.start();
    clock.time = 10;
    source.listener?.({ type: 'down', x: 1, y: 1, button: 'left' });
    const before = sink.syncs;
    await recorder.pause();
    expect(sink.syncs).toBeGreaterThan(before);
    expect(parseInputNdjson(sink.text).events).toHaveLength(1);
    clock.time = 20;
    source.listener?.({ type: 'down', x: 2, y: 2, button: 'left' });
    recorder.resume();
    clock.time = 30;
    source.listener?.({ type: 'down', x: 3, y: 3, button: 'left' });
    await recorder.stop();
    expect(parseInputNdjson(sink.text).events.map((event) => event.at)).toEqual([10, 30]);
  });

  it('writes a batch on tick once the lines have waited long enough', async () => {
    const { source, sink, clock, recorder } = recorderSetup();
    await recorder.start();
    clock.time = 1000;
    source.listener?.({ type: 'down', x: 1, y: 1, button: 'left' });
    expect(sink.text).toBe('');
    clock.time = 1300;
    recorder.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parseInputNdjson(sink.text).events).toHaveLength(1);
    expect(recorder.eventCount).toBe(1);
    expect(recorder.bytesWritten).toBeGreaterThan(0);
  });

  it('writes nothing and creates no file when the hook is unavailable', async () => {
    const source = new FakeSource();
    source.result = { status: 'unavailable', reason: 'permission' };
    let opened = false;
    const recorder = new InputRecorder({
      source,
      clock: new Clock(),
      openWriter: () => {
        opened = true;
        return Promise.reject(new Error('should not open'));
      },
    });
    expect(await recorder.start()).toEqual({ status: 'unavailable', reason: 'permission' });
    expect(opened).toBe(false);
    await recorder.stop();
  });

  it('reports unavailable and stops the hook when the file cannot be opened', async () => {
    const source = new FakeSource();
    const recorder = new InputRecorder({
      source,
      clock: new Clock(),
      openWriter: () => Promise.reject(new Error('EACCES')),
    });
    const result = await recorder.start();
    expect(result).toMatchObject({ status: 'unavailable', reason: 'error', detail: 'EACCES' });
    expect(source.stopped).toBe(true);
  });

  it('ignores events that arrive before the file is open', async () => {
    const { source, recorder, sink } = recorderSetup();
    const pending = recorder.start();
    source.listener?.({ type: 'down', x: 1, y: 1, button: 'left' });
    await pending;
    await recorder.stop();
    expect(sink.text).toBe('');
  });
});

describe('createHookSource', () => {
  class FakeHook {
    handlers = new Map<string, (payload: HookPayload) => void>();
    started = false;
    stopped = false;
    listenersRemoved = false;
    failStart = false;
    on(event: string, listener: (payload: HookPayload) => void): this {
      this.handlers.set(event, listener);
      return this;
    }
    removeAllListeners(): this {
      this.listenersRemoved = true;
      return this;
    }
    start(): void {
      if (this.failStart) throw new Error('hook failed');
      this.started = true;
    }
    stop(): void {
      this.stopped = true;
    }
  }

  function deps(overrides: Partial<HookSourceDeps> = {}, hook = new FakeHook()) {
    const value: HookSourceDeps = {
      platform: 'win32',
      env: {},
      load: () => Promise.resolve({ uIOhook: hook }),
      isAccessibilityTrusted: () => true,
      locate: (point) => ({ x: point.x / 2, y: point.y / 2, display: point.x > 1000 ? '2' : '1' }),
      ...overrides,
    };
    return { value, hook };
  }

  it('starts, listens only for the mouse, and converts coordinates to DIP', async () => {
    const { value, hook } = deps();
    const events: UnstampedEvent[] = [];
    const source = createHookSource(value);
    expect(await source.start((event) => events.push(event))).toEqual({ status: 'started' });
    expect([...hook.handlers.keys()].sort()).toEqual([
      'mousedown',
      'mousemove',
      'mouseup',
      'wheel',
    ]);
    expect([...hook.handlers.keys()].some((name) => name.includes('key'))).toBe(false);

    hook.handlers.get('mousemove')?.({ x: 200, y: 100 });
    hook.handlers.get('mousedown')?.({ x: 200, y: 100, button: 1 });
    hook.handlers.get('mouseup')?.({ x: 200, y: 100, button: 2 });
    hook.handlers.get('wheel')?.({ x: 40, y: 40, direction: 3, rotation: -1 });
    hook.handlers.get('wheel')?.({ x: 40, y: 40, direction: 4, rotation: 1 });
    expect(events).toEqual([
      { type: 'move', x: 100, y: 50, display: '1' },
      { type: 'down', x: 100, y: 50, button: 'left', display: '1' },
      { type: 'up', x: 100, y: 50, button: 'right', display: '1' },
      { type: 'wheel', x: 20, y: 20, dx: 0, dy: -1, display: '1' },
      { type: 'wheel', x: 20, y: 20, dx: 1, dy: 0, display: '1' },
    ]);
    hook.handlers.get('mousedown')?.({ x: 3000, y: 10, button: 1 });
    expect(events.at(-1)).toMatchObject({ x: 1500, display: '2' });
  });

  it('ignores a button it does not know', async () => {
    const { value, hook } = deps();
    const events: UnstampedEvent[] = [];
    await createHookSource(value).start((event) => events.push(event));
    hook.handlers.get('mousedown')?.({ x: 1, y: 1, button: 9 });
    expect(events).toEqual([]);
    expect(buttonName(3)).toBe('middle');
    expect(buttonName(undefined)).toBeUndefined();
  });

  it('stops the hook and removes its listeners, and stopping twice is harmless', async () => {
    const { value, hook } = deps();
    const source = createHookSource(value);
    await source.start(() => undefined);
    source.stop();
    source.stop();
    expect(hook.stopped).toBe(true);
    expect(hook.listenersRemoved).toBe(true);
  });

  it('is unavailable on Wayland without loading anything', async () => {
    let loaded = false;
    const { value } = deps({
      platform: 'linux',
      env: { XDG_SESSION_TYPE: 'wayland' },
      load: () => {
        loaded = true;
        return Promise.resolve({});
      },
    });
    expect(await createHookSource(value).start(() => undefined)).toEqual({
      status: 'unavailable',
      reason: 'wayland',
    });
    expect(loaded).toBe(false);
  });

  it('is available on Linux with X11', async () => {
    const { value } = deps({ platform: 'linux', env: { XDG_SESSION_TYPE: 'x11' } });
    expect((await createHookSource(value).start(() => undefined)).status).toBe('started');
  });

  it('needs the Accessibility permission on macOS', async () => {
    const { value } = deps({ platform: 'darwin', isAccessibilityTrusted: () => false });
    expect(await createHookSource(value).start(() => undefined)).toEqual({
      status: 'unavailable',
      reason: 'permission',
    });
    const trusted = deps({ platform: 'darwin' });
    expect((await createHookSource(trusted.value).start(() => undefined)).status).toBe('started');
  });

  it('reports an error when the module will not load or has no API', async () => {
    const missing = deps({ load: () => Promise.reject(new Error('Cannot find module')) });
    expect(await createHookSource(missing.value).start(() => undefined)).toEqual({
      status: 'unavailable',
      reason: 'error',
      detail: 'Cannot find module',
    });
    for (const odd of [{}, { uIOhook: 5 }, { uIOhook: { on: 1 } }, null]) {
      const { value } = deps({ load: () => Promise.resolve(odd) });
      expect((await createHookSource(value).start(() => undefined)).status).toBe('unavailable');
    }
  });

  it('reports an error when the hook fails to start and cleans up', async () => {
    const hook = new FakeHook();
    hook.failStart = true;
    const { value } = deps({}, hook);
    const result = await createHookSource(value).start(() => undefined);
    expect(result).toMatchObject({ status: 'unavailable', reason: 'error', detail: 'hook failed' });
    expect(hook.listenersRemoved).toBe(true);
  });
});
