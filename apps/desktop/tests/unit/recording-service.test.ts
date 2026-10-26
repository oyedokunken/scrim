import { parseInputNdjson, sessionFileSchema, sessionLogSchema } from '@scrim/core';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, flushWork, type Harness } from './support/engine-harness';

let harness: Harness | undefined;

function errorCode(result: { ok: boolean; error?: { code: string } }): string | undefined {
  return result.ok ? undefined : result.error?.code;
}

afterEach(async () => {
  // Every file the engine opened must have been closed again, whatever happened.
  expect([...(harness?.openSinks ?? [])]).toEqual([]);
  await harness?.cleanup();
  harness = undefined;
});

async function started(
  options: Parameters<typeof createHarness>[0] = {},
  recording: Partial<Harness['options']> = {},
) {
  const h = await createHarness(options);
  harness = h;
  const result = await h.service.start({ ...h.options, name: 'Demo', ...recording });
  if (!result.ok) throw new Error(`start failed: ${result.error.code}`);
  return { h, folder: result.value.folder };
}

const readSessionFile = async (folder: string) =>
  sessionFileSchema.parse(JSON.parse(await readFile(join(folder, 'session.json'), 'utf8')));

describe('a normal recording', () => {
  it('records, stops and leaves playable files, the mouse log and a clean session', async () => {
    const { h, folder } = await started();
    expect(folder).toBe(join(h.destination, 'Demo.scrim'));
    expect(h.service.snapshot().phase).toBe('recording');

    h.sendChunk('screen', 100, 7);
    h.sendChunk('screen', 100, 7);
    h.sendChunk('screen', 100, 7);
    h.clock.time += 500;
    h.input.click(100, 100);
    await flushWork();

    const result = await h.service.stop();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = await readFile(join(folder, 'screen.raw.webm'));
    expect(raw.byteLength).toBe(300);
    expect(new Set(raw)).toEqual(new Set([7]));

    expect(result.value.files).toEqual([{ kind: 'screen', path: join(folder, 'screen.mp4') }]);
    expect(await readdir(folder)).not.toContain('input.ndjson');
    const log = sessionLogSchema.parse(
      JSON.parse(await readFile(join(folder, 'Demo.scrim.json'), 'utf8')),
    );
    expect(log.frame).toEqual({ width: 1920, height: 1080 });
    expect(log.events).toEqual([{ type: 'click', t: 450, x: 100, y: 100, button: 'left' }]);

    const session = await readSessionFile(folder);
    expect(session.cleanClose).toBe(true);
    expect(session.recovered).toBeUndefined();
    expect(session.tracks[0]).toMatchObject({
      kind: 'screen',
      complete: true,
      bytesWritten: 300,
      playableFile: 'screen.mp4',
      startedAt: 50,
    });
    expect(session.clock).toEqual({ rendererOffsetMs: 1000, uncertaintyMs: 0 });
    expect(session.capture.cursor).toBe('hidden');
    expect(session.input).toEqual({ status: 'recorded', file: 'input.ndjson' });
    expect(session.pid).toBe(4242);
    expect(await h.deps.index.list()).toEqual([]);
    expect(h.service.snapshot().phase).toBe('stopped');
  });

  it('reports the finished recording and the states along the way', async () => {
    const { h } = await started();
    h.sendChunk('screen');
    h.clock.time += 2000;
    await h.service.stop();
    const types = h.events.map((event) => event.type);
    expect(types[0]).toBe('state');
    expect(types).toContain('finished');
    const finished = h.events.find((event) => event.type === 'finished');
    expect(finished?.type === 'finished' && finished.result.durationMs).toBe(1950);
    expect(finished?.type === 'finished' && finished.result.recovered).toBe(false);
    const phases = h.events.flatMap((event) =>
      event.type === 'state' ? [event.snapshot.phase] : [],
    );
    expect(phases).toEqual(expect.arrayContaining(['starting', 'recording', 'stopped']));
  });

  it('records the camera and the microphone as their own tracks', async () => {
    const { h, folder } = await started({}, { camera: { enabled: true }, mic: { enabled: true } });
    h.sendChunk('screen', 10);
    h.sendChunk('camera', 20);
    h.sendChunk('mic', 30);
    const result = await h.service.stop();
    expect(result.ok && result.value.files.map((file) => file.kind).sort()).toEqual([
      'camera',
      'mic',
      'screen',
    ]);
    expect((await readFile(join(folder, 'camera.raw.webm'))).byteLength).toBe(20);
    expect((await readFile(join(folder, 'mic.raw.webm'))).byteLength).toBe(30);
    const names = await readdir(folder);
    expect(names).toEqual(expect.arrayContaining(['camera.mp4', 'mic.webm', 'screen.mp4']));
  });

  it('writes the heartbeat with the bytes that reached the disk', async () => {
    const { h, folder } = await started();
    h.sendChunk('screen', 64);
    await flushWork();
    h.clock.time += 1000;
    h.fireHeartbeat();
    await flushWork();
    const session = await readSessionFile(folder);
    expect(session.cleanClose).toBe(false);
    expect(session.tracks[0]?.bytesWritten).toBe(64);
    expect(session.heartbeatElapsedMs).toBe(1000);
    expect(await h.deps.index.list()).toEqual([folder]);
    await h.service.stop();
  });

  it('numbers a second folder when the name is taken, and can record again after stopping', async () => {
    const { h } = await started();
    h.sendChunk('screen');
    await h.service.stop();
    const again = await h.service.start({ ...h.options, name: 'Demo' });
    expect(again.ok && again.value.folder).toBe(join(h.destination, 'Demo 2.scrim'));
    await h.service.stop();
  });

  it('gives a dated name by default', async () => {
    const h = await createHarness();
    harness = h;
    const result = await h.service.start(h.options);
    expect(result.ok && result.value.folder).toMatch(/Scrim 2026-10-26 \d\d\.\d\d\.\d\d\.scrim$/);
    await h.service.stop();
  });
});

