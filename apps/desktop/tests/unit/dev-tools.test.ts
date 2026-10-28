import { describe, expect, it } from 'vitest';
import { readDevTool, runDevTool, type DevToolDeps } from '../../src/main/recording/dev-tools';

describe('readDevTool', () => {
  it('is ignored when the app is packaged', () => {
    expect(readDevTool({ SCRIM_DEV_TOOL: 'region' }, true)).toBeUndefined();
  });

  it('reads the three tools and nothing else', () => {
    expect(readDevTool({ SCRIM_DEV_TOOL: 'region' }, false)).toBe('region');
    expect(readDevTool({ SCRIM_DEV_TOOL: 'sources' }, false)).toBe('sources');
    expect(readDevTool({ SCRIM_DEV_TOOL: 'shot' }, false)).toBe('shot');
    expect(readDevTool({ SCRIM_DEV_TOOL: 'rm' }, false)).toBeUndefined();
    expect(readDevTool({}, false)).toBeUndefined();
  });
});

describe('runDevTool', () => {
  function setup(overrides: Partial<DevToolDeps> = {}) {
    const logs: string[] = [];
    let done = 0;
    const calls: string[] = [];
    const deps: DevToolDeps = {
      pickRegion: () => {
        calls.push('region');
        return Promise.resolve({ ok: false, reason: 'cancelled' });
      },
      listSources: () => {
        calls.push('sources');
        return Promise.resolve([
          {
            id: 'screen:0:0',
            kind: 'display',
            name: 'Screen 1',
            thumbnail: 'data:image/png;base64,AAAA',
          },
          { id: 'window:1:0', kind: 'window', name: 'Notes', thumbnail: '' },
        ]);
      },
      takeShot: (source, options) => {
        calls.push(
          `shot ${source.kind} ${String(options.folder)} ${String(options.copyToClipboard)}`,
        );
        return Promise.resolve({
          ok: true,
          value: { copied: true, width: 10, height: 5, path: 'p.png' },
        });
      },
      folder: 'C:/tmp',
      log: (message) => logs.push(message),
      done: () => {
        done += 1;
      },
      ...overrides,
    };
    return { deps, logs, calls, done: () => done };
  }

  it('logs the region outcome and finishes', async () => {
    const { deps, logs, done } = setup();
    await runDevTool('region', deps);
    expect(logs).toEqual(['DEV REGION {"ok":false,"reason":"cancelled"}']);
    expect(done()).toBe(1);
  });

  it('logs names and ids of sources but never the picture', async () => {
    const { deps, logs } = setup();
    await runDevTool('sources', deps);
    expect(logs).toEqual([
      'DEV SOURCES 2 found',
      'DEV SOURCE display screen:0:0 "Screen 1" thumbnail',
      'DEV SOURCE window window:1:0 "Notes" no thumbnail',
    ]);
    expect(logs.join(' ')).not.toContain('base64');
  });

  it('takes a display screenshot into the folder and copies it', async () => {
    const { deps, logs, calls } = setup();
    await runDevTool('shot', deps);
    expect(calls).toEqual(['shot display C:/tmp true']);
    expect(logs[0]).toContain('DEV SHOT');
  });

  it('reports a failed screenshot and a thrown error, and always finishes', async () => {
    const failed = setup({
      takeShot: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'screen-unavailable', message: 'Not available.', nextStep: 'Retry.' },
        }),
    });
    await runDevTool('shot', failed.deps);
    expect(failed.logs[0]).toBe('DEV SHOT failed: Not available.');
    expect(failed.done()).toBe(1);

    const thrown = setup({ pickRegion: () => Promise.reject(new Error('boom')) });
    await runDevTool('region', thrown.deps);
    expect(thrown.logs[0]).toBe('DEV TOOL failed: boom');
    expect(thrown.done()).toBe(1);
  });
});
