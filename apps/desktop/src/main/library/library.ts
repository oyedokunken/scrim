import { sessionFileSchema, SESSION_FILES, type SessionFile } from '@scrim/core';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import type { LibraryItem } from '../../shared/library-contract';
import { MAX_LIBRARY_ITEMS } from '../../shared/library-contract';

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  modifiedMs: number;
  bytes: number;
}

/** Everything the library needs from the machine, so tests run it on a made up disk. */
export interface LibraryDeps {
  /** Folders of recordings' working files, such as `<name>.scrim`. */
  projectsRoot: () => string;
  /** Where finished MP4s go, and where older versions left working folders. */
  videosFolder: () => string;
  screenshotsFolder: () => string;
  /** A second folder of screenshots, for the ones saved there when the chosen folder refused them. */
  extraScreenshotsFolder?: () => string;
  /** A folder of finished videos that the chosen folder refused. */
  extraVideosFolder?: () => string;
  /** Entries directly inside a folder. Empty when it does not exist. */
  readDir: (folder: string) => Promise<DirEntry[]>;
  readText: (path: string) => Promise<string | undefined>;
  exists: (path: string) => Promise<boolean>;
  /** The length of a video in milliseconds, or null when it cannot be read. */
  videoDurationMs: (path: string) => Promise<number | null>;
  /** The first picture of a video as a PNG data URL, or null. */
  videoFrame: (path: string, cacheKey: string) => Promise<string | null>;
  imageThumbnail: (path: string) => string;
  /** The whole picture as a PNG data URL, for the detail view. */
  readImage: (path: string) => Promise<string>;
  trash: (path: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  openPath: (path: string) => Promise<string>;
  showItem: (path: string) => void;
  share: (path: string) => Promise<void>;
  /** Image size from the file header, or null. */
  imageSize: (path: string) => Promise<{ width: number; height: number } | null>;
}

interface Entry {
  kind: 'recording' | 'screenshot';
  name: string;
  createdMs: number;
  durationMs: number | null;
  bytes: number;
  /** The working folder, when the recording still has one. */
  project: string | null;
  /** The exported MP4, or the PNG for a screenshot. */
  file: string | null;
  /** A video file that can stand in for the first picture when there is no MP4. */
  sourceVideo: string | null;
  width: number;
  height: number;
  /** Which tracks a recording holds: screen, camera, mic. */
  tracks: string[];
}

const PROJECT_SUFFIX = '.scrim';
/** Characters Windows file names cannot hold, and the dots and spaces it trims. */
const BAD_NAME = /[<>:"/\\|?*]/;

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 32) return true;
  }
  return false;
}
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** A file name the person typed, cleaned, or null when nothing usable is left. */
export function cleanFileName(input: string): string | null {
  const trimmed = input.trim().replace(/[. ]+$/, '');
  if (
    trimmed === '' ||
    trimmed.length > 120 ||
    BAD_NAME.test(trimmed) ||
    hasControlCharacter(trimmed)
  ) {
    return null;
  }
  if (RESERVED.test(trimmed)) return null;
  return trimmed;
}

