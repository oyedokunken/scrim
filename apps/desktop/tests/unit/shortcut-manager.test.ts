import { describe, expect, it, vi } from 'vitest';
import { createShortcutManager } from '../../src/main/shell/shortcut-manager';
import { DEFAULT_ACCELERATORS } from '../../src/shared/shortcut-keys';

function setup(taken: string[] = []) {
  const registered = new Map<string, () => void>();
  const api = {
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (taken.includes(accelerator)) return false;
      registered.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => {
      registered.delete(accelerator);
    }),
  };
  const log = vi.fn();
  const manager = createShortcutManager({
    api,
    actions: {
      isRecording: () => false,
      record: () => Promise.resolve(),
      stop: () => Promise.resolve(),
      screenshot: () => Promise.resolve(),
    },
    onError: vi.fn(),
    log,
  });
  return { manager, api, registered, log };
}

describe('the shortcut manager', () => {
  it('registers the three keys it is given', () => {
    const { manager, registered } = setup();
    manager.apply(DEFAULT_ACCELERATORS);
    expect([...registered.keys()].sort()).toEqual(Object.values(DEFAULT_ACCELERATORS).sort());
  });

  it('does nothing when the keys are the same', () => {
    const { manager, api } = setup();
    manager.apply(DEFAULT_ACCELERATORS);
    manager.apply({ ...DEFAULT_ACCELERATORS });
    expect(api.register).toHaveBeenCalledTimes(3);
    expect(api.unregister).not.toHaveBeenCalled();
  });

  it('lets go of the old key and registers the new one at once', () => {
    const { manager, registered } = setup();
    manager.apply(DEFAULT_ACCELERATORS);
    manager.apply({ ...DEFAULT_ACCELERATORS, record: 'CommandOrControl+Alt+R' });
    expect(registered.has('CommandOrControl+Shift+R')).toBe(false);
    expect(registered.has('CommandOrControl+Alt+R')).toBe(true);
    expect(registered.size).toBe(3);
  });

  it('remembers a key another program owns, and logs it', () => {
    const { manager, log } = setup(['CommandOrControl+Shift+S']);
    manager.apply(DEFAULT_ACCELERATORS);
    expect(manager.unavailable()).toEqual(['stop']);
    expect(log).toHaveBeenCalledWith('shortcut.unavailable', ['stop']);
    manager.apply({ ...DEFAULT_ACCELERATORS, stop: 'CommandOrControl+Alt+S' });
    expect(manager.unavailable()).toEqual([]);
  });

  it('lets go of every key while suspended and takes them back after', () => {
    const { manager, registered } = setup();
    manager.apply(DEFAULT_ACCELERATORS);
    manager.suspend(true);
    expect(registered.size).toBe(0);
    // A key chosen while suspended is remembered and registered when the shortcuts return.
    manager.apply({ ...DEFAULT_ACCELERATORS, record: 'CommandOrControl+Alt+R' });
    expect(registered.size).toBe(0);
    manager.suspend(false);
    expect(registered.has('CommandOrControl+Alt+R')).toBe(true);
    expect(registered.size).toBe(3);
    manager.suspend(false);
    expect(registered.size).toBe(3);
  });

  it('releases everything on dispose', () => {
    const { manager, registered } = setup();
    manager.apply(DEFAULT_ACCELERATORS);
    manager.dispose();
    expect(registered.size).toBe(0);
    expect(manager.unavailable()).toEqual([]);
  });
});