describe('pause and resume', () => {
  it('records the pauses on the main clock and drops mouse events inside them', async () => {
    const { h, folder } = await started();
    h.sendChunk('screen');
    h.clock.time += 1000;
    h.input.click(10, 10);
    await h.service.pause();
    h.clock.time += 3000;
    h.input.click(20, 20);
    await h.service.resume();
    h.clock.time += 500;
    h.input.click(30, 30);
    h.sendChunk('screen');
    await flushWork();
    const result = await h.service.stop();
    expect(result.ok).toBe(true);

    const session = await readSessionFile(folder);
    expect(session.pauses).toEqual([{ pausedAt: 1000, resumedAt: 4000 }]);
    const log = sessionLogSchema.parse(
      JSON.parse(await readFile(join(folder, 'Demo.scrim.json'), 'utf8')),
    );
    expect(log.events.map((event) => [event.type, event.t])).toEqual([
      ['click', 950],
      ['click', 1450],
    ]);
    expect(result.ok && result.value.durationMs).toBe(1450);
  });

  it('closes a pause that is still open when the recording stops', async () => {
    const { h, folder } = await started();
    h.sendChunk('screen');
    h.clock.time += 1000;
    await h.service.pause();
    h.clock.time += 2000;
    const result = await h.service.stop();
    expect(result.ok).toBe(true);
    const session = await readSessionFile(folder);
    expect(session.pauses).toEqual([{ pausedAt: 1000, resumedAt: 3000 }]);
  });

  it('refuses pause, resume and stop when there is no recording, and a second start', async () => {
    const h = await createHarness();
    harness = h;
    for (const call of [
      () => h.service.pause(),
      () => h.service.resume(),
      () => h.service.stop(),
    ]) {
      const result = await call();
      expect(errorCode(result)).toBe('invalid-state');
    }
    await h.service.start(h.options);
    const second = await h.service.start(h.options);
    expect(errorCode(second)).toBe('invalid-state');
    const resume = await h.service.resume();
    expect(errorCode(resume)).toBe('invalid-state');
    await h.service.stop();
  });
});

