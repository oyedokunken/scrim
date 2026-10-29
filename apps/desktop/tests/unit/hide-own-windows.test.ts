import { describe, expect, it } from 'vitest';
import { hideOwnWindows, type HideableWindow } from '../../src/main/recording/hide-own-windows';

class FakeWindow implements HideableWindow {
  visible = true;
  minimized = false;
  destroyed = false;
  shown = 0;
  /** Milliseconds a hide takes to leave the screen, to model a window that fades out. */
  fadeMs = 0;
  hideAt: number | undefined;
  constructor(private readonly clock: { now: number }) {}
  isDestroyed = (): boolean => this.destroyed;
  isVisible = (): boolean => {
    if (this.hideAt !== undefined && this.clock.now - this.hideAt >= this.fadeMs) {
      this.visible = false;
    }
    return this.visible;
  };
  isMinimized = (): boolean => this.minimized;
  hide = (): void => {
    this.hideAt = this.clock.now;
    if (this.fadeMs === 0) this.visible = false;
  };
  showInactive = (): void => {
    this.visible = true;
    this.hideAt = undefined;
    this.shown += 1;
  };
}

function setup() {
  const clock = { now: 0 };
  const waits: number[] = [];
  const logs: string[] = [];
  const make = (): FakeWindow => new FakeWindow(clock);
  const deps = (
    windows: { window: FakeWindow; overlay?: boolean }[],
    extra: { timeoutMs?: number } = {},
  ) => ({
    windows: () =>
      windows.map((entry) => ({ window: entry.window, overlay: entry.overlay ?? false })),
    wait: (ms: number) => {
      waits.push(ms);
      clock.now += ms;
      return Promise.resolve();
    },
    now: () => clock.now,
    log: (message: string) => logs.push(message),
    ...extra,
  });
  return { make, deps, waits, logs, clock };
}

describe('hideOwnWindows', () => {
  it('hides every visible window, waits until they are gone, then lets the system settle', async () => {
    const { make, deps, waits } = setup();
    const dialog = make();
    const welcome = make();
    dialog.fadeMs = 250;
    const restore = await hideOwnWindows(deps([{ window: dialog }, { window: welcome }]));
    expect(dialog.isVisible()).toBe(false);
    expect(welcome.isVisible()).toBe(false);
    // Polled at least twice for the fade, then the settle wait.
    expect(waits.filter((ms) => ms === 100).length).toBeGreaterThanOrEqual(2);
    expect(waits.at(-1)).toBe(150);
    restore();
    expect(dialog.shown).toBe(1);
    expect(welcome.shown).toBe(1);
  });

  it('leaves a minimized window alone and does not bring it back', async () => {
    const { make, deps } = setup();
    const main = make();
    main.minimized = true;
    const restore = await hideOwnWindows(deps([{ window: main }]));
    restore();
    expect(main.shown).toBe(0);
  });

  it('waits for a closing overlay but never brings it back', async () => {
    const { make, deps } = setup();
    const overlay = make();
    overlay.fadeMs = 200;
    // The overlay is closing by itself, so it leaves after its own fade.
    overlay.hideAt = 0;
    const restore = await hideOwnWindows(deps([{ window: overlay, overlay: true }]));
    expect(overlay.isVisible()).toBe(false);
    restore();
    expect(overlay.shown).toBe(0);
  });

  it('ignores a destroyed window and skips restoring one that was destroyed meanwhile', async () => {
    const { make, deps } = setup();
    const gone = make();
    gone.destroyed = true;
    const pill = make();
    const restore = await hideOwnWindows(deps([{ window: gone }, { window: pill }]));
    pill.destroyed = true;
    restore();
    expect(gone.shown).toBe(0);
    expect(pill.shown).toBe(0);
  });

  it('gives up after the timeout, says so, and still continues', async () => {
    const { make, deps, logs } = setup();
    const stuck = make();
    stuck.hide = (): void => undefined;
    const restore = await hideOwnWindows(deps([{ window: stuck }], { timeoutMs: 400 }));
    expect(logs.some((line) => line.includes('still on screen'))).toBe(true);
    restore();
  });
});
