import type { TrackKind } from './schema';

/** Fixed names inside a session folder. Only the track extensions and the name vary. */
export const SESSION_FILES = {
  session: 'session.json',
  input: 'input.ndjson',
  windowBounds: 'window-bounds.ndjson',
  edits: 'edits.json',
} as const;

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_NAME_LENGTH = 200;
/** Longer input is cut before any work, so a crafted name cannot make this slow. */
const MAX_INPUT_LENGTH = 1024;
const FORBIDDEN = '<>:"/\\|?*';

function isSpace(char: string): boolean {
  return char.trim() === '';
}

/** Drops trailing dots and spaces with one backward scan, so it runs in linear time. */
function trimEndDotsAndSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && (text.charAt(end - 1) === '.' || text.charAt(end - 1) === ' ')) end -= 1;
  return text.slice(0, end);
}

/** Replaces forbidden characters with spaces and collapses every run of spaces into one. */
function collapse(text: string): string {
  let out = '';
  let pendingSpace = false;
  for (const char of text) {
    const blank = char.charCodeAt(0) < 32 || FORBIDDEN.includes(char) || isSpace(char);
    if (blank) {
      pendingSpace = out !== '';
    } else {
      if (pendingSpace) out += ' ';
      pendingSpace = false;
      out += char;
    }
  }
  return out;
}

/**
 * Makes a recording name safe as a folder and file name on every system: no path separators or
 * characters Windows forbids, no control characters, no trailing dots or spaces, no reserved
 * device names, and at most 200 characters. An empty result becomes `Recording`. It uses plain
 * string scans, never a pattern that can backtrack, and reads at most 1024 characters.
 */
export function sanitizeName(name: string): string {
  let cleaned = trimEndDotsAndSpaces(collapse(name.slice(0, MAX_INPUT_LENGTH)));
  let start = 0;
  while (cleaned.charAt(start) === '.') start += 1;
  cleaned = trimEndDotsAndSpaces(cleaned.slice(start, start + MAX_NAME_LENGTH).trim());
  if (cleaned === '') return 'Recording';
  return RESERVED_WINDOWS_NAMES.test(cleaned) ? `${cleaned} recording` : cleaned;
}

/** The container extension for a MediaRecorder type: `mp4` for an mp4 type, otherwise `webm`. */
export function extensionForMime(mimeType: string): 'mp4' | 'webm' {
  return mimeType.toLowerCase().startsWith('video/mp4') ||
    mimeType.toLowerCase().startsWith('audio/mp4')
    ? 'mp4'
    : 'webm';
}

export function rawTrackFile(kind: TrackKind, mimeType: string): string {
  return `${kind}.raw.${extensionForMime(mimeType)}`;
}

/**
 * The container of the playable copy. WebM cannot hold H.264, so an H.264 track is remuxed into
 * mp4. VP8, VP9 and Opus stay in WebM.
 */
export function playableExtensionForMime(mimeType: string): 'mp4' | 'webm' {
  const type = mimeType.toLowerCase();
  return type.includes('h264') || type.includes('avc1') ? 'mp4' : 'webm';
}

export function playableTrackFile(kind: TrackKind, mimeType: string): string {
  return `${kind}.${playableExtensionForMime(mimeType)}`;
}

/** The session folder name for a recording, `<name>.scrim`. */
export function sessionFolderName(name: string): string {
  return `${sanitizeName(name)}.scrim`;
}

/** The saved input log name, `<name>.scrim.json`. */
export function inputLogFileName(name: string): string {
  return `${sanitizeName(name)}.scrim.json`;
}

/**
 * A folder name that does not collide: `name.scrim`, then `name 2.scrim`, `name 3.scrim`.
 * `exists` says whether a folder name is already taken.
 */
export function uniqueSessionFolder(name: string, exists: (folder: string) => boolean): string {
  const base = sanitizeName(name);
  let candidate = `${base}.scrim`;
  for (let n = 2; exists(candidate); n += 1) {
    candidate = `${base} ${String(n)}.scrim`;
  }
  return candidate;
}
