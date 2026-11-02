import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findExistingOutput } from '../../src/main/export/output-lookup';
import { createPendingRenders } from '../../src/main/export/pending-renders';
import { ExportService, type ExportServiceDeps } from '../../src/main/export/service';
import type { ExportOutcome, ExportRequest } from '../../src/main/export/types';
import { createReviewHandlers, type ReviewDeps } from '../../src/main/review/review-handlers';
import { exportContract } from '../../src/shared/export-contract';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

function success(path: string): ExportOutcome {
  return {
    ok: true,
    path,
    durationMs: 1000,
    bytes: 10,
    encoder: 'libx264',
    elapsedMs: 5,
    note: null,
    fellBack: false,
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

function makeService(
  run: ExportServiceDeps['run'],
  extra: Partial<ExportServiceDeps> = {},
): { service: ExportService; requests: ExportRequest[] } {
  const requests: ExportRequest[] = [];
  let n = 0;
  const service = new ExportService({
    run: (request, options) => {
      requests.push(request);
      return run(request, options);
    },
    settings: () => DEFAULT_SETTINGS,
    destination: () => 'D:/Videos/Scrim',
    previewDir: () => 'D:/cache/previews',
    stallMs: 5000,
    newId: () => `job${String((n += 1))}`,
    log: () => undefined,
    ...extra,
  });
  return { service, requests };
}

describe('the render queue after Stop', () => {
  it('keeps going while another recording finishes, one render at a time', async () => {
    const order: string[] = [];
    const releases: (() => void)[] = [];
    const { service } = makeService(
      (request) =>
        new Promise((resolve) => {
          order.push(`start ${request.folder}`);
          releases.push(() => {
            resolve(success('D:/Videos/Scrim/x.mp4'));
          });
        }),
    );
    service.start({ folder: 'one', collision: 'number' });
    service.start({ folder: 'two', collision: 'number' });
    await settle();
    expect(order).toEqual(['start one']);
    releases[0]?.();
    await settle();
    expect(order).toEqual(['start one', 'start two']);
    releases[1]?.();
    await settle();
    expect(service.busy()).toBe(false);
  });

  it('remembers the finished file of a recording, and says when it is still being made', async () => {
    let release: () => void = () => undefined;
    const { service } = makeService(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(success('D:/Videos/Scrim/Take 1.mp4'));
          };
        }),
    );
    service.start({ folder: 'one', collision: 'number' });
    await settle();
    expect(service.busyFor('one')).toBe(true);
    expect(service.outputFor('one')).toBeUndefined();
    release();
    await settle();
    expect(service.busyFor('one')).toBe(false);
    expect(service.outputFor('one')).toBe('D:/Videos/Scrim/Take 1.mp4');
  });
});

describe('Cancel', () => {
  it('stops the render through its signal, keeps nothing half made and leaves the recording alone', async () => {
    let signal: AbortSignal | undefined;
    const { service } = makeService(
      (_request, options) =>
        new Promise((resolve) => {
          signal = options.signal;
          options.signal.addEventListener('abort', () => {
            resolve({
              ok: false,
              error: { code: 'cancelled', message: 'Cancelled.', nextStep: 'None.' },
            });
          });
        }),
    );
    const job = service.start({ folder: 'one', collision: 'number' });
    await settle();
    service.cancel(job.id);
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(service.get(job.id)?.phase).toBe('cancelled');
    expect(service.get(job.id)?.error).toBeNull();
    expect(service.outputFor('one')).toBeUndefined();
  });
});

