import { randomUUID } from 'node:crypto';
import type { EditList, SessionLog, TrackKind } from '@scrim/core';
import type { Handlers } from '../ipc/dispatcher';
import type { ExportSource } from '../export/source';

/** What the editor calls need from the machine, so tests run them on a made up disk. */
export interface EditorDeps {
  /** Reads a working folder. It only reads. */
  loadSource: (
    folder: string,
  ) => Promise<
    { ok: true; source: ExportSource } | { ok: false; reason: 'missing' | 'invalid' | 'no-screen' }
  >;
  /** Writes `edits.json` in the folder, atomically. Nothing else in the folder is touched. */
  writeEdits: (folder: string, edits: EditList) => Promise<void>;
  /** True for a folder Scrim made: inside the projects folder or the folder of finished videos. */
  isKnownFolder: (folder: string) => boolean;
  /** Hands out an address for a file the page may play. Without it, addresses are made here. */
  issueMedia?: (file: string, label: string) => string | undefined;
}

type EditorHandlers = Pick<Handlers, 'editor:open' | 'editor:save-edits'>;

const NOT_FOUND = {
  code: 'nothing-recoverable' as const,
  message: 'Scrim could not find this recording.',
  nextStep: 'It may have been moved or deleted. Open the Library to see what is there.',
};

/**
 * The editor calls. A recording opens only from a folder Scrim made, and the page gets an address for
 * each track that holds a one time token, never a path. Saving rewrites `edits.json` and nothing else.
 */
export function createEditorHandlers(deps: EditorDeps): {
  handlers: EditorHandlers;
  /** The folder and track a token names, for the media protocol once it exists. */
  resolve: (token: string) => { folder: string; kind: TrackKind } | undefined;
} {
  // token to folder and track, so a later protocol can serve a file without the page ever seeing a path.
  const tokens = new Map<string, { folder: string; kind: TrackKind }>();

  const handlers: EditorHandlers = {
    'editor:open': async ({ folder }) => {
      if (!deps.isKnownFolder(folder)) return { ok: false, error: NOT_FOUND };
      const loaded = await deps.loadSource(folder);
      if (!loaded.ok) {
        return {
          ok: false,
          error:
            loaded.reason === 'invalid'
              ? {
                  code: 'unknown',
                  message: 'This recording has a damaged session file.',
                  nextStep: 'The footage is untouched. Try recovering it from the Library.',
                }
              : NOT_FOUND,
        };
      }
      const { source } = loaded;
      const address = (kind: TrackKind): string | undefined => {
        const file = source.files[kind];
        if (file === undefined) return undefined;
        if (deps.issueMedia !== undefined) return deps.issueMedia(file, kind);
        const token = randomUUID();
        tokens.set(token, { folder, kind });
        return `scrim-media://p/${token}/${kind}`;
      };
      const screen = address('screen');
      if (screen === undefined) return { ok: false, error: NOT_FOUND };
      const camera = address('camera');
      const mic = address('mic');
      const log: SessionLog | null = source.log;
      const edits = {
        trim: source.edits.trim,
        cuts: source.edits.cuts,
        ...(source.edits.zoom === undefined ? {} : { zoom: source.edits.zoom }),
      };
      return {
        ok: true,
        value: {
          name: source.session.name,
          session: source.session,
          log,
          edits,
          media: {
            screen,
            ...(camera === undefined ? {} : { camera }),
            ...(mic === undefined ? {} : { mic }),
          },
        },
      };
    },

    'editor:save-edits': async ({ folder, edits }) => {
      if (!deps.isKnownFolder(folder)) return { ok: false, error: NOT_FOUND };
      try {
        await deps.writeEdits(folder, { version: 1, ...edits });
        return { ok: true, value: undefined };
      } catch {
        return {
          ok: false,
          error: {
            code: 'write-failed',
            message: 'Scrim could not save your edits.',
            nextStep:
              'Check that the disk has room and the folder is not read only. The recording is untouched.',
          },
        };
      }
    },
  };
  return { handlers, resolve: (token) => tokens.get(token) };
}
