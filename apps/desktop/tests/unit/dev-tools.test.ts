import { describe, expect, it } from 'vitest';
import type { AreaOutcome, AreaRequest } from '../../src/main/recording/area-flow';
import { readDevTool, runDevTool, type DevToolDeps } from '../../src/main/recording/dev-tools';

describe('readDevTool', () => {
  it('is ignored when the app is packaged', () => {
    expect(readDevTool({ SCRIM_DEV_TOOL: 'area-shot' }, true)).toBeUndefined();
  });

  it('reads the four tools and nothing else', () => {
    for (const tool of ['area-shot', 'area-record', 'area-pick', 'sources', 'shot']) {
      expect(readDevTool({ SCRIM_DEV_TOOL: tool }, false)).toBe(tool);
    }
    expect(readDevTool({ SCRIM_DEV_TOOL: 'rm' }, false)).toBeUndefined();
    expect(readDevTool({ SCRIM_DEV_TOOL: 'region' }, false)).toBeUndefined();
    expect(readDevTool({}, false)).toBeUndefined();
  });
});

describe('runDevTool', () => {
  function setup(
    area: AreaOutcome = { ok: false, reason: 'cancelled' },
    overrides: Partial<DevToolDeps> = {},
  ) {
    const logs: string[] = [];
    const calls: string[] = [];
    const requests: AreaRequest[] = [];
    let done = 0;
    const deps: DevToolDeps = {
      runArea: (request) => {
        requests.push(request);
        return Promise.resolve(area);
      },
      stopRecording: () => {
        calls.push('stop');
        return Promise.resolve();
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
      wait: (ms) => {
        calls.push(`wait ${String(ms)}`);
        return Promise.resolve();
      },
      folder: 'C:/tmp',
      seconds: 7,
      log: (message) => logs.push(message),
      done: () => {
        done += 1;
      },
      ...overrides,
    };
    return { deps, logs, calls, requests, done: () => done };
  }

  it('shows the area overlay for a screenshot and logs the outcome', async () => {
    const { deps, logs, requests, done } = setup();
    await runDevTool('area-shot', deps);
    expect(requests[0]).toMatchObject({
      mode: 'screenshot',
      folder: 'C:/tmp',
      copyToClipboard: true,
    });
    expect(logs).toEqual(['DEV AREA {"ok":false,"reason":"cancelled"}']);
    expect(done()).toBe(1);
  });

  it('area-pick asks for a recording but waits and stops nothing', async () => {
    const { deps, calls, requests, logs } = setup({ ok: true, mode: 'record', folder: 'dry run' });
    await runDevTool('area-pick', deps);
    expect(requests[0]).toMatchObject({ mode: 'record' });
    expect(calls).toEqual([]);
    expect(logs).toHaveLength(1);
  });

  it('records from the overlay for the set time and then stops', async () => {
    const { deps, logs, calls, requests } = setup({ ok: true, mode: 'record', folder: 'F' });
    await runDevTool('area-record', deps);
    expect(requests[0]).toMatchObject({ mode: 'record', destination: 'C:/tmp' });
    expect(calls).toEqual(['wait 7000', 'stop']);
    expect(logs).toEqual(['DEV AREA {"ok":true,"mode":"record","folder":"F"}', 'DEV AREA stopped']);
  });

  it('does not wait or stop when nothing was started', async () => {
    const { deps, calls } = setup({ ok: false, reason: 'cancelled' });
    await runDevTool('area-record', deps);
    expect(calls).toEqual([]);
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
    const failed = setup(undefined, {
      takeShot: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'screen-unavailable', message: 'Not available.', nextStep: 'Retry.' },
        }),
    });
    await runDevTool('shot', failed.deps);
    expect(failed.logs[0]).toBe('DEV SHOT failed: Not available.');
    expect(failed.done()).toBe(1);

    const thrown = setup(undefined, { runArea: () => Promise.reject(new Error('boom')) });
    await runDevTool('area-shot', thrown.deps);
    expect(thrown.logs[0]).toBe('DEV TOOL failed: boom');
    expect(thrown.done()).toBe(1);
  });
});