describe('when recording cannot start', () => {
  it('refuses below the free space floor and says so plainly', async () => {
    const h = await createHarness();
    harness = h;
    h.faults.freeBytes = 500 * 1024 * 1024;
    const result = await h.service.start(h.options);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('disk-too-full');
    expect(result.error.message).toContain('not enough free space');
    expect(result.error.nextStep).not.toBe('');
    expect(h.service.snapshot().phase).toBe('idle');
  });

  it.each([
    ['EACCES', 'folder-not-writable'],
    ['EPERM', 'folder-not-writable'],
    ['ENOSPC', 'disk-too-full'],
    ['ENOENT', 'folder-not-writable'],
  ])('maps %s on the destination to %s', async (code, expected) => {
    const h = await createHarness();
    harness = h;
    h.faults.mkdirFail = code;
    const result = await h.service.start(h.options);
    expect(errorCode(result)).toBe(expected);
    expect(h.service.snapshot().phase).toBe('idle');
  });

  it('explains a screen permission refusal and keeps nothing to recover', async () => {
    const h = await createHarness({
      failedTracks: [{ kind: 'screen', reason: 'permission-denied' }],
    });
    harness = h;
    const result = await h.service.start(h.options);
    expect(errorCode(result)).toBe('screen-permission');
    expect(await h.service.listRecoverable()).toEqual([]);
    expect(await h.deps.index.list()).toEqual([]);
    expect(h.service.snapshot().phase).toBe('idle');
    const again = await h.service.start(h.options);
    expect(errorCode(again)).toBe('screen-permission');
  });

  it('reports the screen as unavailable for any other failure', async () => {
    const h = await createHarness({ failedTracks: [{ kind: 'screen', reason: 'device-missing' }] });
    harness = h;
    const result = await h.service.start(h.options);
    expect(errorCode(result)).toBe('screen-unavailable');
  });

  it('reports a recorder page that does not answer', async () => {
    const h = await createHarness();
    harness = h;
    h.page.reply = () => undefined;
    const result = await h.service.start(h.options);
    expect(errorCode(result)).toBe('recorder-failed');
  });

  it('fails when the raw file cannot be created', async () => {
    const h = await createHarness();
    harness = h;
    h.faults.openAppendFail = { match: 'screen.raw', code: 'EACCES' };
    const result = await h.service.start(h.options);
    expect(errorCode(result)).toBe('folder-not-writable');
  });
});

describe('warnings that do not stop the recording', () => {
  it('carries on without a camera that would not open', async () => {
    const { h } = await started(
      { failedTracks: [{ kind: 'camera', reason: 'device-missing' }] },
      { camera: { enabled: true } },
    );
    expect(h.service.snapshot().warnings.map((warning) => warning.code)).toContain(
      'camera-unavailable',
    );
    expect(h.service.snapshot().tracks.map((track) => track.kind)).toEqual(['screen']);
    await h.service.stop();
  });

  it('warns that the cursor is in the video when it could not be hidden', async () => {
    const { h, folder } = await started({ cursor: 'shown' });
    expect(h.service.snapshot().warnings.map((warning) => warning.code)).toContain(
      'cursor-visible',
    );
    await h.service.stop();
    expect((await readSessionFile(folder)).capture.cursor).toBe('shown');
  });

  it('records without the mouse log and says why when the hook is unavailable', async () => {
    const h = await createHarness();
    harness = h;
    h.input.result = { status: 'unavailable', reason: 'wayland' };
    const result = await h.service.start({ ...h.options, name: 'NoHook' });
    expect(result.ok).toBe(true);
    const folder = result.ok ? result.value.folder : '';
    h.sendChunk('screen');
    const stopped = await h.service.stop();
    expect(stopped.ok).toBe(true);
    expect(stopped.ok && stopped.value.inputLog).toBeUndefined();
    const session = await readSessionFile(folder);
    expect(session.input).toEqual({ status: 'unavailable', reason: 'wayland' });
    expect(await readdir(folder)).not.toContain('input.ndjson');
    expect(session.warnings.join(' ')).toContain('Cursor effects and auto zoom are off');
  });

  it('warns once when the disk runs low, and stops cleanly below the hard floor', async () => {
    const { h, folder } = await started();
    h.sendChunk('screen', 50);
    await flushWork();
    h.faults.freeBytes = 1000 * 1024 * 1024;
    for (let i = 0; i < 10; i += 1) {
      h.clock.time += 1000;
      h.fireHeartbeat();
      await flushWork();
    }
    const lowWarnings = h.events.filter(
      (event) => event.type === 'warning' && event.warning.code === 'disk-low',
    );
    expect(lowWarnings).toHaveLength(1);

    h.faults.freeBytes = 100 * 1024 * 1024;
    for (let i = 0; i < 10; i += 1) {
      h.clock.time += 1000;
      h.fireHeartbeat();
      await flushWork();
    }
    await flushWork();
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe('disk-full');
    expect(h.events.some((event) => event.type === 'finished')).toBe(true);
    expect((await readSessionFile(folder)).cleanClose).toBe(true);
  }, 30_000);
});