describe('editing a recording that has a video', () => {
  it('Replace writes over the video made before, under the same name', async () => {
    const { service, requests } = makeService(() =>
      Promise.resolve(success('D:/Videos/Scrim/Take 1 2.mp4')),
    );
    service.start({ folder: 'one', collision: 'number' });
    await settle();
    await service.rerender('one', 'replace');
    await settle();
    expect(requests[1]).toMatchObject({ collision: 'replace', fileName: 'Take 1 2' });
  });

  it('Save as new makes another file beside it', async () => {
    const { service, requests } = makeService(() =>
      Promise.resolve(success('D:/Videos/Scrim/Take 1.mp4')),
    );
    service.start({ folder: 'one', collision: 'number' });
    await settle();
    await service.rerender('one', 'new');
    await settle();
    expect(requests[1]?.collision).toBe('number');
    expect(requests[1]?.fileName).toBeUndefined();
  });

  it('finds the old video on disk when this run did not make it', async () => {
    const findOutput = vi.fn(() => Promise.resolve('D:/Videos/Scrim/Old name.mp4'));
    const { service, requests } = makeService(() => Promise.resolve(success('x.mp4')), {
      findOutput,
    });
    await service.rerender('one', 'replace');
    await settle();
    expect(findOutput).toHaveBeenCalledWith('one');
    expect(requests[0]).toMatchObject({ collision: 'replace', fileName: 'Old name' });
  });

  it('does not replace anything when there is no earlier video', async () => {
    const { service, requests } = makeService(() => Promise.resolve(success('x.mp4')));
    await service.rerender('one', 'replace');
    await settle();
    expect(requests[0]?.collision).toBe('number');
  });

  it('restarts a render that is still running with the new edits', async () => {
    const signals: AbortSignal[] = [];
    const { service, requests } = makeService(
      (_request, options) =>
        new Promise((resolve) => {
          signals.push(options.signal);
          options.signal.addEventListener('abort', () => {
            resolve({ ok: false, error: { code: 'cancelled', message: 'c', nextStep: 'n' } });
          });
        }),
    );
    const first = service.start({ folder: 'one', collision: 'number' });
    await settle();
    const second = await service.rerender('one', 'replace');
    await settle();
    expect(signals[0]?.aborted).toBe(true);
    expect(service.get(first.id)?.phase).toBe('cancelled');
    expect(requests).toHaveLength(2);
    expect(service.get(second.id)?.phase).toBe('running');
  });
});

describe('a failed render', () => {
  it('can be tried again with the same settings, and keeps the reason in plain words', async () => {
    let calls = 0;
    const { service, requests } = makeService(() => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? {
              ok: false as const,
              error: {
                code: 'disk-full' as const,
                message: 'There is not enough free space for the finished video.',
                nextStep:
                  'Free some space or choose another folder. Your recording was not changed.',
              },
            }
          : success('D:/Videos/Scrim/a.mp4'),
      );
    });
    const job = service.start({ folder: 'one', collision: 'number' });
    await settle();
    expect(service.get(job.id)?.phase).toBe('failed');
    expect(service.get(job.id)?.error?.message).toContain('free space');
    const again = service.retry(job.id);
    await settle();
    expect(again).toBeDefined();
    expect(requests[1]?.softwareOnly).toBe(false);
    expect(service.get(again?.id ?? '')?.phase).toBe('done');
  });

  it('retry of an unknown job does nothing', () => {
    const { service } = makeService(() => Promise.resolve(success('x.mp4')));
    expect(service.retry('nope')).toBeUndefined();
  });
});

