import { describe, expect, it } from 'vitest';
import type { RegionCommand, WindowTile } from '../../src/recorder/region/protocol';
import {
  createAreaFlow,
  type AreaDeps,
  type AreaRequest,
  type DisplayInfo,
  type OverlayHandle,
} from '../../src/main/recording/area-flow';
import type { RecordingOptions } from '../../src/main/recording/types';

class FakeOverlay implements OverlayHandle {
  events: ((value: unknown) => void)[] = [];
  closedCallbacks: (() => void)[] = [];
  sent: RegionCommand[] = [];
  focused = false;
  closed = false;
  onEvent(callback: (value: unknown) => void): void {
    this.events.push(callback);
  }
  onClosed(callback: () => void): void {
    this.closedCallbacks.push(callback);
  }
  send(command: RegionCommand): void {
    this.sent.push(command);
  }
  focus(): void {
    this.focused = true;
  }
  close(): void {
    this.closed = true;
  }
  emit(value: unknown): void {
    for (const callback of this.events) callback(value);
  }
  vanish(): void {
    for (const callback of this.closedCallbacks) callback();
  }
}

const primary: DisplayInfo = {
  id: '111',
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  scaleFactor: 1.5,
};
const second: DisplayInfo = {
  id: '222',
  bounds: { x: 1280, y: -100, width: 1920, height: 1080 },
  scaleFactor: 1,
};

const tile = (id: string, name: string): WindowTile => ({ id, name, png: new Uint8Array([1, 2]) });
const off = { enabled: false } as const;

const record: AreaRequest = { mode: 'record', camera: off, mic: off };
const shot: AreaRequest = { mode: 'screenshot', camera: off, mic: off, folder: 'C:/shots' };

