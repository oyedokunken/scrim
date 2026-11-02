import { z } from 'zod';

const fileSchema = z.object({ folders: z.array(z.string().min(1).max(1024)).max(200) }).strict();

/** The two file calls the journal needs, so tests run it on a made up disk. */
export interface PendingFs {
  read: (path: string) => Promise<string | undefined>;
  write: (path: string, text: string) => Promise<void>;
}

/**
 * A short list on disk of the recordings whose video is being made. A render that finishes or is
 * cancelled leaves the list. A render that Scrim did not live to finish stays on it, and the next
 * launch offers to finish it. The recordings themselves are never touched.
 */
export function createPendingRenders(options: { path: string; fs: PendingFs }) {
  const inflight = new Set<string>();
  const leftover = new Set<string>();
  let writing: Promise<void> = Promise.resolve();

  const persist = (): void => {
    const text = JSON.stringify({ folders: [...inflight, ...leftover] });
    writing = writing.then(() => options.fs.write(options.path, text)).catch(() => undefined);
  };

  return {
    /** Reads what the last run left behind. A missing or damaged file means nothing was left. */
    async load(): Promise<void> {
      const text = await options.fs.read(options.path).catch(() => undefined);
      if (text === undefined) return;
      try {
        const parsed = fileSchema.safeParse(JSON.parse(text));
        if (parsed.success) for (const folder of parsed.data.folders) leftover.add(folder);
      } catch {
        // A damaged list is the same as an empty one.
      }
    },
    /** A render for this recording was queued. */
    add(folder: string): void {
      inflight.add(folder);
      leftover.delete(folder);
      persist();
    },
    /** The render ended, whether it finished, failed or was cancelled. */
    remove(folder: string): void {
      inflight.delete(folder);
      persist();
    },
    /** The recordings the last run did not finish. */
    leftover(): string[] {
      return [...leftover];
    },
    /** The person chose not to finish it. It stays in the Library as a recording. */
    dismiss(folder: string): void {
      if (!leftover.delete(folder)) return;
      persist();
    },
    /** Resolves when every write so far has finished. */
    settled(): Promise<void> {
      return writing;
    },
  };
}