describe('a render that Scrim did not live to finish', () => {
  function fakeDisk(initial?: string) {
    const files = new Map<string, string>();
    if (initial !== undefined) files.set('pending.json', initial);
    return {
      files,
      fs: {
        read: (path: string) => Promise.resolve(files.get(path)),
        write: (path: string, text: string) => {
          files.set(path, text);
          return Promise.resolve();
        },
      },
    };
  }

  it('stays on the list while it runs, and leaves it when it finishes', async () => {
    const disk = fakeDisk();
    const pending = createPendingRenders({ path: 'pending.json', fs: disk.fs });
    let release: () => void = () => undefined;
    const { service } = makeService(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve(success('x.mp4'));
          };
        }),
      { journal: pending },
    );
    service.start({ folder: 'one', collision: 'number' });
    await pending.settled();
    expect(JSON.parse(disk.files.get('pending.json') ?? '{}')).toEqual({ folders: ['one'] });
    release();
    await settle();
    await pending.settled();
    expect(JSON.parse(disk.files.get('pending.json') ?? '{}')).toEqual({ folders: [] });
  });

  it('leaves the list when the person cancels it', async () => {
    const disk = fakeDisk();
    const pending = createPendingRenders({ path: 'pending.json', fs: disk.fs });
    const { service } = makeService(
      (_request, options) =>
        new Promise((resolve) => {
          options.signal.addEventListener('abort', () => {
            resolve({ ok: false, error: { code: 'cancelled', message: 'c', nextStep: 'n' } });
          });
        }),
      { journal: pending },
    );
    const job = service.start({ folder: 'one', collision: 'number' });
    await settle();
    service.cancel(job.id);
    await settle();
    await pending.settled();
    expect(JSON.parse(disk.files.get('pending.json') ?? '{}')).toEqual({ folders: [] });
  });

  it('stays on the list when a restart cancels the first render, because the second is waiting', async () => {
    const disk = fakeDisk();
    const pending = createPendingRenders({ path: 'pending.json', fs: disk.fs });
    const { service } = makeService(
      (_request, options) =>
        new Promise((resolve) => {
          options.signal.addEventListener('abort', () => {
            resolve({ ok: false, error: { code: 'cancelled', message: 'c', nextStep: 'n' } });
          });
        }),
      { journal: pending },
    );
    service.start({ folder: 'one', collision: 'number' });
    await settle();
    await service.rerender('one', 'new');
    await settle();
    await pending.settled();
    expect(JSON.parse(disk.files.get('pending.json') ?? '{}')).toEqual({ folders: ['one'] });
  });

  it('is offered on the next launch, once, until the person answers', async () => {
    const disk = fakeDisk(JSON.stringify({ folders: ['a', 'b'] }));
    const pending = createPendingRenders({ path: 'pending.json', fs: disk.fs });
    await pending.load();
    expect(pending.leftover()).toEqual(['a', 'b']);
    pending.dismiss('a');
    await pending.settled();
    expect(pending.leftover()).toEqual(['b']);
    expect(JSON.parse(disk.files.get('pending.json') ?? '{}')).toEqual({ folders: ['b'] });
    // Starting it again takes it off the left over list and puts it on the running one.
    pending.add('b');
    expect(pending.leftover()).toEqual([]);
  });

  it('treats a missing or damaged list as empty', async () => {
    const none = createPendingRenders({ path: 'pending.json', fs: fakeDisk().fs });
    await none.load();
    expect(none.leftover()).toEqual([]);
    const damaged = createPendingRenders({ path: 'pending.json', fs: fakeDisk('{oops').fs });
    await damaged.load();
    expect(damaged.leftover()).toEqual([]);
    const wrong = createPendingRenders({
      path: 'pending.json',
      fs: fakeDisk(JSON.stringify({ folders: [1] })).fs,
    });
    await wrong.load();
    expect(wrong.leftover()).toEqual([]);
  });
});

describe('finding the video an earlier render left', () => {
  const entries = [
    { name: 'Take 1.mp4', modifiedMs: 1 },
    { name: 'Take 1 2.mp4', modifiedMs: 5 },
    { name: 'Take 10.mp4', modifiedMs: 9 },
    { name: 'Take 1.mp4.partial', modifiedMs: 20 },
    { name: 'Other.mp4', modifiedMs: 30 },
  ];

  it('picks the newest file with the recording name or the name and a number', () => {
    expect(findExistingOutput('D:/v', 'Take 1', entries)).toBe(join('D:/v', 'Take 1 2.mp4'));
  });

  it('is undefined when nothing matches', () => {
    expect(findExistingOutput('D:/v', 'Nothing', entries)).toBeUndefined();
  });

  it('treats the name as text, not a pattern', () => {
    expect(findExistingOutput('D:/v', 'a.b', [{ name: 'axb.mp4', modifiedMs: 1 }])).toBeUndefined();
  });
});

