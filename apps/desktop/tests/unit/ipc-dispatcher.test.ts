import { describe, expect, it, vi } from 'vitest';
import {
  createDispatcher,
  IpcError,
  isTrustedSender,
  type Handlers,
  type IpcFailure,
} from '../../src/main/ipc/dispatcher';
import { createRecordingHandlers } from '../../src/main/ipc/recording-handlers';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import { fakeRecording } from './support/recording-api-fake';

const ORIGIN = 'app://scrim';
const good = { frameUrl: 'app://scrim/index.html', isMainFrame: true };

function setup(overrides: Partial<Handlers> = {}) {
  const failures: [IpcFailure, string][] = [];
  const handlers: Handlers = {
    'app:version': () => '1.0.0',
    'settings:get': () => DEFAULT_SETTINGS,
    'settings:set': () => DEFAULT_SETTINGS,
    'folder:choose': () => null,
    'folder:open': () => undefined,
    'shell:open-external': () => undefined,
    'shell:show-in-folder': () => undefined,
    'logs:open-folder': () => undefined,
    'window:close-answer': () => undefined,
    'shortcuts:status': () => ({ unavailable: [] }),
    'shortcuts:suspend': () => undefined,
    'legacy:count': () => 0,
    'legacy:move': () => ({ moved: 0, failed: 0 }),
    'area:run': () => ({ ok: false, reason: 'cancelled' }),
    'area:cancel': () => undefined,
    ...createRecordingHandlers({ recording: fakeRecording(), destination: () => null }),
    'image:read': () => 'data:image/png;base64,AA==',
    'image:save-edited': () => ({ path: 'x.png', copied: false }),
    'image:copy': () => undefined,
    'image:save-as': () => ({ path: null }),
    'image:drag': () => undefined,
    'image:delete': () => undefined,
    'image:list': () => [],
    'image:share': () => undefined,
    'library:list': () => [],
    'library:thumbnail': () => null,
    'library:open': () => ({ kind: 'missing' }),
    'library:rename': () => ({ ok: true }),
    'library:reveal': () => undefined,
    'library:delete': () => undefined,
    'library:share': () => undefined,
    'share:available': () => false,
    'export:start': () => null,
    'export:cancel': () => undefined,
    'export:retry-safer': () => null,
    'export:latest': () => null,
    'export:reveal': () => false,
    'editor:open': () => ({
      ok: false,
      error: { code: 'unknown', message: 'm', nextStep: 'n' },
    }),
    'editor:save-edits': () => ({ ok: true, value: undefined }),
    'image:thumbnail': () => 'data:image/png;base64,AA==',
    ...overrides,
  };
  const dispatch = createDispatcher({
    handlers,
    allowedOrigin: ORIGIN,
    onFailure: (failure, channel) => failures.push([failure, channel]),
  });
  return { dispatch, failures };
}

const failureOf = async (promise: Promise<unknown>): Promise<IpcFailure | undefined> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof IpcError ? error.failure : undefined;
  }
};

describe('isTrustedSender', () => {
  it.each([
    [good, true],
    [{ frameUrl: 'app://scrim/', isMainFrame: true }, true],
    [null, false],
    [undefined, false],
    [{ frameUrl: 'app://scrim/index.html', isMainFrame: false }, false],
    [{ frameUrl: 'https://evil.example/', isMainFrame: true }, false],
    [{ frameUrl: 'app://evil/index.html', isMainFrame: true }, false],
    [{ frameUrl: 'file:///C:/page.html', isMainFrame: true }, false],
    [{ frameUrl: 'null', isMainFrame: true }, false],
    [{ frameUrl: '', isMainFrame: true }, false],
  ])('%j -> %s', (sender, expected) => {
    expect(isTrustedSender(sender, ORIGIN)).toBe(expected);
  });
});

