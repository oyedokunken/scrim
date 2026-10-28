import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { findLegacyFolders, moveLegacyFolders } from '../../src/main/export/legacy';
import { autoRender, ExportService, defaultExportSettings } from '../../src/main/export/service';
import type { ExportServiceDeps } from '../../src/main/export/service';
import type { ExportOutcome, ExportRequest } from '../../src/main/export/types';
import type { RecordingEvent } from '../../src/main/recording/types';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

function success(path = 'a.mp4'): ExportOutcome {
  return {
    ok: true,
    path,
    durationMs: 1000,
    bytes: 10,
    encoder: 'h264_mf',
    elapsedMs: 5,
    note: null,
  };
}

function makeService(
  run: ExportServiceDeps['run'],
  settings = DEFAULT_SETTINGS,
): { service: ExportService; requests: ExportRequest[] } {
  const requests: ExportRequest[] = [];
  let n = 0;
  const service = new ExportService({
    run: (request, options) => {
      requests.push(request);
      return run(request, options);
    },
    settings: () => settings,
    destination: () => 'D:/Videos/Scrim',
    newId: () => `job${String((n += 1))}`,
    log: () => undefined,
  });
  return { service, requests };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('ExportService', () => {
  it('renders into the saved destination with the saved look and reports done', async () => {
    const { service, requests } = makeService(() => Promise.resolve(success()));
    const seen: string[] = [];
    service.on((event) => seen.push(event.job.phase));
    const job = service.start({ folder: 'C:/p/One.scrim' });
    expect(job.phase).toBe('queued');
    await settle();
    expect(seen).toEqual(['queued', 'running', 'done']);
    expect(requests[0]?.outputDir).toBe('D:/Videos/Scrim');
    expect(requests[0]?.collision).toBe('number');
    expect(requests[0]?.settings.fps).toBe(DEFAULT_SETTINGS.frameRate);
    expect(service.get(job.id)?.result?.path).toBe('a.mp4');
    expect(service.busy()).toBe(false);
  });

  it('runs one render at a time, in order', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const { service } = makeService((request) => {
      order.push(`start ${request.folder}`);
      return new Promise((resolve) => {
        release = () => {
          order.push(`end ${request.folder}`);
          resolve(success());
        };
      });
    });
    service.start({ folder: 'one' });
    service.start({ folder: 'two' });
    await settle();
    expect(order).toEqual(['start one']);
    expect(service.busy()).toBe(true);
    release();
    await settle();
    expect(order).toEqual(['start one', 'end one', 'start two']);
    release();
    await settle();
  });

  it('cancels a queued job without running it and a running job through its signal', async () => {
    let aborted = false;
    const { service, requests } = makeService(
      (_request, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve({ ok: false, error: { code: 'cancelled', message: 'x', nextStep: 'y' } });
          });
        }),
    );
    const running = service.start({ folder: 'one' });
    const queued = service.start({ folder: 'two' });
    await settle();
    service.cancel(queued.id);
    service.cancel(running.id);
    await settle();
    expect(aborted).toBe(true);
    expect(service.get(running.id)?.phase).toBe('cancelled');
    expect(service.get(queued.id)?.phase).toBe('cancelled');
    expect(requests).toHaveLength(1);
  });

  it('keeps the error for the failure screen and retries with the software encoder and a smaller size', async () => {
    let calls = 0;
    const { service, requests } = makeService(() => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? {
              ok: false,
              error: {
                code: 'encode-failed',
                message: 'bad',
                nextStep: 'again',
                stderrTail: 'line',
              },
            }
          : success(),
      );
    });
    const first = service.start({ folder: 'one', settings: { preset: '1080p' } });
    await settle();
    expect(service.get(first.id)?.error?.stderrTail).toBe('line');
    const retry = service.retrySafer(first.id);
    await settle();
    expect(retry?.safer).toBe(true);
    expect(requests[1]?.softwareOnly).toBe(true);
    expect(requests[1]?.settings.preset).toBe('720p');
    expect(service.get(retry?.id ?? '')?.phase).toBe('done');
  });

  it('turns an unexpected throw into a plain failure', async () => {
    const { service } = makeService(() => Promise.reject(new Error('boom')));
    const job = service.start({ folder: 'one' });
    await settle();
    expect(service.get(job.id)?.phase).toBe('failed');
    expect(service.get(job.id)?.error?.message).not.toContain('boom');
  });

  it('maps the sound settings to the export settings', () => {
    const settings = defaultExportSettings({
      ...DEFAULT_SETTINGS,
      keepSound: false,
      micVolume: 'louder',
      backgroundShadow: false,
    });
    expect(settings).toMatchObject({ keepAudio: false, shadow: false, preset: 'source' });
    expect(settings.micGain).toBeGreaterThan(1);
  });
});