function setup(
  options: {
    displays?: DisplayInfo[];
    readyTimeoutMs?: number;
    windows?: WindowTile[];
    started?: Awaited<ReturnType<AreaDeps['startRecording']>>;
    pointer?: string | undefined;
  } = {},
) {
  const previews: string[] = [];
  const overlays = new Map<string, FakeOverlay>();
  const logs: string[] = [];
  const waits: number[] = [];
  const started: RecordingOptions[] = [];
  const shots: { source: unknown; options: unknown }[] = [];
  const order: string[] = [];
  const flow = createAreaFlow({
    displays: () => options.displays ?? [primary, second],
    pointerDisplayId: () => ('pointer' in options ? options.pointer : '111'),
    openOverlay: (display) => {
      const overlay = new FakeOverlay();
      overlays.set(display.id, overlay);
      return overlay;
    },
    listWindows: () => Promise.resolve(options.windows ?? [tile('window:1:0', 'Notes')]),
    startRecording: (recording) => {
      started.push(recording);
      order.push('start');
      return Promise.resolve(
        options.started ?? { ok: true, value: { folder: 'C:/rec/Demo.scrim' } },
      );
    },
    takeScreenshot: (source, shotOptions) => {
      shots.push({ source, options: shotOptions });
      order.push('shot');
      return Promise.resolve({
        ok: true,
        value: { path: 'C:/shots/a.png', copied: true, width: 10, height: 5 },
      });
    },
    beforeOpen: () => {
      order.push('before');
      return Promise.resolve();
    },
    wait: (ms) => {
      waits.push(ms);
      order.push(`wait ${String(ms)}`);
      return Promise.resolve();
    },
    log: (message) => logs.push(message),
    readyTimeoutMs: options.readyTimeoutMs ?? 50,
    countdownSeconds: 3,
    captureDelayMs: 100,
    showPreview: (input) => {
      previews.push(`show ${input.displayId} ${String(input.camera.deviceId)}`);
      order.push('preview');
    },
    hidePreview: () => {
      previews.push('hide');
      order.push('hide');
    },
  });
  return { flow, overlays, logs, waits, started, shots, order, previews };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('opening', () => {
  it('lets the main window step aside first, then opens one overlay per display and focuses the pointer one', async () => {
    const { flow, overlays, order } = setup({ pointer: '222' });
    const pending = flow.run(record);
    await flush();
    expect(order[0]).toBe('before');
    expect([...overlays.keys()]).toEqual(['111', '222']);
    expect(overlays.get('222')?.focused).toBe(true);
    overlays.get('111')?.emit({ type: 'cancel' });
    await pending;
  });

  it('sends each overlay its start state when it is ready, with the pill on the pointer display only', async () => {
    const { flow, overlays } = setup({ pointer: '222' });
    const pending = flow.run({
      ...record,
      area: 'window',
      camera: { enabled: true, deviceId: 'cam' },
    });
    await flush();
    overlays.get('111')?.emit({ type: 'ready' });
    overlays.get('222')?.emit({ type: 'ready' });
    expect(overlays.get('111')?.sent.find((command) => command.type === 'init')).toEqual({
      type: 'init',
      mode: 'record',
      area: 'window',
      camera: { enabled: true, deviceId: 'cam' },
      mic: off,
      primary: false,
    });
    expect(overlays.get('222')?.sent.find((command) => command.type === 'init')).toMatchObject({
      type: 'init',
      primary: true,
    });
    overlays.get('222')?.emit({ type: 'cancel' });
    await pending;
  });

  it('reads the window list only when Window is chosen, once, and sends it to every overlay', async () => {
    let listed = 0;
    const base = setup();
    const overlays = base.overlays;
    const flow = createAreaFlow({
      displays: () => [primary, second],
      pointerDisplayId: () => '111',
      openOverlay: (display) => {
        const overlay = new FakeOverlay();
        overlays.set(display.id, overlay);
        return overlay;
      },
      listWindows: () => {
        listed += 1;
        return Promise.resolve([tile('window:1:0', 'Notes')]);
      },
      startRecording: () => Promise.reject(new Error('unused')),
      takeScreenshot: () => Promise.reject(new Error('unused')),
      wait: () => Promise.resolve(),
      log: () => undefined,
    });
    const pending = flow.run(record);
    await flush();
    overlays.get('111')?.emit({ type: 'ready' });
    expect(listed).toBe(0);
    overlays.get('111')?.emit({ type: 'area', area: 'window' });
    overlays.get('222')?.emit({ type: 'area', area: 'window' });
    await flush();
    expect(listed).toBe(1);
    for (const id of ['111', '222']) {
      expect(overlays.get(id)?.sent).toContainEqual({
        type: 'windows',
        tiles: [tile('window:1:0', 'Notes')],
      });
    }
    overlays.get('111')?.emit({ type: 'cancel' });
    await pending;
  });

  it('reads the window list at once when it starts on Window', async () => {
    const { flow, overlays } = setup();
    const pending = flow.run({ ...record, area: 'window' });
    await flush();
    overlays.get('111')?.emit({ type: 'ready' });
    await flush();
    expect(overlays.get('111')?.sent).toContainEqual({
      type: 'windows',
      tiles: [tile('window:1:0', 'Notes')],
    });
    overlays.get('111')?.emit({ type: 'cancel' });
    await pending;
  });

  it('is busy while one is running, and can run again afterwards', async () => {
    const { flow, overlays } = setup({ displays: [primary] });
    const first = flow.run(record);
    expect(await flow.run(record)).toEqual({ ok: false, reason: 'busy' });
    overlays.get('111')?.emit({ type: 'cancel' });
    await first;
    const again = flow.run(record);
    await flush();
    overlays.get('111')?.emit({ type: 'cancel' });
    expect(await again).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('fails at once with no displays, or when an overlay cannot be opened, or none shows in time', async () => {
    expect(await setup({ displays: [] }).flow.run(record)).toEqual({
      ok: false,
      reason: 'failed',
      step: 'no-displays',
    });
    const broken = createAreaFlow({
      displays: () => [primary],
      pointerDisplayId: () => undefined,
      openOverlay: () => {
        throw new Error('no window');
      },
      listWindows: () => Promise.resolve([]),
      startRecording: () => Promise.reject(new Error('unused')),
      takeScreenshot: () => Promise.reject(new Error('unused')),
      wait: () => Promise.resolve(),
      log: () => undefined,
    });
    expect(await broken.run(record)).toEqual({
      ok: false,
      reason: 'failed',
      step: 'overlay-open',
    });
    const slow = setup({ displays: [primary], readyTimeoutMs: 10 });
    expect(await slow.flow.run(record)).toEqual({
      ok: false,
      reason: 'failed',
      step: 'overlay-not-ready',
    });
    expect(slow.overlays.get('111')?.closed).toBe(true);
  });
});

describe('keeping the displays in step', () => {
  it('clears the other boxes when one starts, and passes on the area kind and the toggles', async () => {
    const { flow, overlays } = setup();
    const pending = flow.run(record);
    await flush();
    overlays.get('111')?.emit({ type: 'begin' });
    expect(overlays.get('222')?.sent).toContainEqual({ type: 'clear' });
    overlays.get('111')?.emit({ type: 'area', area: 'display' });
    expect(overlays.get('222')?.sent).toContainEqual({ type: 'set-area', area: 'display' });
    expect(overlays.get('111')?.sent.some((c) => c.type === 'set-area')).toBe(false);
    overlays.get('222')?.emit({ type: 'devices', camera: { enabled: true }, mic: off });
    expect(overlays.get('111')?.sent).toContainEqual({
      type: 'set-devices',
      camera: { enabled: true },
      mic: off,
    });
    overlays.get('111')?.emit({ type: 'cancel' });
    await pending;
  });

  it('uses the toggles as they were last set when it starts recording', async () => {
    const { flow, overlays, started } = setup({ displays: [primary] });
    const pending = flow.run(record);
    await flush();
    overlays.get('111')?.emit({
      type: 'devices',
      camera: { enabled: true, deviceId: 'cam-1' },
      mic: { enabled: true, deviceId: 'mic-1' },
    });
    overlays.get('111')?.emit({ type: 'confirm-display' });
    await pending;
    expect(started[0]?.camera).toEqual({ enabled: true, deviceId: 'cam-1' });
    expect(started[0]?.mic).toEqual({ enabled: true, deviceId: 'mic-1' });
  });
});

describe('recording', () => {
  it('counts down 3, 2, 1 on the chosen display, closes the others, then starts', async () => {
    const { flow, overlays, started, order, waits } = setup();
    const pending = flow.run({ ...record, destination: 'D:/clips', name: 'Demo' });
    await flush();
    overlays
      .get('222')
      ?.emit({ type: 'confirm-region', rect: { x: 100, y: 50, width: 641, height: 361 } });
    const outcome = await pending;
    expect(outcome).toEqual({ ok: true, mode: 'record', folder: 'C:/rec/Demo.scrim' });
    expect(overlays.get('111')?.closed).toBe(true);
    expect(overlays.get('222')?.closed).toBe(true);
    expect(overlays.get('222')?.sent.filter((c) => c.type === 'count')).toEqual([
      { type: 'count', n: 3 },
      { type: 'count', n: 2 },
      { type: 'count', n: 1 },
      { type: 'count', n: null },
    ]);
    // The overlay is off the screen before the recording starts.
    expect(order.slice(-3)).toEqual(['wait 1000', 'wait 100', 'start']);
    expect(waits.filter((ms) => ms === 1000)).toHaveLength(3);
    expect(started[0]).toMatchObject({
      destination: 'D:/clips',
      name: 'Demo',
      source: {
        kind: 'region',
        displayId: '222',
        crop: { x: 1380, y: -50, width: 640, height: 360 },
      },
    });
  });

  it('works out the region from the display scale, in whole even pixels', async () => {
    const { flow, overlays, started } = setup();
    const pending = flow.run(record);
    await flush();
    overlays.get('111')?.emit({
      type: 'confirm-region',
      rect: { x: 100.4, y: 50.6, width: 640.2, height: 360.1 },
    });
    await pending;
    const crop = (started[0]?.source as { crop: { width: number; height: number } }).crop;
    expect(Math.round(crop.width * 1.5)).toBe(960);
    expect(Math.round(crop.height * 1.5)).toBe(540);
  });

  it('records a whole display and a window that was offered, and ignores one that was not', async () => {
    const display = setup({ displays: [primary] });
    const first = display.flow.run(record);
    await flush();
    display.overlays.get('111')?.emit({ type: 'confirm-display' });
    await first;
    expect(display.started[0]?.source).toEqual({ kind: 'display', displayId: '111' });

    const windows = setup({ displays: [primary] });
    const second = windows.flow.run({ ...record, area: 'window' });
    await flush();
    windows.overlays.get('111')?.emit({ type: 'ready' });
    await flush();
    windows.overlays.get('111')?.emit({ type: 'confirm-window', sourceId: 'window:999:0' });
    await flush();
    expect(windows.started).toEqual([]);
    windows.overlays.get('111')?.emit({ type: 'confirm-window', sourceId: 'window:1:0' });
    await second;
    expect(windows.started[0]?.source).toEqual({ kind: 'window', sourceId: 'window:1:0' });
  });

  it('ignores a box that is too small, and goes on waiting', async () => {
    const { flow, overlays, started } = setup({ displays: [primary] });
    const pending = flow.run(record);
    await flush();
    overlays
      .get('111')
      ?.emit({ type: 'confirm-region', rect: { x: 0, y: 0, width: 20, height: 20 } });
    await flush();
    expect(started).toEqual([]);
    overlays.get('111')?.emit({ type: 'cancel' });
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('counts 3, 2, 1 one second apart and only then starts', async () => {
    const { flow, overlays, started, waits } = setup({ displays: [primary] });
    const pending = flow.run(record);
    await flush();
    const overlay = overlays.get('111');
    overlay?.emit({ type: 'confirm-display' });
    expect(await pending).toMatchObject({ ok: true, mode: 'record' });
    const counts = (overlay?.sent ?? []).flatMap((command) =>
      command.type === 'count' ? [command.n] : [],
    );
    expect(counts).toEqual([3, 2, 1, null]);
    expect(waits.filter((ms) => ms === 1000)).toHaveLength(3);
    expect(started).toHaveLength(1);
  });

  it('starts at once, with no numbers, when the countdown is off', async () => {
    const { flow, overlays, started, waits } = setup({ displays: [primary] });
    const pending = flow.run({ ...record, countdownSeconds: 0 });
    await flush();
    const overlay = overlays.get('111');
    overlay?.emit({ type: 'confirm-display' });
    expect(await pending).toMatchObject({ ok: true, mode: 'record' });
    const counts = (overlay?.sent ?? []).flatMap((command) =>
      command.type === 'count' ? [command.n] : [],
    );
    expect(counts).toEqual([null]);
    expect(waits.filter((ms) => ms === 1000)).toHaveLength(0);
    expect(started).toHaveLength(1);
  });

  it('cancels during the countdown with Escape, and never starts', async () => {
    const overlay = new FakeOverlay();
    const started: unknown[] = [];
    const flow = createAreaFlow({
      displays: () => [primary],
      pointerDisplayId: () => '111',
      openOverlay: () => overlay,
      listWindows: () => Promise.resolve([]),
      startRecording: (options) => {
        started.push(options);
        return Promise.resolve({ ok: true, value: { folder: 'f' } });
      },
      takeScreenshot: () => Promise.reject(new Error('unused')),
      wait: (ms) => (ms === 1000 ? new Promise<void>(() => undefined) : Promise.resolve()),
      log: () => undefined,
    });
    const pending = flow.run(record);
    await flush();
    overlay.emit({ type: 'confirm-display' });
    await flush();
    overlay.emit({ type: 'cancel' });
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect(started).toEqual([]);
    expect(overlay.closed).toBe(true);
  });

  it('reports a recording that could not start, with the plain error', async () => {
    const error = { code: 'disk-too-full' as const, message: 'No space.', nextStep: 'Free space.' };
    const { flow, overlays } = setup({ displays: [primary], started: { ok: false, error } });
    const pending = flow.run(record);
    await flush();
    overlays.get('111')?.emit({ type: 'confirm-display' });
    expect(await pending).toEqual({ ok: false, reason: 'rejected', error });
  });

  it('does not count closing the other overlays as a cancel', async () => {
    const { flow, overlays } = setup();
    const pending = flow.run(record);
    await flush();
    overlays.get('222')?.emit({ type: 'confirm-display' });
    await flush();
    // Closing an overlay we closed ourselves reports back, as a real window does.
    overlays.get('111')?.vanish();
    expect(await pending).toEqual({ ok: true, mode: 'record', folder: 'C:/rec/Demo.scrim' });
  });
});

describe('screenshots', () => {
  it('closes the overlays and lets them leave the screen before taking the picture', async () => {
    const { flow, overlays, shots, order } = setup();
    const pending = flow.run({ ...shot, copyToClipboard: false });
    await flush();
    overlays
      .get('111')
      ?.emit({ type: 'confirm-region', rect: { x: 10, y: 10, width: 400, height: 300 } });
    const outcome = await pending;
    expect(outcome).toEqual({
      ok: true,
      mode: 'screenshot',
      result: { path: 'C:/shots/a.png', copied: true, width: 10, height: 5 },
    });
    expect(order.slice(-2)).toEqual(['wait 100', 'shot']);
    expect(overlays.get('111')?.closed && overlays.get('222')?.closed).toBe(true);
    expect(shots[0]).toMatchObject({
      source: { kind: 'region', displayId: '111' },
      options: { folder: 'C:/shots', copyToClipboard: false },
    });
  });

  it('copies by default and takes a window or a display at once', async () => {
    const { flow, overlays, shots } = setup({ displays: [primary] });
    const first = flow.run({ ...shot, area: 'window' });
    await flush();
    overlays.get('111')?.emit({ type: 'ready' });
    await flush();
    overlays.get('111')?.emit({ type: 'confirm-window', sourceId: 'window:1:0' });
    await first;
    expect(shots[0]).toMatchObject({
      source: { kind: 'window', sourceId: 'window:1:0' },
      options: { copyToClipboard: true },
    });
    const second = flow.run(shot);
    await flush();
    overlays.get('111')?.emit({ type: 'confirm-display' });
    await second;
    expect(shots[1]).toMatchObject({ source: { kind: 'display', displayId: '111' } });
  });

  it('reports a screenshot that failed', async () => {
    const error = { code: 'screen-unavailable' as const, message: 'No.', nextStep: 'Try.' };
    const overlay = new FakeOverlay();
    const flow = createAreaFlow({
      displays: () => [primary],
      pointerDisplayId: () => '111',
      openOverlay: () => overlay,
      listWindows: () => Promise.resolve([]),
      startRecording: () => Promise.reject(new Error('unused')),
      takeScreenshot: () => Promise.resolve({ ok: false, error }),
      wait: () => Promise.resolve(),
      log: () => undefined,
    });
    const pending = flow.run(shot);
    await flush();
    overlay.emit({ type: 'confirm-display' });
    expect(await pending).toEqual({ ok: false, reason: 'rejected', error });
  });
});

describe('cancelling and bad input', () => {
  it('cancels on Escape and closes every overlay', async () => {
    const { flow, overlays } = setup();
    const pending = flow.run(record);
    await flush();
    overlays.get('222')?.emit({ type: 'cancel' });
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect([...overlays.values()].every((overlay) => overlay.closed)).toBe(true);
  });

  it('counts a window that closes on its own as a cancel', async () => {
    const { flow, overlays } = setup();
    const pending = flow.run(record);
    await flush();
    overlays.get('222')?.vanish();
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect(overlays.get('111')?.closed).toBe(true);
  });

  it('cancel() stops a running flow and does nothing when idle', async () => {
    const { flow, overlays } = setup({ displays: [primary] });
    flow.cancel();
    const pending = flow.run(record);
    await flush();
    flow.cancel();
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect(overlays.get('111')?.closed).toBe(true);
  });

  it('ignores events that do not match the schema, including keys and stray fields', async () => {
    const { flow, overlays, logs, started } = setup({ displays: [primary] });
    const pending = flow.run(record);
    await flush();
    for (const bad of [
      'cancel',
      null,
      { type: 'keydown', key: 'a' },
      { type: 'cancel', extra: true },
      { type: 'confirm-region', rect: { x: 0, y: 0, width: -5, height: 10 } },
      { type: 'confirm-window', sourceId: '' },
      { type: 'area', area: 'desktop' },
      { type: 'devices', camera: { enabled: 'yes' }, mic: off },
    ]) {
      overlays.get('111')?.emit(bad);
    }
    await flush();
    expect(logs.filter((line) => line.includes('did not match'))).toHaveLength(8);
    expect(started).toEqual([]);
    flow.cancel();
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });
});

describe('the camera bubble before the countdown', () => {
  const withCamera: AreaRequest = { ...record, camera: { enabled: true, deviceId: 'cam' } };

  it('shows when something is chosen and Start is on offer, before any count', async () => {
    const { flow, overlays, previews, order } = setup({ displays: [primary] });
    const pending = flow.run(withCamera);
    await flush();
    const overlay = overlays.get('111');
    overlay?.emit({ type: 'staged', ready: true });
    expect(previews).toEqual(['show 111 cam']);
    overlay?.emit({ type: 'confirm-display' });
    await pending;
    expect(order.indexOf('preview')).toBeLessThan(order.indexOf('wait 1000'));
  });

  it('stays through the countdown and the start, and is not hidden when the recording runs', async () => {
    const { flow, overlays, previews } = setup({ displays: [primary] });
    const pending = flow.run(withCamera);
    await flush();
    const overlay = overlays.get('111');
    overlay?.emit({ type: 'staged', ready: true });
    overlay?.emit({ type: 'confirm-display' });
    expect(await pending).toMatchObject({ ok: true, mode: 'record' });
    expect(previews).toEqual(['show 111 cam']);
  });

  it('is hidden when the choice is lost, the camera is turned off, or the person cancels', async () => {
    const { flow, overlays, previews } = setup({ displays: [primary] });
    const pending = flow.run(withCamera);
    await flush();
    const overlay = overlays.get('111');
    overlay?.emit({ type: 'staged', ready: true });
    overlay?.emit({ type: 'staged', ready: false });
    overlay?.emit({ type: 'staged', ready: true });
    overlay?.emit({ type: 'devices', camera: { enabled: false }, mic: off });
    expect(previews).toEqual(['show 111 cam', 'hide', 'show 111 cam', 'hide']);
    overlay?.emit({ type: 'cancel' });
    await pending;
    expect(previews.at(-1)).toBe('hide');
  });

  it('shows again with the new camera when another one is picked', async () => {
    const { flow, overlays, previews } = setup({ displays: [primary] });
    const pending = flow.run(withCamera);
    await flush();
    const overlay = overlays.get('111');
    overlay?.emit({ type: 'staged', ready: true });
    overlay?.emit({
      type: 'devices',
      camera: { enabled: true, deviceId: 'other' },
      mic: off,
    });
    expect(previews).toEqual(['show 111 cam', 'hide', 'show 111 other']);
    overlay?.emit({ type: 'cancel' });
    await pending;
  });

  it('never shows for a screenshot or with the camera off', async () => {
    const shotRun = setup({ displays: [primary] });
    const first = shotRun.flow.run({ ...shot, camera: { enabled: true } });
    await flush();
    shotRun.overlays.get('111')?.emit({ type: 'staged', ready: true });
    expect(shotRun.previews).toEqual([]);
    shotRun.overlays.get('111')?.emit({ type: 'cancel' });
    await first;
    const cameraOff = setup({ displays: [primary] });
    const second = cameraOff.flow.run(record);
    await flush();
    cameraOff.overlays.get('111')?.emit({ type: 'staged', ready: true });
    expect(cameraOff.previews).toEqual([]);
    cameraOff.overlays.get('111')?.emit({ type: 'cancel' });
    await second;
  });

  it('is hidden when the recording could not start', async () => {
    const error = { code: 'disk-too-full' as const, message: 'No space.', nextStep: 'Free space.' };
    const { flow, overlays, previews } = setup({
      displays: [primary],
      started: { ok: false, error },
    });
    const pending = flow.run(withCamera);
    await flush();
    overlays.get('111')?.emit({ type: 'staged', ready: true });
    overlays.get('111')?.emit({ type: 'confirm-display' });
    await pending;
    expect(previews).toEqual(['show 111 cam', 'hide']);
  });
});
