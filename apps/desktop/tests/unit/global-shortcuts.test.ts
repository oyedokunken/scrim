import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ACCELERATORS,
  registerGlobalShortcuts,
  type ShortcutApi,
} from '../../src/main/shell/global-shortcuts';

function fakeApi(taken: string[] = []) {
  const callbacks = new Map<string, () => void>();
  const api: ShortcutApi = {
    register: (accelerator, callback) => {
      if (taken.includes(accelerator)) return false;
      callbacks.set(accelerator, callback);
      return true;
    },
    unregister: (accelerator) => {
      callbacks.delete(accelerator);
    },
  };
  return { api, callbacks, press: (accelerator: string) => callbacks.get(accelerator)?.() };
}

function setup(options: { recording?: boolean; taken?: string[]; screenshot?: boolean } = {}) {
  const keys = fakeApi(options.taken);
  let recording = options.recording ?? false;
  const actions = {
    isRecording: () => recording,
    record: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    ...(options.screenshot ? { screenshot: vi.fn(() => Promise.resolve()) } : {}),
  };
  const onError = vi.fn();
  const registration = registerGlobalShortcuts({ api: keys.api, actions, onError });
  return {
    ...keys,
    actions,
    onError,
    registration,
    setRecording: (value: boolean) => {
      recording = value;
    },
  };
}

describe('registerGlobalShortcuts', () => {
  it('uses Ctrl Shift R, S and X', () => {
    expect(DEFAULT_ACCELERATORS).toEqual({
      record: 'CommandOrControl+Shift+R',
      stop: 'CommandOrControl+Shift+S',
      screenshot: 'CommandOrControl+Shift+X',
    });
  });

  it('registers record and stop, and screenshot only when it exists', () => {
    expect([...setup().callbacks.keys()]).toEqual([
      DEFAULT_ACCELERATORS.record,
      DEFAULT_ACCELERATORS.stop,
    ]);
    expect([...setup({ screenshot: true }).callbacks.keys()]).toContain(
      DEFAULT_ACCELERATORS.screenshot,
    );
  });

  it('starts a recording when idle', () => {
    const t = setup();
    t.press(DEFAULT_ACCELERATORS.record);
    expect(t.actions.record).toHaveBeenCalledTimes(1);
  });

  it('does not start a second recording while one is running', () => {
    const t = setup({ recording: true });
    t.press(DEFAULT_ACCELERATORS.record);
    expect(t.actions.record).not.toHaveBeenCalled();
  });

  it('stops only while recording', () => {
    const t = setup();
    t.press(DEFAULT_ACCELERATORS.stop);
    expect(t.actions.stop).not.toHaveBeenCalled();
    t.setRecording(true);
    t.press(DEFAULT_ACCELERATORS.stop);
    expect(t.actions.stop).toHaveBeenCalledTimes(1);
  });

  it('does not take a screenshot while recording', () => {
    const t = setup({ screenshot: true, recording: true });
    t.press(DEFAULT_ACCELERATORS.screenshot);
    expect(t.actions.screenshot).not.toHaveBeenCalled();
  });

  it('reports a failed action instead of throwing from the callback', async () => {
    const keys = fakeApi();
    const failure = new Error('disk full');
    const onError = vi.fn();
    registerGlobalShortcuts({
      api: keys.api,
      actions: {
        isRecording: () => false,
        record: () => Promise.reject(failure),
        stop: () => Promise.resolve(),
      },
      onError,
    });
    keys.press(DEFAULT_ACCELERATORS.record);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('record', failure);
  });

  it('names the shortcuts another app already owns', () => {
    const t = setup({ taken: [DEFAULT_ACCELERATORS.stop] });
    expect(t.registration.unavailable).toEqual(['stop']);
    expect(t.callbacks.has(DEFAULT_ACCELERATORS.record)).toBe(true);
  });

  it('gives every shortcut back on dispose, and only its own', () => {
    const t = setup({ taken: [DEFAULT_ACCELERATORS.stop] });
    t.registration.dispose();
    expect(t.callbacks.size).toBe(0);
  });
});