describe('the dispatcher', () => {
  it('runs a valid call and returns the validated output', async () => {
    const { dispatch } = setup();
    expect(await dispatch('settings:get', good, [undefined])).toEqual(DEFAULT_SETTINGS);
    expect(await dispatch('settings:get', good, [])).toEqual(DEFAULT_SETTINGS);
  });

  it('passes the parsed input to the handler', async () => {
    const set = vi.fn<Handlers['settings:set']>(() => DEFAULT_SETTINGS);
    const { dispatch } = setup({ 'settings:set': set });
    await dispatch('settings:set', good, [{ zoomLevel: 2 }]);
    expect(set).toHaveBeenCalledWith({ zoomLevel: 2 });
  });

  it('rejects a forged sender and never runs the handler', async () => {
    const handler = vi.fn(() => DEFAULT_SETTINGS);
    const { dispatch, failures } = setup({ 'settings:get': handler });
    const forged = { frameUrl: 'https://evil.example/', isMainFrame: true };
    expect(await failureOf(dispatch('settings:get', forged, []))).toBe('forbidden-sender');
    expect(handler).not.toHaveBeenCalled();
    expect(failures).toEqual([['forbidden-sender', 'settings:get']]);
  });

  it('rejects a call whose sender frame is null', async () => {
    const handler = vi.fn(() => DEFAULT_SETTINGS);
    const { dispatch } = setup({ 'settings:get': handler });
    expect(await failureOf(dispatch('settings:get', null, []))).toBe('forbidden-sender');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects a call from a subframe of our own page', async () => {
    const { dispatch } = setup();
    const frame = { frameUrl: 'app://scrim/index.html', isMainFrame: false };
    expect(await failureOf(dispatch('settings:get', frame, []))).toBe('forbidden-sender');
  });

  it.each([
    ['not a string', 5],
    ['an unknown channel', 'settings:delete-everything'],
    ['an inherited property name', 'constructor'],
    ['an empty string', ''],
  ])('rejects %s as a channel', async (_name, channel) => {
    const { dispatch } = setup();
    expect(await failureOf(dispatch(channel, good, []))).toBe('unknown-channel');
  });

  it.each([
    ['settings:set', [{ zoomLevel: 99 }]],
    ['settings:set', [{ other: 1 }]],
    ['settings:set', []],
    ['settings:get', ['stray']],
    ['shell:open-external', [{ url: 'https://example.com/' }]],
    ['settings:get', [undefined, 'second argument']],
  ])('rejects invalid input to %s: %j', async (channel, args) => {
    const handler = vi.fn(() => DEFAULT_SETTINGS);
    const { dispatch } = setup({ 'settings:get': handler, 'settings:set': handler });
    expect(await failureOf(dispatch(channel, good, args))).toBe('invalid-input');
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses to send an output that breaks the contract', async () => {
    const { dispatch } = setup({
      'settings:get': () => ({ ...DEFAULT_SETTINGS, zoomLevel: 99 }),
    });
    expect(await failureOf(dispatch('settings:get', good, []))).toBe('invalid-output');
  });

  it('turns a handler failure into a plain message with no detail', async () => {
    const { dispatch } = setup({
      'folder:choose': () => {
        throw new Error('EACCES: permission denied, open C:\\Users\\zainab\\secret.txt');
      },
    });
    const error = await dispatch('folder:choose', good, [{ kind: 'recordings' }]).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(IpcError);
    expect((error as IpcError).failure).toBe('handler-failed');
    expect((error as IpcError).message).toBe('Scrim could not complete that request.');
    expect((error as IpcError).message).not.toMatch(/zainab|EACCES/);
  });

  it('does not report the input or error text to the failure hook', async () => {
    const { dispatch, failures } = setup();
    await failureOf(dispatch('settings:set', good, [{ zoomLevel: 'C:\\Users\\zainab\\x' }]));
    expect(JSON.stringify(failures)).not.toMatch(/zainab/);
  });
});
