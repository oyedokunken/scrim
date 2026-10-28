import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  cleanFileName,
  createLibrary,
  type DirEntry,
  type LibraryDeps,
} from '../../src/main/library/library';
import { createLibraryHandlers } from '../../src/main/library/library-handlers';

const ROOT = process.platform === 'win32' ? 'C:\\Data' : '/data';
const PROJECTS = join(ROOT, 'Projects');
const VIDEOS = join(ROOT, 'Videos');
const SHOTS = join(ROOT, 'Pictures');

function session(name: string, cleanClose = true) {
  return JSON.stringify({
    version: 1,
    id: '6b6f8f64-8f6e-4a4a-9d3a-111111111111',
    name,
    createdAt: '2026-10-28T10:00:00.000Z',
    app: { version: '1.0.0', os: 'windows', arch: 'x64' },
    pid: 123,
    source: { kind: 'display', origin: { x: 0, y: 0 }, scaleFactor: 1 },
    capture: { cursorInCapture: true },
    tracks: [
      {
        kind: 'screen',
        file: 'screen.webm',
        mimeType: 'video/webm',
        startedAt: 0,
        bytesWritten: 10,
        complete: true,
      },
    ],
    clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
    pauses: [],
    input: { status: 'unavailable', reason: 'error' },
    warnings: [],
    heartbeatAt: '2026-10-28T10:01:00.000Z',
    heartbeatElapsedMs: 42_000,
    cleanClose,
  });
}

const dir = (name: string, modifiedMs: number, bytes = 0): DirEntry => ({
  name,
  isDirectory: true,
  modifiedMs,
  bytes,
});
const file = (name: string, modifiedMs: number, bytes = 100): DirEntry => ({
  name,
  isDirectory: false,
  modifiedMs,
  bytes,
});

function setup(
  disk: { projects?: DirEntry[]; videos?: DirEntry[]; shots?: DirEntry[] } = {},
  texts: Record<string, string> = {},
) {
  const deps: LibraryDeps = {
    projectsRoot: () => PROJECTS,
    videosFolder: () => VIDEOS,
    screenshotsFolder: () => SHOTS,
    readDir: vi.fn((folder: string) =>
      Promise.resolve(
        folder === PROJECTS
          ? (disk.projects ?? [])
          : folder === VIDEOS
            ? (disk.videos ?? [])
            : (disk.shots ?? []),
      ),
    ),
    readText: vi.fn((path: string) => Promise.resolve(texts[path])),
    exists: vi.fn(() => Promise.resolve(false)),
    videoDurationMs: vi.fn(() => Promise.resolve(12_000)),
    videoFrame: vi.fn(() => Promise.resolve('data:image/png;base64,AA==')),
    imageThumbnail: vi.fn(() => 'data:image/png;base64,BB=='),
    trash: vi.fn(() => Promise.resolve()),
    rename: vi.fn(() => Promise.resolve()),
    openPath: vi.fn(() => Promise.resolve('')),
    showItem: vi.fn(),
    share: vi.fn(() => Promise.resolve()),
    imageSize: vi.fn(() => Promise.resolve({ width: 800, height: 600 })),
  };
  return { deps, library: createLibrary(deps) };
}

const projectText = (name: string, cleanClose = true) => ({
  [join(PROJECTS, `${name}.scrim`, 'session.json')]: session(name, cleanClose),
});

describe('cleanFileName', () => {
  it('keeps a plain name and trims dots and spaces', () => {
    expect(cleanFileName('  Demo day ')).toBe('Demo day');
    expect(cleanFileName('Demo.')).toBe('Demo');
  });

  it.each(['', '   ', 'a/b', 'a\\b', 'a:b', 'what?', 'CON', 'x'.repeat(121), 'tab\tname'])(
    'refuses %j',
    (value) => {
      expect(cleanFileName(value)).toBeNull();
    },
  );
});

