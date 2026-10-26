import { createHash } from 'node:crypto';

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** The same folder written with each kind of slash a log line might hold, as plain and as JSON. */
function homeVariants(home: string): string[] {
  const forward = home.replaceAll('\\', '/');
  const back = home.replaceAll('/', '\\');
  return [...new Set([home, forward, back, back.replaceAll('\\', '\\\\')])].filter(
    (value) => value.length > 3,
  );
}

/** Another person's profile folder, or this one written in a way the exact match missed. */
const PROFILE_FOLDER = /(?:[A-Za-z]:)?[\\/]{1,2}(?:Users|home)[\\/]{1,2}[^\\/\s"'`:;,)\]}]+/gi;
/**
 * A Windows path that starts at a drive letter. Folder names can hold spaces, so it runs to the end
 * of the line or the closing quote and takes any words after it too. Hiding a little too much is
 * the safe side. The letter must stand alone, so `app://` is not read as a drive.
 */
const DRIVE_PATH = /(?<![\w])[A-Za-z]:[\\/][^"'`<>|\r\n]*/g;
/** An absolute path on macOS or Linux with at least two parts, treated the same way. */
const POSIX_PATH = /(?<![\w:/.~-])\/(?:[^"'`<>|\r\n/]+\/)+[^"'`<>|\r\n]*/g;

/**
 * Takes the person out of a piece of text before it is logged. The home folder becomes `~`, any
 * other profile folder becomes `~`, and any remaining absolute path is replaced entirely, so a
 * folder on another drive is never written out in full. Use `folderName` when a place is worth
 * saying, so the line carries one folder name and nothing above it.
 */
export function redactPaths(text: string, home: string): string {
  let result = text;
  for (const variant of homeVariants(home)) {
    result = result.replace(new RegExp(escapeRegExp(variant), 'gi'), '~');
  }
  result = result.replace(PROFILE_FOLDER, '~');
  result = result.replace(DRIVE_PATH, '<path>');
  result = result.replace(POSIX_PATH, '<path>');
  return result;
}

/** The name of the folder that holds a file or folder, and no more of the path. */
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
  const last = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return last ?? '';
}

/** A short, stable stand-in for a window title, so lines can be matched without reading it. */
export function hashTitle(title: string): string {
  return createHash('sha256').update(title).digest('hex').slice(0, 8);
}

export type LogValue = string | number | boolean | null;

const MAX_VALUE_LENGTH = 200;

/**
 * Makes the fields of one log line safe: strings lose paths and are cut short, a field that holds
 * a window title is replaced by its hash, and nothing but plain values gets through.
 */
export function sanitizeFields(
  fields: Record<string, unknown> | undefined,
  home: string,
): Record<string, LogValue> {
  const clean: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (typeof value === 'string') {
      clean[key] = /title/i.test(key)
        ? `hash:${hashTitle(value)}`
        : redactPaths(value, home).slice(0, MAX_VALUE_LENGTH);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      clean[key] = value;
    }
    // Objects, arrays and anything else are dropped: they could hold anything.
  }
  return clean;
}

/** An error reduced to its kind and code. The message is left out because it often holds a path. */
export function describeError(error: unknown): Record<string, LogValue> {
  if (typeof error !== 'object' || error === null) return { error: 'unknown' };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : 'Error';
  return { error: name, code };
}
