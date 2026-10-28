const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

/**
 * Free space limits. Recording will not start below `startMinBytes`. While recording, below
 * `softBytes` the user is warned and below `hardBytes` the recording stops and saves cleanly,
 * which leaves room to finish the files and make the playable copy.
 */
export const DISK_FLOORS = {
  startMinBytes: 2 * GB,
  softBytes: 1536 * MB,
  hardBytes: 300 * MB,
} as const;

export type DiskVerdict = 'ok' | 'warn' | 'stop' | 'refuse';

export interface DiskFloors {
  startMinBytes: number;
  softBytes: number;
  hardBytes: number;
}

/** What to do about the free space. `start` is the check before recording begins. */
export function assessDisk(
  freeBytes: number,
  when: 'start' | 'recording',
  floors: DiskFloors = DISK_FLOORS,
): DiskVerdict {
  if (when === 'start') return freeBytes < floors.startMinBytes ? 'refuse' : 'ok';
  if (freeBytes < floors.hardBytes) return 'stop';
  return freeBytes < floors.softBytes ? 'warn' : 'ok';
}

/** Space in plain words for a message: "1.4 GB" or "320 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${String(Math.max(0, Math.round(bytes / MB)))} MB`;
}
