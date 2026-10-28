import { describe, expect, it } from 'vitest';
import type { RegionCommand } from '../../src/recorder/region/protocol';
import {
  createRegionSelector,
  type DisplayInfo,
  type OverlayHandle,
} from '../../src/main/recording/region-selector';

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

function setup(displays: DisplayInfo[] = [primary, second], readyTimeoutMs = 50) {
  const overlays = new Map<string, FakeOverlay>();
  const logs: string[] = [];
  const selector = createRegionSelector({
    displays: () => displays,
    openOverlay: (display) => {
      const overlay = new FakeOverlay();
      overlays.set(display.id, overlay);
      return overlay;
    },
    log: (message) => logs.push(message),
    readyTimeoutMs,
  });
  return { selector, overlays, logs };
}

describe('createRegionSelector', () => {
  it('opens one overlay per display and focuses the first', async () => {
    const { selector, overlays } = setup();
    const pending = selector.select();
    expect([...overlays.keys()]).toEqual(['111', '222']);
    expect(overlays.get('111')?.focused).toBe(true);
    overlays.get('111')?.emit({ type: 'cancel' });
    await pending;
  });

  it('works out the area from the display, in desktop coordinates and even pixels', async () => {
    const { selector, overlays } = setup();
    const pending = selector.select();
    overlays.get('222')?.emit({ type: 'ready' });
    // A box drawn on the second display, which sits to the right and a little above the first.
    overlays
      .get('222')
      ?.emit({ type: 'confirm', rect: { x: 100, y: 50, width: 641, height: 361 } });
    const result = await pending;
    expect(result).toEqual({
      ok: true,
      value: {
        displayId: '222',
        crop: { x: 1380, y: -50, width: 640, height: 360 },
        sizePx: { width: 640, height: 360 },
      },
    });
  });

  it('uses the scale of the display that confirmed, so pixels stay whole and even', async () => {
    const { selector, overlays } = setup();
    const pending = selector.select();
    overlays
      .get('111')
      ?.emit({ type: 'confirm', rect: { x: 100.4, y: 50.6, width: 640.2, height: 360.1 } });
    const result = await pending;
    expect(result.ok && result.value.sizePx).toEqual({ width: 960, height: 540 });
    expect(result.ok && result.value.displayId).toBe('111');
  });

  it('ignores a confirmed box that is too small, and goes on waiting', async () => {
    const { selector, overlays } = setup();
    let settled = false;
    const pending = selector.select().then((outcome) => {
      settled = true;
      return outcome;
    });
    overlays.get('111')?.emit({ type: 'confirm', rect: { x: 0, y: 0, width: 20, height: 20 } });
    await Promise.resolve();
    expect(settled).toBe(false);
    overlays.get('111')?.emit({ type: 'cancel' });
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('cancels on Escape and closes every overlay', async () => {
    const { selector, overlays } = setup();
    const pending = selector.select();
    overlays.get('222')?.emit({ type: 'cancel' });
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect([...overlays.values()].every((overlay) => overlay.closed)).toBe(true);
  });

  it('tells the other overlays to drop their box when one starts drawing', async () => {
    const { selector, overlays } = setup();
    const pending = selector.select();
    overlays.get('111')?.emit({ type: 'begin' });
    expect(overlays.get('222')?.sent).toEqual([{ type: 'clear' }]);
    expect(overlays.get('111')?.sent).toEqual([]);
    overlays.get('111')?.emit({ type: 'cancel' });
    await pending;
  });

  it('counts a window that closes on its own as a cancel', async () => {
    const { selector, overlays } = setup();
    const pending = selector.select();
    overlays.get('222')?.vanish();
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect(overlays.get('111')?.closed).toBe(true);
  });

  it('ignores events that do not match the schema, including a stray field or a key', async () => {
    const { selector, overlays, logs } = setup();
    let settled = false;
    const pending = selector.select().then((outcome) => {
      settled = true;
      return outcome;
    });
    for (const bad of [
      'cancel',
      null,
      { type: 'keydown', key: 'a' },
      { type: 'cancel', extra: true },
      { type: 'confirm', rect: { x: 0, y: 0, width: -5, height: 10 } },
      { type: 'confirm', rect: { x: 'a', y: 0, width: 10, height: 10 } },
    ]) {
      overlays.get('111')?.emit(bad);
    }
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(logs).toHaveLength(6);
    selector.cancel();
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('fails when no overlay shows in time, and closes them', async () => {
    const { selector, overlays } = setup([primary], 10);
    expect(await selector.select()).toEqual({ ok: false, reason: 'failed' });
    expect(overlays.get('111')?.closed).toBe(true);
  });

  it('does not time out once an overlay has shown', async () => {
    const { selector, overlays } = setup([primary], 20);
    const pending = selector.select();
    overlays.get('111')?.emit({ type: 'ready' });
    await new Promise((resolve) => setTimeout(resolve, 40));
    overlays.get('111')?.emit({ type: 'cancel' });
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('runs one selection at a time and can run another afterwards', async () => {
    const { selector, overlays } = setup([primary]);
    const first = selector.select();
    expect(await selector.select()).toEqual({ ok: false, reason: 'busy' });
    overlays.get('111')?.emit({ type: 'cancel' });
    await first;
    const again = selector.select();
    overlays.get('111')?.emit({ type: 'cancel' });
    expect(await again).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('fails at once with no displays, or when an overlay cannot be opened', async () => {
    expect(await setup([]).selector.select()).toEqual({ ok: false, reason: 'failed' });
    const selector = createRegionSelector({
      displays: () => [primary],
      openOverlay: () => {
        throw new Error('no window');
      },
      log: () => undefined,
    });
    expect(await selector.select()).toEqual({ ok: false, reason: 'failed' });
  });

  it('cancel stops a running selection and does nothing when idle', async () => {
    const { selector, overlays } = setup([primary]);
    selector.cancel();
    const pending = selector.select();
    selector.cancel();
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
    expect(overlays.get('111')?.closed).toBe(true);
  });
});