describe('the library listing', () => {
  it('lists recordings and screenshots together, newest first', async () => {
    const { library } = setup(
      {
        projects: [dir('Take 1.scrim', 1)],
        videos: [file('Take 1.mp4', 5000, 4000), file('Old.mp4', 1000)],
        shots: [file('Shot.png', 3000)],
      },
      projectText('Take 1'),
    );
    const items = await library.list();
    expect(items.map((item) => [item.kind, item.name])).toEqual([
      ['recording', 'Take 1'],
      ['screenshot', 'Shot'],
      ['recording', 'Old'],
    ]);
  });

  it('joins a working folder with its exported MP4, including the numbered copies', async () => {
    const { library } = setup(
      {
        projects: [dir('Take 1.scrim', 1)],
        videos: [file('Take 1.mp4', 100), file('Take 1 2.mp4', 200), file('Take 10.mp4', 50)],
      },
      projectText('Take 1'),
    );
    const items = await library.list();
    const recordings = items.filter((item) => item.kind === 'recording');
    expect(recordings).toHaveLength(2);
    const joined = recordings.find((item) => item.name === 'Take 1');
    expect(joined).toMatchObject({
      canEdit: true,
      hasVideo: true,
      isFile: true,
      durationMs: 12_000,
    });
    expect(recordings.find((item) => item.name === 'Take 10')).toMatchObject({ canEdit: false });
  });

  it('shows a working folder with no export as editable, with the time it recorded', async () => {
    const { library } = setup({ projects: [dir('Take 1.scrim', 1)] }, projectText('Take 1'));
    const [item] = await library.list();
    expect(item).toMatchObject({
      canEdit: true,
      hasVideo: false,
      isFile: false,
      durationMs: 42_000,
    });
  });

  it('leaves out a session that did not close cleanly, which is offered for recovery instead', async () => {
    const { library } = setup({ projects: [dir('Take 1.scrim', 1)] }, projectText('Take 1', false));
    expect(await library.list()).toEqual([]);
  });

  it('skips a damaged session file and a screenshot whose header is bad', async () => {
    const { deps, library } = setup(
      { projects: [dir('Bad.scrim', 1)], shots: [file('x.png', 1)] },
      { [join(PROJECTS, 'Bad.scrim', 'session.json')]: '{not json' },
    );
    vi.mocked(deps.imageSize).mockResolvedValue(null);
    expect(await library.list()).toEqual([]);
  });

  it('is empty when nothing exists yet', async () => {
    expect(await setup().library.list()).toEqual([]);
  });

  it('gives the same id to the same file in every listing', async () => {
    const { library } = setup({ shots: [file('Shot.png', 1)] });
    const [first] = await library.list();
    const [second] = await library.list();
    expect(first?.id).toBe(second?.id);
  });

  it('does not put a path in any item', async () => {
    const { library } = setup({ shots: [file('Shot.png', 1)] });
    expect(JSON.stringify(await library.list())).not.toContain(SHOTS);
  });
});

