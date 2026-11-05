import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ desktopCapturer: { getSources: vi.fn() } }));

const { createPortalCapture } = await import('../../src/main/recording/portal-capture');
const { createStillAreaRunner, scaleBox, stillDisplay } =
  await import('../../src/main/recording/still-area');
const { installDisplayMediaHandler } = await import('../../src/main/recording/display-media');
const { createHookSource } = await import('../../src/main/recording/input-source');

function source(id: string, width = 3840, height = 2160) {
  return {
    id,
    name: id,
    display_id: id.startsWith('screen:') ? '7' : '',
    thumbnail: {
      toPNG: () => new Uint8Array([1, 2, 3]),
      getSize: () => ({ width, height }),
    },
  };
}

describe('the portal capture', () => {
  it('keeps the one source the portal returned, with its still picture', async () => {
    const getSources = vi.fn(() => Promise.resolve([source('screen:0:0')]));
    const portal = createPortalCapture({ getSources, log: vi.fn() });
    const picked = await portal.pick({ width: 3840, height: 2160 });
    expect(picked?.kind).toBe('screen');
    expect(picked?.still).toEqual(new Uint8Array([1, 2, 3]));
    expect(picked?.width).toBe(3840);
    expect(portal.picked()).toBe(picked);
    expect(getSources).toHaveBeenCalledWith({
      types: ['screen', 'window'],
      thumbnailSize: { width: 3840, height: 2160 },
    });
  });

  it('knows a window when the portal returns one', async () => {
    const portal = createPortalCapture({
      getSources: () => Promise.resolve([source('window:5:0')]),
      log: vi.fn(),
    });
    expect((await portal.pick({ width: 10, height: 10 }))?.kind).toBe('window');
  });

  it('answers undefined when the person cancels, and logs only the kind of failure', async () => {
    const log = vi.fn();
    const portal = createPortalCapture({
      getSources: () => Promise.reject(new Error('/home/me/secret')),
      log,
    });
    expect(await portal.pick({ width: 10, height: 10 })).toBeUndefined();
    expect(portal.picked()).toBeUndefined();
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret');
  });

  it('answers undefined for an empty list and forgets on release', async () => {
    const list = [source('screen:0:0')];
    const portal = createPortalCapture({ getSources: () => Promise.resolve(list), log: vi.fn() });
    await portal.pick({ width: 10, height: 10 });
    portal.release();
    expect(portal.picked()).toBeUndefined();
    list.length = 0;
    expect(await portal.pick({ width: 10, height: 10 })).toBeUndefined();
  });
});

describe('the display media handler with a portal source', () => {
  function install(portalSource?: () => never) {
    let handler: ((request: unknown, callback: (streams: unknown) => void) => void) | undefined;
    const ses = {
      setDisplayMediaRequestHandler: (h: typeof handler) => {
        handler = h;
      },
    };
    installDisplayMediaHandler(ses as never, () => ({ kind: 'display' }), portalSource);
    return handler;
  }

  it('hands back the portal source without asking the portal again', () => {
    const chosen = source('screen:0:0');
    const handler = install((() => chosen) as never);
    const callback = vi.fn();
    handler?.({}, callback);
    expect(callback).toHaveBeenCalledWith({ video: chosen });
  });
});

describe('the still frame geometry', () => {
  const real = { id: '7', bounds: { x: 100, y: 50, width: 1920, height: 1080 }, scaleFactor: 2 };

  it('makes a display the size of the still, at the real display position and scale', () => {
    expect(stillDisplay({ width: 3840, height: 2160 }, real)).toEqual({
      id: '7',
      bounds: { x: 100, y: 50, width: 1920, height: 1080 },
      scaleFactor: 2,
    });
    expect(stillDisplay({ width: 1920, height: 1080 }, real).bounds.width).toBe(960);
  });

  it('scales a box from the window to the still', () => {
    expect(
      scaleBox(
        { x: 10, y: 20, width: 100, height: 50 },
        { width: 1000, height: 500 },
        { width: 2000, height: 1000 },
      ),
    ).toEqual({ x: 20, y: 40, width: 200, height: 100 });
  });

  it('leaves the box alone when the window has no size yet', () => {
    const box = { x: 1, y: 2, width: 3, height: 4 };
    expect(scaleBox(box, { width: 0, height: 0 }, { width: 10, height: 10 })).toBe(box);
  });
});