describe('the review page after Stop', () => {
  function makeReview(over: Partial<ReviewDeps> = {}) {
    const issued: string[] = [];
    const deps: ReviewDeps = {
      loadSource: () =>
        Promise.resolve({
          ok: true as const,
          source: {
            session: {
              name: 'Take 1',
              createdAt: '2026-11-02T10:00:00.000Z',
              tracks: [],
              pauses: [],
              heartbeatElapsedMs: 5000,
            },
            files: { screen: 'C:/p/Take 1.scrim/screen.webm' },
          },
        } as unknown as Awaited<ReturnType<ReviewDeps['loadSource']>>),
      isKnownFolder: () => true,
      previewDir: () => 'D:/cache',
      outputFolder: () => 'D:/Videos/Scrim',
      fileSize: (file) => Promise.resolve(file.endsWith('.webm') ? 1000 : 500),
      probe: () => Promise.resolve({ width: 1920, height: 1080, fps: 30 }),
      issueMedia: (file, label) => {
        issued.push(`${label}:${file}`);
        return `media://${label}`;
      },
      forgetMedia: () => undefined,
      trash: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      ...over,
    };
    return { ...createReviewHandlers(deps), issued };
  }

  it('plays the finished video from the recordings folder, not a working copy', async () => {
    const { handlers, issued } = makeReview({ finalVideo: () => 'D:/Videos/Scrim/Take 1.mp4' });
    const result = await handlers['review:open']({ folder: 'C:/p/Take 1.scrim' });
    expect(result.ok).toBe(true);
    expect(issued).toContain('after:D:/Videos/Scrim/Take 1.mp4');
    if (result.ok) expect(result.value.after).toBe('media://after');
  });

  it('has no After file while the video is being made', async () => {
    const { handlers } = makeReview({
      finalVideo: () => undefined,
      fileSize: (file) => Promise.resolve(file.endsWith('.webm') ? 1000 : undefined),
    });
    const result = await handlers['review:open']({ folder: 'C:/p/Take 1.scrim' });
    expect(result.ok && result.value.after).toBeNull();
  });

  it('stops the render before a recording is discarded, and never trashes anything unknown', async () => {
    const stopRendering = vi.fn();
    const trash = vi.fn(() => Promise.resolve());
    const { handlers } = makeReview({ stopRendering, trash });
    await handlers['review:discard']({ folder: 'C:/p/Take 1.scrim' });
    expect(stopRendering).toHaveBeenCalledWith('C:/p/Take 1.scrim');
    expect(trash).toHaveBeenCalledTimes(1);
    const strict = makeReview({ isKnownFolder: () => false, stopRendering, trash });
    stopRendering.mockClear();
    trash.mockClear();
    await strict.handlers['review:discard']({ folder: 'C:/Windows' });
    expect(stopRendering).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });
});

describe('the new export channels', () => {
  it('only take a folder and a mode, and nothing else', () => {
    const rerender = exportContract['export:rerender'].input;
    expect(rerender.safeParse({ folder: 'C:/p/a.scrim', mode: 'replace' }).success).toBe(true);
    expect(rerender.safeParse({ folder: 'C:/p/a.scrim', mode: 'new' }).success).toBe(true);
    expect(rerender.safeParse({ folder: 'C:/p/a.scrim', mode: 'delete' }).success).toBe(false);
    expect(rerender.safeParse({ folder: 'C:/p/a.scrim', mode: 'new', out: 'x' }).success).toBe(
      false,
    );
    expect(exportContract['export:resume-pending'].input.safeParse({ folder: '' }).success).toBe(
      false,
    );
    expect(exportContract['export:retry'].input.safeParse({ jobId: 'j' }).success).toBe(true);
  });

  it('describe a recording that was unfinished by its folder and name', () => {
    const out = exportContract['export:pending'].output;
    expect(out.safeParse([{ folder: 'C:/p/a.scrim', name: 'a' }]).success).toBe(true);
    expect(out.safeParse([{ folder: 'C:/p/a.scrim' }]).success).toBe(false);
  });
});