describe('autoRender', () => {
  it('starts one render for each finished recording and nothing else', async () => {
    const { service, requests } = makeService(() => Promise.resolve(success()));
    let emit: (event: RecordingEvent) => void = () => undefined;
    autoRender(
      {
        on: (listener) => {
          emit = listener;
          return () => undefined;
        },
      },
      service,
    );
    emit({ type: 'warning', warning: { code: 'writer-slow', message: 'x' } });
    emit({
      type: 'finished',
      result: {
        folder: 'C:/p/Rec.scrim',
        name: 'Rec',
        files: [],
        durationMs: 1,
        bytes: 1,
        recovered: false,
        warnings: [],
      },
    });
    await settle();
    expect(requests.map((request) => request.folder)).toEqual(['C:/p/Rec.scrim']);
  });
});

describe('old working folders', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });
  function setup(): { destination: string; projects: string } {
    const root = mkdtempSync(join(tmpdir(), 'scrim-legacy-'));
    roots.push(root);
    const destination = join(root, 'Videos', 'Scrim');
    const projects = join(root, 'Projects');
    for (const name of ['Old one.scrim', 'Old two.scrim']) {
      mkdirSync(join(destination, name), { recursive: true });
      writeFileSync(join(destination, name, 'session.json'), '{}');
      writeFileSync(join(destination, name, 'screen.mp4'), 'video');
    }
    mkdirSync(join(destination, 'not a session.scrim'), { recursive: true });
    writeFileSync(join(destination, 'Finished.mp4'), 'x');
    return { destination, projects };
  }

  it('finds only folders that hold a session file', async () => {
    const { destination } = setup();
    const found = await findLegacyFolders(destination);
    expect(found.map((entry) => entry.name).sort()).toEqual(['Old one', 'Old two']);
    expect(await findLegacyFolders(join(destination, 'missing'))).toEqual([]);
  });

  it('moves them, keeps every file, never replaces a folder that is already there and tells the index', async () => {
    const { destination, projects } = setup();
    mkdirSync(join(projects, 'Old one.scrim'), { recursive: true });
    writeFileSync(join(projects, 'Old one.scrim', 'keep.txt'), 'mine');
    const moves: string[] = [];
    const result = await moveLegacyFolders(await findLegacyFolders(destination), {
      projectsRoot: projects,
      moved: (_from, to) => {
        moves.push(to);
        return Promise.resolve();
      },
    });
    expect(result).toEqual({ moved: 2, failed: 0 });
    expect(readdirSync(projects).sort()).toEqual([
      'Old one 2.scrim',
      'Old one.scrim',
      'Old two.scrim',
    ]);
    expect(readdirSync(join(projects, 'Old one.scrim'))).toEqual(['keep.txt']);
    expect(readdirSync(join(projects, 'Old one 2.scrim')).sort()).toEqual([
      'screen.mp4',
      'session.json',
    ]);
    expect(moves).toHaveLength(2);
    // The finished video and unrelated folders stay where they were.
    expect(readdirSync(destination).sort()).toEqual(['Finished.mp4', 'not a session.scrim']);
  });
});
