import { formatBytes } from './disk-space';
import type { RecordingError, RecordingErrorCode, Warning } from './types';

/**
 * Every sentence the engine can show lives here, in plain words, each with what to do next. Code
 * elsewhere picks a code and never writes its own message.
 */
const COPY: Readonly<Record<RecordingErrorCode, { message: string; nextStep: string }>> = {
  'invalid-state': {
    message: 'That cannot be done right now.',
    nextStep: 'Wait for the current step to finish, then try again.',
  },
  'disk-too-full': {
    message: 'There is not enough free space to start recording.',
    nextStep: 'Free up some space, or choose another folder, then try again.',
  },
  'disk-full': {
    message: 'The disk is full. Your recording was saved up to this point.',
    nextStep: 'Free up some space. You can open the saved part from the recording folder.',
  },
  'folder-not-writable': {
    message: 'Scrim cannot write to this folder.',
    nextStep: 'Choose another folder.',
  },
  'folder-unavailable': {
    message: 'The folder is no longer available. Your recording was saved up to this point.',
    nextStep: 'Reconnect the drive if it was unplugged. The saved part is in the recording folder.',
  },
  'write-failed': {
    message: 'Scrim could not save the recording to disk. It was saved up to this point.',
    nextStep: 'Check the folder and the drive, then record again.',
  },
  'screen-permission': {
    message: 'Scrim is not allowed to record the screen.',
    nextStep: 'Allow screen recording for Scrim in your system settings, then try again.',
  },
  'screen-unavailable': {
    message: 'The screen or window to record is not available.',
    nextStep: 'Choose the screen or window again, then try again.',
  },
  'display-removed': {
    message: 'The display you were recording was disconnected. Your recording was saved.',
    nextStep: 'Reconnect the display and record again if you need more.',
  },
  'recorder-failed': {
    message: 'The recorder could not start.',
    nextStep: 'Close Scrim and open it again, then try again.',
  },
  'recorder-crashed': {
    message: 'Recording stopped unexpectedly. It was saved up to this point.',
    nextStep: 'Open Scrim again. It offers to recover the recording.',
  },
  'ffmpeg-missing': {
    message: 'Scrim could not find the tool it needs to finish the recording.',
    nextStep: 'Your footage is safe in the recording folder. Reinstall Scrim, then recover it.',
  },
  'remux-failed': {
    message: 'Scrim could not make a playable copy of the recording.',
    nextStep: 'Your footage is safe in the recording folder. Try recovering it again.',
  },
  'nothing-recoverable': {
    message: 'There was nothing to recover in this recording.',
    nextStep: 'You can dismiss it. Nothing was deleted.',
  },
  unknown: {
    message: 'Something went wrong while recording.',
    nextStep: 'Your footage is kept. Open Scrim again to check for a recording to recover.',
  },
};

export function makeError(code: RecordingErrorCode, detail?: string): RecordingError {
  return { code, ...COPY[code], ...(detail === undefined ? {} : { detail }) };
}

/** The Node error code, such as `ENOSPC`, when an error carries one. */
export function errnoOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

/**
 * Maps a file system error to a message. Before recording starts, a refusal means the folder is
 * not usable. Once recording, a missing folder or an I/O error means the drive went away.
 */
export function errorFromFs(error: unknown, when: 'start' | 'recording'): RecordingError {
  const code = errnoOf(error);
  const detail = code ?? (error instanceof Error ? error.message : undefined);
  switch (code) {
    case 'ENOSPC':
    case 'EDQUOT':
      return makeError(when === 'start' ? 'disk-too-full' : 'disk-full', detail);
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return makeError(when === 'start' ? 'folder-not-writable' : 'write-failed', detail);
    case 'ENOENT':
    case 'EIO':
    case 'ENODEV':
    case 'ENXIO':
      return makeError(when === 'start' ? 'folder-not-writable' : 'folder-unavailable', detail);
    default:
      return makeError(when === 'start' ? 'folder-not-writable' : 'write-failed', detail);
  }
}

export const WARNINGS = {
  diskLow: (freeBytes: number): Warning => ({
    code: 'disk-low',
    message: `Only ${formatBytes(freeBytes)} of space is left. Recording will stop before the disk is full.`,
    freeBytes,
  }),
  deviceLost: (kind: 'camera' | 'mic'): Warning => ({
    code: kind === 'camera' ? 'camera-lost' : 'mic-lost',
    message:
      kind === 'camera'
        ? 'Camera disconnected. Screen recording continues.'
        : 'Microphone disconnected. Screen recording continues.',
  }),
  deviceUnavailable: (
    kind: 'camera' | 'mic',
    reason: 'permission-denied' | 'device-missing' | 'device-busy' | 'unsupported' | 'unknown',
  ): Warning => {
    const name = kind === 'camera' ? 'camera' : 'microphone';
    const settings = kind === 'camera' ? 'Camera' : 'Microphone';
    const why: Record<typeof reason, string> = {
      'permission-denied': `Scrim is not allowed to use the ${name}. Turn it on in Windows Settings, under Privacy and security, ${settings}.`,
      'device-missing': `No ${name} was found. Connect one and record again.`,
      'device-busy': `Another app is using the ${name}. Close it and record again.`,
      unsupported: `This computer cannot record from the ${name}.`,
      unknown: `The ${name} could not be opened.`,
    };
    return {
      code: kind === 'camera' ? 'camera-unavailable' : 'mic-unavailable',
      message: `${why[reason]} The screen is still being recorded.`,
    };
  },
  inputUnavailable: (
    reason: 'wayland' | 'permission' | 'error' | 'window-bounds-unsupported',
  ): Warning => ({
    code: 'input-unavailable',
    message:
      reason === 'window-bounds-unsupported'
        ? 'Cursor effects and auto zoom are off for this window recording, because Scrim cannot follow where the window is on this computer. Record the whole screen to use them.'
        : reason === 'wayland'
          ? 'Cursor effects and auto zoom are off, because this desktop does not let apps see the mouse.'
          : reason === 'permission'
            ? 'Cursor effects and auto zoom are off, because Scrim does not have permission to see the mouse.'
            : 'Cursor effects and auto zoom are off for this recording, because the mouse could not be logged.',
  }),
  writerSlow: (): Warning => ({
    code: 'writer-slow',
    message: 'The disk is writing slowly. If this continues, recording may stop.',
  }),
} as const;
