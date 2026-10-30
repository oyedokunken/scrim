import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createUpdateController,
  notesToText,
  scheduleStartupCheck,
} from '../../src/main/updates/update-controller';
import { classifyUpdateError } from '../../src/main/updates/update-errors';
import { updateSnapshotSchema, type UpdateSnapshot } from '../../src/shared/updates-contract';
import { createHttpUpdater, startMockUpdateServer, type MockServer } from './support/update-server';

type Busy = 'recording' | 'exporting' | null;

function setup(base: string, options: { busy?: () => Busy; current?: string } = {}) {
  const updater = createHttpUpdater(base, options.current ?? '1.0.0');
  const checkSpy = vi.spyOn(updater, 'checkForUpdates');
  const downloadSpy = vi.spyOn(updater, 'downloadUpdate');
  const installSpy = vi.spyOn(updater, 'quitAndInstall');
  const changes: UpdateSnapshot[] = [];
  const logs: [string, Record<string, string | number | boolean>][] = [];
  const controller = createUpdateController({
    updater,
    unsupported: 'no',
    busy: options.busy ?? (() => null),
    log: (event, fields) => logs.push([event, fields]),
    onChange: (snapshot) => changes.push(snapshot),
  });
  return { controller, changes, logs, checkSpy, downloadSpy, installSpy };
}

let server: MockServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const FILE = Buffer.from('a small installer');

describe('the update flow against a local server', () => {
  it('finds a newer version, downloads it only when asked, and waits for the restart', async () => {
    server = await startMockUpdateServer({
      version: '1.1.0',
      file: FILE,
      notes: '<h2>New</h2><ul><li>Faster export</li><li>Fewer &amp; better bugs</li></ul>',
    });
    const { controller, changes, installSpy, downloadSpy } = setup(server.url);

    const found = await controller.check();
    expect(found.state).toMatchObject({
      phase: 'available',
      info: { version: '1.1.0', sizeBytes: FILE.length },
    });
    expect(found.state.phase === 'available' && found.state.info.notes).toBe(
      'New\n\n- Faster export\n- Fewer & better bugs',
    );
    // Finding an update downloads nothing.
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(server.requests).toEqual(['/latest.yml']);

    const downloaded = await controller.download();
    expect(downloaded.state.phase).toBe('ready');
    expect(server.requests).toEqual(['/latest.yml', '/Scrim-Setup-1.1.0.exe']);
    expect(
      changes.some((entry) => entry.state.phase === 'downloading' && entry.state.percent === 50),
    ).toBe(true);
    // Downloading does not install. Only the restart does.
    expect(installSpy).not.toHaveBeenCalled();
    controller.install();
    expect(installSpy).toHaveBeenCalledTimes(1);
    for (const change of changes) expect(updateSnapshotSchema.safeParse(change).success).toBe(true);
  });

  it('says there is no update when the server has the same version', async () => {
    server = await startMockUpdateServer({ version: '1.0.0', file: FILE });
    const { controller } = setup(server.url);
    expect((await controller.check()).state.phase).toBe('none');
  });

  it('throws away a download whose checksum does not match and installs nothing', async () => {
    server = await startMockUpdateServer({ version: '1.1.0', file: FILE, sha512: 'AAAA' });
    const { controller, installSpy, logs } = setup(server.url);
    await controller.check();
    const result = await controller.download();
    expect(result.state).toMatchObject({ phase: 'error', kind: 'checksum' });
    expect(result.state.phase === 'error' && result.state.info?.version).toBe('1.1.0');
    expect(() => {
      controller.install();
    }).toThrow();
    expect(installSpy).not.toHaveBeenCalled();
    expect(logs.at(-1)).toEqual(['updates.download-failed', { kind: 'checksum' }]);
  });

  it('can try again after a failed download', async () => {
    server = await startMockUpdateServer({ version: '1.1.0', file: FILE, sha512: 'AAAA' });
    const { controller, downloadSpy } = setup(server.url);
    await controller.check();
    await controller.download();
    await controller.download();
    expect(downloadSpy).toHaveBeenCalledTimes(2);
  });

  it('reports a missing release page plainly', async () => {
    server = await startMockUpdateServer(null);
    const { controller } = setup(server.url);
    const result = await controller.check();
    expect(result.state).toMatchObject({ phase: 'error', kind: 'not-found' });
  });

  it('reports being offline when the server cannot be reached', async () => {
    server = await startMockUpdateServer(null);
    const url = server.url;
    await server.close();
    server = undefined;
    const { controller } = setup(url);
    const result = await controller.check();
    expect(result.state).toMatchObject({ phase: 'error', kind: 'offline' });
  });
});