describe('the still frame area runner', () => {
  const request = {
    mode: 'record' as const,
    camera: { enabled: false },
    mic: { enabled: false },
  };
  const picked = (id: string) => ({
    source: source(id),
    kind: id.startsWith('window:') ? ('window' as const) : ('screen' as const),
    still: new Uint8Array(),
    width: 100,
    height: 100,
  });

  function build(over: Partial<Parameters<typeof createStillAreaRunner>[0]> = {}) {
    const deps = {
      pick: vi.fn(() => Promise.resolve(picked('screen:0:0'))),
      beforeOpen: vi.fn(() => Promise.resolve()),
      chooseOnStill: vi.fn(() =>
        Promise.resolve({ ok: true as const, mode: 'record' as const, folder: 'F' }),
      ),
      useWindow: vi.fn(() =>
        Promise.resolve({ ok: true as const, mode: 'record' as const, folder: 'W' }),
      ),
      release: vi.fn(),
      log: vi.fn(),
      ...over,
    };
    return { deps, runner: createStillAreaRunner(deps) };
  }

  it('shows the chooser on the still after the portal picked a screen', async () => {
    const { deps, runner } = build();
    expect(await runner.run(request)).toEqual({ ok: true, mode: 'record', folder: 'F' });
    expect(deps.beforeOpen).toHaveBeenCalled();
    expect(deps.chooseOnStill).toHaveBeenCalled();
    expect(deps.useWindow).not.toHaveBeenCalled();
    // A recording that started keeps the source.
    expect(deps.release).not.toHaveBeenCalled();
  });

  it('records a window picked in the portal without a box', async () => {
    const { deps, runner } = build({ pick: vi.fn(() => Promise.resolve(picked('window:9:0'))) });
    expect(await runner.run(request)).toEqual({ ok: true, mode: 'record', folder: 'W' });
    expect(deps.chooseOnStill).not.toHaveBeenCalled();
  });

  it('is cancelled when the person cancels the portal', async () => {
    const { deps, runner } = build({ pick: vi.fn(() => Promise.resolve(undefined)) });
    expect(await runner.run(request)).toEqual({ ok: false, reason: 'cancelled' });
    expect(deps.chooseOnStill).not.toHaveBeenCalled();
  });

  it('lets the source go when the person cancels on the still', async () => {
    const { deps, runner } = build({
      chooseOnStill: vi.fn(() =>
        Promise.resolve({ ok: false as const, reason: 'cancelled' as const }),
      ),
    });
    await runner.run(request);
    expect(deps.release).toHaveBeenCalled();
  });

  it('lets the source go after a screenshot', async () => {
    const { deps, runner } = build({
      chooseOnStill: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          mode: 'screenshot' as const,
          result: { width: 1, height: 1 } as never,
        }),
      ),
    });
    await runner.run({ ...request, mode: 'screenshot' });
    expect(deps.release).toHaveBeenCalled();
  });

  it('reports a failure and lets go when something throws', async () => {
    const { deps, runner } = build({ chooseOnStill: vi.fn(() => Promise.reject(new Error('x'))) });
    expect(await runner.run(request)).toMatchObject({ ok: false, reason: 'failed' });
    expect(deps.release).toHaveBeenCalled();
  });

  it('refuses a second run while one is open', async () => {
    let finish: () => void = () => undefined;
    const { runner } = build({
      pick: vi.fn(
        () =>
          new Promise<undefined>((resolve) => {
            finish = () => {
              resolve(undefined);
            };
          }),
      ),
    });
    const first = runner.run(request);
    expect(await runner.run(request)).toEqual({ ok: false, reason: 'busy' });
    finish();
    await first;
  });
});

describe('the mouse hook on Linux sessions', () => {
  const base = {
    platform: 'linux' as const,
    load: () => Promise.reject(new Error('should not load')),
    isAccessibilityTrusted: () => false,
    locate: (p: { x: number; y: number }) => p,
  };

  it.each([[{ XDG_SESSION_TYPE: 'wayland' }], [{ WAYLAND_DISPLAY: 'wayland-0' }]])(
    'reports unavailable on Wayland (%j) without loading the native module',
    async (env) => {
      const result = await createHookSource({ ...base, env }).start(() => undefined);
      expect(result).toEqual({ status: 'unavailable', reason: 'wayland' });
    },
  );

  it('tries the hook on X11', async () => {
    const result = await createHookSource({ ...base, env: { XDG_SESSION_TYPE: 'x11' } }).start(
      () => undefined,
    );
    expect(result).toMatchObject({ status: 'unavailable', reason: 'error' });
  });
});
