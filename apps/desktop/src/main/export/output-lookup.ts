import { basename, extname, join } from 'node:path';

export interface OutputEntry {
  name: string;
  modifiedMs: number;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The video an earlier render of a recording left in a folder: `Take 1.mp4` or `Take 1 2.mp4`, the
 * newest one. Replace writes over it, so a recording keeps one video. Undefined when there is none.
 */
export function findExistingOutput(
  dir: string,
  sessionName: string,
  entries: readonly OutputEntry[],
): string | undefined {
  const pattern = new RegExp(`^${escape(sessionName)}( \\d+)?$`);
  const match = entries
    .filter(
      (entry) =>
        extname(entry.name).toLowerCase() === '.mp4' &&
        pattern.test(basename(entry.name, extname(entry.name))),
    )
    .sort((a, b) => b.modifiedMs - a.modifiedMs)[0];
  return match === undefined ? undefined : join(dir, match.name);
}