describe('failures while recording', () => {
  it('stops and saves cleanly when the disk fills up', async () => {
    const { h, folder } = await started();
    h.sendChunk('screen', 100);
    await flushWork();
    h.faults.appendFail = { match: 'screen.raw', code: 'ENOSPC' };
    h.sendChunk('screen', 100);
    await flushWork();
    await flushWork();
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe('disk-full');
    expect(error?.type === 'error' && error.error.message).toBe(
      'The disk is full. Your recording was saved up to this point.',
    );
    expect(h.events.some((event) => event.type === 'finished')).toBe(true);
    expect((await readFile(join(folder, 'screen.raw.webm'))).byteLength).toBe(100);
    expect((await readSessionFile(folder)).tracks[0]?.endedReason).toBe('disk-full');
  });

  it.each([
    ['ENOENT', 'folder-unavailable', 'The folder is no longer available.'],
    ['EIO', 'folder-unavailable', 'The folder is no longer available.'],
  ])('reports %s as the folder going away', async (code, expected, text) => {
    const { h } = await started();
    h.faults.appendFail = { match: 'screen.raw', code };
    h.sendChunk('screen');
    await flushWork();
    await flushWork();
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe(expected);
    expect(error?.type === 'error' && error.error.message).toContain(text);
  });

  it('keeps recording the screen when the camera is unplugged', async () => {
    const { h, folder } = await started({}, { camera: { enabled: true } });
    h.sendChunk('screen');
    h.sendChunk('camera');
    h.page.emit({ type: 'track-ended', kind: 'camera', rendererNow: 1 });
    await flushWork();
    const warning = h.events.find(
      (event) => event.type === 'warning' && event.warning.code === 'camera-lost',
    );
    expect(warning?.type === 'warning' && warning.warning.message).toBe(
      'Camera disconnected. Screen recording continues.',
    );
    expect(h.service.snapshot().phase).toBe('recording');
    expect(h.service.snapshot().tracks.find((track) => track.kind === 'camera')?.ended).toBe(true);
    h.sendChunk('screen');
    const result = await h.service.stop();
    expect(result.ok).toBe(true);
    expect(
      (await readSessionFile(folder)).tracks.find((track) => track.kind === 'camera')?.endedReason,
    ).toBe('device-removed');
  });

  it('warns when the microphone is unplugged', async () => {
    const { h } = await started({}, { mic: { enabled: true } });
    h.page.emit({ type: 'track-ended', kind: 'mic', rendererNow: 1 });
    await flushWork();
    expect(h.service.snapshot().warnings.map((warning) => warning.code)).toContain('mic-lost');
    await h.service.stop();
  });

  it('stops and saves when the display is removed', async () => {
    const { h } = await started();
    h.sendChunk('screen');
    await flushWork();
    h.page.emit({ type: 'track-ended', kind: 'screen', rendererNow: 1 });
    await flushWork();
    await flushWork();
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe('display-removed');
    expect(h.events.some((event) => event.type === 'finished')).toBe(true);
    expect(h.service.snapshot().phase).toBe('stopped');
  });

  it('stops and saves when the recorder reports a fatal error', async () => {
    const { h } = await started();
    h.sendChunk('screen');
    h.page.emit({ type: 'fatal', message: 'encoder crashed' });
    await flushWork();
    await flushWork();
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe('recorder-failed');
  });

  it('closes the writers and leaves a recoverable session when the recorder page crashes', async () => {
    const { h, folder } = await started();
    h.sendChunk('screen', 120);
    await flushWork();
    h.clock.time += 2000;
    h.page.die('crashed');
    await flushWork();
    await flushWork();

    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe('recorder-crashed');
    expect(h.service.snapshot().phase).toBe('failed');
    expect((await readFile(join(folder, 'screen.raw.webm'))).byteLength).toBe(120);
    const session = await readSessionFile(folder);
    expect(session.cleanClose).toBe(false);
    expect(session.tracks[0]?.bytesWritten).toBe(120);
    expect(session.heartbeatElapsedMs).toBe(2000);
    expect(h.input.stopped).toBe(true);

    expect((await h.service.listRecoverable()).map((entry) => entry.folder)).toEqual([folder]);
  });

  it('stops everything when the session file cannot be written', async () => {
    const { h } = await started();
    h.sendChunk('screen');
    await flushWork();
    h.faults.heartbeatWriteFail = 'EIO';
    h.clock.time += 1000;
    h.fireHeartbeat();
    await flushWork();
    await flushWork();
    const error = h.events.find((event) => event.type === 'error');
    expect(error?.type === 'error' && error.error.code).toBe('folder-unavailable');
  });
});