describe('the library actions', () => {
  it('refuses an id the last listing did not hand out', async () => {
    const { library } = setup();
    await library.list();
    await expect(library.remove('made-up')).rejects.toThrow();
    expect(() => {
      library.reveal('made-up');
    }).toThrow();
  });

  it('opens a recording in the editor, a screenshot in the result view, an MP4 in the player', async () => {
    const { deps, library } = setup(
      {
        projects: [dir('Take 1.scrim', 1)],
        videos: [file('Loose.mp4', 10)],
        shots: [file('Shot.png', 5)],
      },
      projectText('Take 1'),
    );
    vi.mocked(deps.exists).mockResolvedValue(true);
    const items = await library.list();
    const by = (name: string) => items.find((item) => item.name === name)?.id ?? '';
    expect(await library.open(by('Take 1'))).toEqual({
      kind: 'editor',
      folder: join(PROJECTS, 'Take 1.scrim'),
    });
    expect(await library.open(by('Shot'))).toEqual({
      kind: 'screenshot',
      path: join(SHOTS, 'Shot.png'),
      width: 800,
      height: 600,
    });
    expect(await library.open(by('Loose'))).toEqual({ kind: 'played' });
    expect(deps.openPath).toHaveBeenCalledWith(join(VIDEOS, 'Loose.mp4'));
  });

  it('says missing when the MP4 has gone', async () => {
    const { library } = setup({ videos: [file('Loose.mp4', 10)] });
    const [item] = await library.list();
    expect(await library.open(item?.id ?? '')).toEqual({ kind: 'missing' });
  });

  it('renames a file and keeps its extension', async () => {
    const { deps, library } = setup({ shots: [file('Shot.png', 5)] });
    const [item] = await library.list();
    expect(await library.rename(item?.id ?? '', 'Pricing page')).toEqual({ ok: true });
    expect(deps.rename).toHaveBeenCalledWith(
      join(SHOTS, 'Shot.png'),
      join(SHOTS, 'Pricing page.png'),
    );
  });

  it('refuses a name that is taken, unusable, or for an item with no file', async () => {
    const { deps, library } = setup(
      { shots: [file('Shot.png', 5)], projects: [dir('P.scrim', 1)] },
      projectText('P'),
    );
    const items = await library.list();
    const shot = items.find((item) => item.kind === 'screenshot')?.id ?? '';
    const project = items.find((item) => item.kind === 'recording')?.id ?? '';
    vi.mocked(deps.exists).mockResolvedValueOnce(true);
    expect(await library.rename(shot, 'Taken')).toEqual({ ok: false, reason: 'exists' });
    expect(await library.rename(shot, 'a/b')).toEqual({ ok: false, reason: 'invalid' });
    expect(await library.rename(project, 'New')).toEqual({ ok: false, reason: 'invalid' });
    expect(deps.rename).not.toHaveBeenCalled();
    vi.mocked(deps.rename).mockRejectedValueOnce(new Error('locked'));
    expect(await library.rename(shot, 'Fine')).toEqual({ ok: false, reason: 'failed' });
  });

  it('shows an item in its folder', async () => {
    const { deps, library } = setup({ shots: [file('Shot.png', 5)] });
    const [item] = await library.list();
    library.reveal(item?.id ?? '');
    expect(deps.showItem).toHaveBeenCalledWith(join(SHOTS, 'Shot.png'));
  });

  it('deletes to the recycle bin, the MP4 and the working folder both', async () => {
    const { deps, library } = setup(
      { projects: [dir('Take 1.scrim', 1)], videos: [file('Take 1.mp4', 9)] },
      projectText('Take 1'),
    );
    const [item] = await library.list();
    await library.remove(item?.id ?? '');
    expect(deps.trash).toHaveBeenCalledWith(join(VIDEOS, 'Take 1.mp4'));
    expect(deps.trash).toHaveBeenCalledWith(join(PROJECTS, 'Take 1.scrim'));
    expect(deps.trash).toHaveBeenCalledTimes(2);
  });

  it('shares a file, and has nothing to share for a working folder alone', async () => {
    const { deps, library } = setup(
      { shots: [file('Shot.png', 5)], projects: [dir('P.scrim', 1)] },
      projectText('P'),
    );
    const items = await library.list();
    await library.share(items.find((item) => item.kind === 'screenshot')?.id ?? '');
    expect(deps.share).toHaveBeenCalledWith(join(SHOTS, 'Shot.png'));
    await expect(
      library.share(items.find((item) => item.kind === 'recording')?.id ?? ''),
    ).rejects.toThrow();
  });

  it('makes a thumbnail from the picture, or the first frame of the video', async () => {
    const { deps, library } = setup({
      shots: [file('Shot.png', 5)],
      videos: [file('Loose.mp4', 1)],
    });
    const items = await library.list();
    const shot = items.find((item) => item.kind === 'screenshot')?.id ?? '';
    const video = items.find((item) => item.kind === 'recording')?.id ?? '';
    expect(await library.thumbnail(shot)).toBe('data:image/png;base64,BB==');
    expect(await library.thumbnail(video)).toBe('data:image/png;base64,AA==');
    vi.mocked(deps.videoFrame).mockRejectedValueOnce(new Error('ffmpeg'));
    expect(await library.thumbnail(video)).toBeNull();
  });
});

describe('the library handlers', () => {
  it('say whether sharing exists, and refuse to share when it does not', async () => {
    const { library } = setup({ shots: [file('Shot.png', 5)] });
    const none = createLibraryHandlers({ library, canShare: () => false });
    const some = createLibraryHandlers({ library, canShare: () => true });
    expect(none['share:available'](undefined)).toBe(false);
    expect(some['share:available'](undefined)).toBe(true);
    const [item] = await library.list();
    expect(() => none['library:share']({ id: item?.id ?? '' })).toThrow();
    await expect(some['library:share']({ id: item?.id ?? '' })).resolves.toBeUndefined();
  });
});