describe('nothing happens while the app is busy', () => {
  it.each(['recording', 'exporting'] as const)(
    'does not touch the network while %s',
    async (reason) => {
      server = await startMockUpdateServer({ version: '1.1.0', file: FILE });
      const { controller, checkSpy } = setup(server.url, { busy: () => reason });
      const result = await controller.check();
      expect(result.blocked).toBe(reason);
      expect(result.state.phase).toBe('idle');
      expect(checkSpy).not.toHaveBeenCalled();
      expect(server.requests).toEqual([]);
    },
  );

  it('does not check while the editor is open, and does again after it closes', async () => {
    server = await startMockUpdateServer({ version: '1.1.0', file: FILE });
    const { controller, checkSpy } = setup(server.url);
    controller.setEditing(true);
    expect((await controller.check()).blocked).toBe('editing');
    expect(checkSpy).not.toHaveBeenCalled();
    controller.setEditing(false);
    expect((await controller.check()).state.phase).toBe('available');
  });

  it('does not download or install when work started after the check', async () => {
    server = await startMockUpdateServer({ version: '1.1.0', file: FILE });
    let busy: Busy = null;
    const { controller, downloadSpy, installSpy } = setup(server.url, { busy: () => busy });
    await controller.check();
    busy = 'exporting';
    expect((await controller.download()).state.phase).toBe('available');
    expect(downloadSpy).not.toHaveBeenCalled();
    busy = null;
    await controller.download();
    busy = 'recording';
    expect(() => {
      controller.install();
    }).toThrow();
    expect(installSpy).not.toHaveBeenCalled();
  });

  it('keeps the state quiet when the startup check fails', async () => {
    server = await startMockUpdateServer(null);
    const { controller } = setup(server.url);
    const result = await controller.check({ automatic: true });
    expect(result.state.phase).toBe('idle');
  });

  it('shows no update tools on an install that cannot update itself', async () => {
    const controller = createUpdateController({
      updater: null,
      unsupported: 'Updates work in the installed app.',
      busy: () => null,
      log: () => undefined,
      onChange: () => undefined,
    });
    expect((await controller.check()).state).toEqual({
      phase: 'unsupported',
      message: 'Updates work in the installed app.',
    });
    expect((await controller.download()).state.phase).toBe('unsupported');
    expect(() => {
      controller.install();
    }).toThrow();
  });
});

describe('the check at start', () => {
  const run = (enabledAtStart: boolean, enabledLater: boolean) => {
    let enabled = enabledAtStart;
    const timers: { run: () => void; ms: number }[] = [];
    const check = vi.fn(() => Promise.resolve());
    const scheduled = scheduleStartupCheck({
      enabled: () => enabled,
      check,
      delayMs: 30_000,
      setTimer: (callback, ms) => timers.push({ run: callback, ms }),
    });
    enabled = enabledLater;
    timers[0]?.run();
    return { scheduled, check, timers };
  };

  it('is not even scheduled while the setting is off, which is how it starts', () => {
    const { scheduled, check, timers } = run(false, false);
    expect(scheduled).toBe(false);
    expect(timers).toHaveLength(0);
    expect(check).not.toHaveBeenCalled();
  });

  it('runs once, after a wait, when the setting is on', () => {
    const { scheduled, check, timers } = run(true, true);
    expect(scheduled).toBe(true);
    expect(timers[0]?.ms).toBe(30_000);
    expect(check).toHaveBeenCalledOnce();
  });

  it('does not run if the person turned the setting off during the wait', () => {
    expect(run(true, false).check).not.toHaveBeenCalled();
  });
});

describe('release notes as text', () => {
  it('strips markup and never leaves a tag behind', () => {
    expect(notesToText('<p>Hello <b>there</b></p><script>alert(1)</script>')).toBe(
      'Hello there\n\nalert(1)',
    );
    expect(notesToText(null)).toBe('');
    expect(notesToText([{ note: 'One' }, { note: null }, { note: 'Two' }])).toBe('One\n\nTwo');
  });

  it('cuts very long notes', () => {
    expect(notesToText('x'.repeat(9000)).length).toBeLessThanOrEqual(4000);
  });
});

describe('update failures', () => {
  const kind = (error: unknown) => classifyUpdateError(error).kind;

  it('sorts failures into kinds a person can act on', () => {
    expect(
      kind(Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' })),
    ).toBe('offline');
    expect(kind(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe('offline');
    expect(kind(new Error('sha512 checksum mismatch, expected a, got b'))).toBe('checksum');
    expect(kind(new Error('New version 1.2.0 is not signed by the application owner'))).toBe(
      'signature',
    );
    expect(kind(new Error('HttpError: 403 rate limit exceeded'))).toBe('blocked');
    expect(kind(new Error('Cannot find latest.yml in the latest release artifacts'))).toBe(
      'not-found',
    );
    expect(kind(new Error('something odd'))).toBe('unknown');
    expect(kind(undefined)).toBe('unknown');
  });

  it('never repeats the updater text, which can hold addresses and file names', () => {
    const failure = classifyUpdateError(
      new Error('ENOTFOUND https://private.example/token=abc C:\\Users\\Someone\\file'),
    );
    expect(JSON.stringify(failure)).not.toMatch(/private|token|Someone/);
  });
});