describe('recovery', () => {
  async function crashedFolder() {
    const { h, folder } = await started();
    h.sendChunk('screen', 200, 5);
    h.sendChunk('screen', 200, 5);
    h.clock.time += 500;
    h.input.click(10, 10);
    await h.service.pause();
    h.clock.time += 1500;
    h.fireHeartbeat();
    await flushWork();
    h.page.die('crashed');
    await flushWork();
    await flushWork();
    return { h, folder };
  }

  it('lists a crashed session and recovers it into playable files', async () => {
    const { h, folder } = await crashedFolder();
    const [found] = await h.service.listRecoverable();
    expect(found).toMatchObject({ folder, name: 'Demo', bytes: 400 });

    const before = await readFile(join(folder, 'screen.raw.webm'));
    const result = await h.service.recover(folder);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recovered).toBe(true);
    expect(result.value.files[0]?.path).toBe(join(folder, 'screen.mp4'));
    expect(await readFile(join(folder, 'screen.raw.webm'))).toEqual(before);

    const session = await readSessionFile(folder);
    expect(session.cleanClose).toBe(true);
    expect(session.recovered).toBe(true);
    expect(session.pauses).toEqual([{ pausedAt: 500, resumedAt: 2000 }]);
    const log = sessionLogSchema.parse(
      JSON.parse(await readFile(join(folder, 'Demo.scrim.json'), 'utf8')),
    );
    expect(log.events).toHaveLength(1);
    expect(await h.service.listRecoverable()).toEqual([]);
  });

  it('closes an open pause at the last heartbeat', async () => {
    const { h, folder } = await crashedFolder();
    const before = await readSessionFile(folder);
    expect(before.pauses[0]?.resumedAt).toBeNull();
    await h.service.recover(folder);
    const after = await readSessionFile(folder);
    expect(after.pauses[0]?.resumedAt).toBe(before.heartbeatElapsedMs);
  });

  it('keeps the input log up to its last whole line', async () => {
    const { h, folder } = await crashedFolder();
    const path = join(folder, 'input.ndjson');
    const whole = await readFile(path, 'utf8');
    await writeFile(path, `${whole}{"type":"move","at":600,"x":`, 'utf8');
    const result = await h.service.recover(folder);
    expect(result.ok).toBe(true);
    const log = sessionLogSchema.parse(
      JSON.parse(await readFile(join(folder, 'Demo.scrim.json'), 'utf8')),
    );
    expect(log.events).toHaveLength(parseInputNdjson(whole).events.length);
  });

  it('says there is nothing to recover when no footage reached the disk', async () => {
    const { h, folder } = await crashedFolder();
    await writeFile(join(folder, 'screen.raw.webm'), '');
    const result = await h.service.recover(folder);
    expect(errorCode(result)).toBe('nothing-recoverable');
    expect((await readSessionFile(folder)).cleanClose).toBe(false);
  });

  it('refuses a session that is already closed, one still running, and one that is damaged', async () => {
    const { h, folder } = await crashedFolder();
    await h.service.recover(folder);
    const closed = await h.service.recover(folder);
    expect(errorCode(closed)).toBe('invalid-state');

    const damaged = join(h.dir, 'damaged.scrim');
    await h.deps.fs.mkdir(damaged);
    await writeFile(join(damaged, 'session.json'), '{not json');
    const bad = await h.service.recover(damaged);
    expect(errorCode(bad)).toBe('nothing-recoverable');
    const missing = await h.service.recover(join(h.dir, 'nowhere.scrim'));
    expect(errorCode(missing)).toBe('nothing-recoverable');
  });

  it('does not offer a session that another running copy of the app owns, and refuses to recover it', async () => {
    const { h, folder } = await crashedFolder();
    const session = await readSessionFile(folder);
    await writeFile(join(folder, 'session.json'), JSON.stringify({ ...session, pid: 9999 }));
    h.alive.add(9999);
    expect(await h.service.listRecoverable()).toEqual([]);
    const refused = await h.service.recover(folder);
    expect(errorCode(refused)).toBe('invalid-state');
    h.alive.delete(9999);
    expect(await h.service.listRecoverable()).toHaveLength(1);
  });

  it('does not offer the recording that is in progress, or one that closed cleanly', async () => {
    const { h } = await started();
    expect(await h.service.listRecoverable()).toEqual([]);
    h.sendChunk('screen');
    await h.service.stop();
    expect(await h.service.listRecoverable()).toEqual([]);
  });

  it('dismisses without deleting anything', async () => {
    const { h, folder } = await crashedFolder();
    await h.service.dismiss(folder);
    expect(await h.service.listRecoverable()).toEqual([]);
    expect(await readdir(folder)).toEqual(
      expect.arrayContaining(['session.json', 'screen.raw.webm']),
    );
    expect((await readSessionFile(folder)).cleanClose).toBe(false);
  });

  it('survives a raw file cut at any length: it recovers or says nothing is left, and never crashes', async () => {
    const { h, folder } = await crashedFolder();
    const full = await readFile(join(folder, 'screen.raw.webm'));
    for (const cut of [0, 1, 7, 100, 399, 400]) {
      await writeFile(join(folder, 'screen.raw.webm'), full.subarray(0, cut));
      const session = await readSessionFile(folder);
      await writeFile(
        join(folder, 'session.json'),
        JSON.stringify({ ...session, cleanClose: false, recovered: undefined }),
      );
      const result = await h.service.recover(folder);
      if (cut === 0) expect(errorCode(result)).toBe('nothing-recoverable');
      else expect(result.ok).toBe(true);
    }
  });

  it('reports a missing FFmpeg without losing anything', async () => {
    const { h, folder } = await crashedFolder();
    const original = h.deps.run;
    h.deps.run = (command, args, options) =>
      command.includes('ffmpeg') && !command.includes('ffprobe')
        ? Promise.resolve({ code: null, stdout: '', stderr: '', spawnError: 'ENOENT' })
        : original(command, args, options);
    const result = await h.service.recover(folder);
    expect(errorCode(result)).toBe('ffmpeg-missing');
    expect((await readSessionFile(folder)).cleanClose).toBe(false);
    expect((await readFile(join(folder, 'screen.raw.webm'))).byteLength).toBe(400);
  });
});
