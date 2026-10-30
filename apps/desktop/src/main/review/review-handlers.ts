import { basename, join } from 'node:path';
import { recordingDuration } from '@scrim/core/render';
import type { Handlers } from '../ipc/dispatcher';
import type { ExportSource } from '../export/source';
import type { ReviewView } from '../../shared/review-contract';

/** What the review calls need from the machine, so tests run them on a made up disk. */
export interface ReviewDeps {
  loadSource: (
    folder: string,
  ) => Promise<
    { ok: true; source: ExportSource } | { ok: false; reason: 'missing' | 'invalid' | 'no-screen' }
  >;
  /** True for a folder Scrim made, inside the projects folder or the folder of finished videos. */
  isKnownFolder: (folder: string) => boolean;
  /** The app's cache folder for working copies. */
  previewDir: () => string;
  /** The folder the final video goes to, shown so the person knows before pressing Export. */
  outputFolder: () => string;
  fileSize: (file: string) => Promise<number | undefined>;
  /** Size and speed of a video, read with ffprobe. */
  probe: (
    file: string,
  ) => Promise<
    | { width?: number | undefined; height?: number | undefined; fps?: number | undefined }
    | undefined
  >;
  /** An address the page can play, or undefined when the file is outside the allowed folders. */
  issueMedia: (file: string, label: string) => string | undefined;
  forgetMedia: (file: string) => void;
  trash: (path: string) => Promise<void>;
  remove: (file: string) => Promise<void>;
}

type ReviewHandlers = Pick<Handlers, 'review:open' | 'review:discard'>;

const NOT_FOUND = {
  code: 'nothing-recoverable' as const,
  message: 'Scrim could not find this recording.',
  nextStep: 'It may have been moved or deleted. Open the Library to see what is there.',
};

/** The name of the working copy for a recording folder: its session name with `.mp4`. */
export function previewPathFor(previewDir: string, folder: string): string {
  return join(previewDir, `${basename(folder).replace(/\.scrim$/i, '')}.mp4`);
}

export function createReviewHandlers(deps: ReviewDeps): {
  handlers: ReviewHandlers;
  /** Removes the working copy of a recording. Called after Export and after Discard. */
  cleanup: (folder: string) => Promise<void>;
} {
  const cleanup = async (folder: string): Promise<void> => {
    const file = previewPathFor(deps.previewDir(), folder);
    deps.forgetMedia(file);
    await deps.remove(file).catch(() => undefined);
  };

  const handlers: ReviewHandlers = {
    'review:open': async ({ folder }) => {
      if (!deps.isKnownFolder(folder)) return { ok: false, error: NOT_FOUND };
      const loaded = await deps.loadSource(folder);
      if (!loaded.ok) return { ok: false, error: NOT_FOUND };
      const { source } = loaded;
      const screen = source.files.screen;
      if (screen === undefined) return { ok: false, error: NOT_FOUND };
      const before = deps.issueMedia(screen, 'before');
      if (before === undefined) return { ok: false, error: NOT_FOUND };

      const previewFile = previewPathFor(deps.previewDir(), folder);
      const previewBytes = await deps.fileSize(previewFile);
      const after =
        previewBytes === undefined || previewBytes === 0
          ? null
          : (deps.issueMedia(previewFile, 'after') ?? null);
      const facts = await deps.probe(screen);
      const value: ReviewView = {
        name: source.session.name,
        createdAt: source.session.createdAt,
        durationMs: Math.max(0, Math.round(recordingDuration(source.session))),
        width: facts?.width ?? 0,
        height: facts?.height ?? 0,
        fps: facts?.fps ?? null,
        rawBytes: (await deps.fileSize(screen)) ?? 0,
        previewBytes: previewBytes ?? null,
        before,
        after,
        outputFolder: deps.outputFolder(),
      };
      return { ok: true, value };
    },

    'review:discard': async ({ folder }) => {
      if (!deps.isKnownFolder(folder)) return { ok: false, error: NOT_FOUND };
      await cleanup(folder);
      try {
        await deps.trash(folder);
        return { ok: true, value: undefined };
      } catch {
        return {
          ok: false,
          error: {
            code: 'unknown',
            message: 'Scrim could not move this recording to the Recycle Bin.',
            nextStep:
              'Close anything that is using it and try again. The recording is still there.',
          },
        };
      }
    },
  };
  return { handlers, cleanup };
}