/** `Take 1`, `Take 1 2`, `Take 1 3`: the names an export gives when the first is taken. */
function matchesExportName(stem: string, name: string): boolean {
  return (
    stem === name || new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`).test(stem)
  );
}

async function readProject(
  deps: LibraryDeps,
  folder: string,
): Promise<{ session: SessionFile } | null> {
  const text = await deps.readText(join(folder, SESSION_FILES.session));
  if (text === undefined) return null;
  try {
    const parsed = sessionFileSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    return { session: parsed.data };
  } catch {
    return null;
  }
}

/**
 * The library: every recording (a working folder, an exported MP4 or both) and every screenshot.
 * It only reads, except for the three actions the person asks for: rename, delete and share. Each
 * action works on an id from the last listing, so the page can never name a path of its own.
 */
export function createLibrary(deps: LibraryDeps) {
  let known = new Map<string, Entry>();
  const durations = new Map<string, number | null>();

  async function duration(path: string, modifiedMs: number): Promise<number | null> {
    const key = `${path}|${String(modifiedMs)}`;
    const cached = durations.get(key);
    if (cached !== undefined) return cached;
    const value = await deps.videoDurationMs(path);
    durations.set(key, value);
    return value;
  }

  async function scan(): Promise<Entry[]> {
    const videos = deps.videosFolder();
    const extra = deps.extraScreenshotsFolder?.();
    const [projectDirs, videoFiles, mainShots, extraShots] = await Promise.all([
      deps.readDir(deps.projectsRoot()),
      deps.readDir(videos),
      deps.readDir(deps.screenshotsFolder()),
      extra === undefined || extra === deps.screenshotsFolder()
        ? Promise.resolve([])
        : deps.readDir(extra),
    ]);
    const extraVideos = deps.extraVideosFolder?.();
    const extraMp4s =
      extraVideos === undefined || extraVideos === videos ? [] : await deps.readDir(extraVideos);
    const shotFiles = [
      ...mainShots.map((file) => ({ file, folder: deps.screenshotsFolder() })),
      ...extraShots.map((file) => ({ file, folder: extra ?? '' })),
    ];
    const mp4s = videoFiles.filter(
      (entry) => !entry.isDirectory && extname(entry.name).toLowerCase() === '.mp4',
    );
    const used = new Set<string>();
    const entries: Entry[] = [];

    const folders = [
      ...projectDirs.map((entry) => ({ entry, parent: deps.projectsRoot() })),
      ...videoFiles.map((entry) => ({ entry, parent: videos })),
    ].filter(({ entry }) => entry.isDirectory && entry.name.endsWith(PROJECT_SUFFIX));

    for (const { entry, parent } of folders) {
      const folder = join(parent, entry.name);
      const project = await readProject(deps, folder);
      // A session that did not close cleanly is offered for recovery, not listed as a recording.
      if (project === null || !project.session.cleanClose) continue;
      const { session } = project;
      const matches = mp4s
        .filter((file) => matchesExportName(basename(file.name, extname(file.name)), session.name))
        .sort((a, b) => b.modifiedMs - a.modifiedMs);
      const mp4 = matches[0];
      for (const file of matches) used.add(file.name);
      const screen = session.tracks.find((track) => track.kind === 'screen');
      const screenName = screen?.playableFile ?? screen?.file;
      const sourceVideo =
        screenName !== undefined && (await deps.exists(join(folder, screenName)))
          ? join(folder, screenName)
          : null;
      const mp4Path = mp4 === undefined ? null : join(videos, mp4.name);
      entries.push({
        kind: 'recording',
        name: session.name,
        createdMs: Date.parse(session.createdAt),
        durationMs:
          mp4 !== undefined
            ? await duration(mp4Path ?? '', mp4.modifiedMs)
            : session.heartbeatElapsedMs > 0
              ? session.heartbeatElapsedMs
              : null,
        bytes: mp4?.bytes ?? 0,
        project: folder,
        file: mp4Path,
        sourceVideo,
        width: session.source.frame?.width ?? 0,
        height: session.source.frame?.height ?? 0,
        tracks: session.tracks.map((track) => track.kind),
      });
    }

    for (const file of mp4s) {
      if (used.has(file.name)) continue;
      const path = join(videos, file.name);
      entries.push({
        kind: 'recording',
        name: basename(file.name, extname(file.name)),
        createdMs: file.modifiedMs,
        durationMs: await duration(path, file.modifiedMs),
        bytes: file.bytes,
        project: null,
        file: path,
        sourceVideo: null,
        width: 0,
        height: 0,
        tracks: ['screen'],
      });
    }

    for (const file of extraMp4s) {
      if (file.isDirectory || extname(file.name).toLowerCase() !== '.mp4') continue;
      const path = join(extraVideos ?? '', file.name);
      entries.push({
        kind: 'recording',
        name: basename(file.name, extname(file.name)),
        createdMs: file.modifiedMs,
        durationMs: await duration(path, file.modifiedMs),
        bytes: file.bytes,
        project: null,
        file: path,
        sourceVideo: null,
        width: 0,
        height: 0,
        tracks: ['screen'],
      });
    }

    const shots = shotFiles.filter(
      ({ file }) => !file.isDirectory && extname(file.name).toLowerCase() === '.png',
    );
    for (const { file, folder: shotFolder } of shots) {
      const path = join(shotFolder, file.name);
      const size = await deps.imageSize(path);
      if (size === null) continue;
      entries.push({
        kind: 'screenshot',
        name: basename(file.name, extname(file.name)),
        createdMs: file.modifiedMs,
        durationMs: null,
        bytes: file.bytes,
        project: null,
        file: path,
        sourceVideo: null,
        tracks: [],
        ...size,
      });
    }
    return entries.sort((a, b) => b.createdMs - a.createdMs).slice(0, MAX_LIBRARY_ITEMS);
  }

  /** The same file gets the same id in every listing, so a dialog opened before a refresh still works. */
  const toItem = (entry: Entry): LibraryItem => {
    const id = createHash('sha1')
      .update(`${entry.kind}|${entry.file ?? ''}|${entry.project ?? ''}`)
      .digest('hex')
      .slice(0, 24);
    known.set(id, entry);
    const where = entry.file ?? entry.project;
    return {
      id,
      kind: entry.kind,
      name: entry.name,
      createdMs: entry.createdMs,
      durationMs: entry.durationMs,
      bytes: entry.bytes,
      width: entry.width > 0 ? entry.width : null,
      height: entry.height > 0 ? entry.height : null,
      tracks: entry.tracks,
      folder: where === null ? '' : dirname(where),
      canEdit: entry.project !== null,
      hasVideo: entry.kind === 'recording' && entry.file !== null,
      isFile: entry.file !== null,
    };
  };

  const need = (id: string): Entry => {
    const entry = known.get(id);
    if (entry === undefined) throw new Error('unknown library item');
    return entry;
  };

  return {
    async list(): Promise<LibraryItem[]> {
      const entries = await scan();
      known = new Map();
      return entries.map(toItem);
    },

    /** The item for a file or a working folder, read fresh, or null when there is none. Used right after a capture. */
    async lookup(path: string): Promise<LibraryItem | null> {
      const entries = await scan();
      known = new Map();
      const items = entries.map(toItem);
      const wanted = path.toLowerCase();
      for (const item of items) {
        const entry = known.get(item.id);
        if (entry?.file?.toLowerCase() === wanted || entry?.project?.toLowerCase() === wanted) {
          return item;
        }
      }
      return null;
    },

    /** The whole picture of a screenshot. Null for a recording, which shows its first frame instead. */
    async preview(id: string): Promise<string | null> {
      const entry = need(id);
      if (entry.kind !== 'screenshot' || entry.file === null) return null;
      return deps.readImage(entry.file);
    },

    /** Plays the exported video in the system player. */
    async play(id: string): Promise<boolean> {
      const entry = need(id);
      if (entry.kind !== 'recording' || entry.file === null) return false;
      return (await deps.openPath(entry.file)) === '';
    },

    /** Opens the exported video or the screenshot in the system app for its type. */
    async openFile(id: string): Promise<boolean> {
      const entry = need(id);
      if (entry.file === null || !(await deps.exists(entry.file))) return false;
      return (await deps.openPath(entry.file)) === '';
    },

    async thumbnail(id: string): Promise<string | null> {
      const entry = need(id);
      try {
        if (entry.kind === 'screenshot')
          return entry.file === null ? null : deps.imageThumbnail(entry.file);
        const video = entry.file ?? entry.sourceVideo;
        if (video === null) return null;
        const key = createHash('sha1')
          .update(`${video}|${String(entry.createdMs)}`)
          .digest('hex');
        return await deps.videoFrame(video, key);
      } catch {
        return null;
      }
    },

    async open(id: string) {
      const entry = need(id);
      if (entry.kind === 'screenshot' && entry.file !== null) {
        return {
          kind: 'screenshot' as const,
          path: entry.file,
          width: entry.width,
          height: entry.height,
        };
      }
      if (entry.project !== null) return { kind: 'editor' as const, folder: entry.project };
      if (entry.file !== null && (await deps.exists(entry.file))) {
        return (await deps.openPath(entry.file)) === ''
          ? { kind: 'played' as const }
          : { kind: 'missing' as const };
      }
      return { kind: 'missing' as const };
    },

    async rename(
      id: string,
      name: string,
    ): Promise<{ ok: boolean; reason?: 'exists' | 'invalid' | 'failed' }> {
      const entry = need(id);
      const clean = cleanFileName(name);
      if (entry.file === null || clean === null) return { ok: false, reason: 'invalid' };
      const target = join(dirname(entry.file), `${clean}${extname(entry.file)}`);
      if (target.toLowerCase() === entry.file.toLowerCase()) return { ok: true };
      if (await deps.exists(target)) return { ok: false, reason: 'exists' };
      try {
        await deps.rename(entry.file, target);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },

    reveal(id: string): void {
      const entry = need(id);
      const path = entry.file ?? entry.project;
      if (path !== null) deps.showItem(path);
    },

    /** Moves the file and the working folder to the recycle bin, so nothing is lost for good. */
    async remove(id: string): Promise<void> {
      const entry = need(id);
      if (entry.file !== null) await deps.trash(entry.file);
      if (entry.project !== null) await deps.trash(entry.project);
      known.delete(id);
    },

    async share(id: string): Promise<void> {
      const entry = need(id);
      if (entry.file === null) throw new Error('nothing to share');
      await deps.share(entry.file);
    },
  };
}

export type Library = ReturnType<typeof createLibrary>;
