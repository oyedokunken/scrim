import { vi } from 'vitest';
import type { RecordingApi } from '../../../src/main/ipc/recording-handlers';
import type {
  FinishedRecording,
  RecordingError,
  RecordingSnapshot,
} from '../../../src/main/recording/types';

export const finished: FinishedRecording = {
  folder: 'C:\\Recordings\\take 1',
  name: 'take 1',
  files: [{ kind: 'screen', path: 'C:\\Recordings\\take 1\\screen.webm' }],
  durationMs: 12_000,
  bytes: 4096,
  inputLog: 'C:\\Recordings\\take 1\\take 1.scrim.json',
  recovered: false,
  warnings: [],
};

export const snapshot: RecordingSnapshot = {
  phase: 'recording',
  elapsedMs: 5000,
  bytesWritten: 2048,
  tracks: [{ kind: 'screen', bytesWritten: 2048, ended: false }],
  warnings: [],
  folder: 'C:\\Recordings\\take 1',
};

export const error: RecordingError = {
  code: 'disk-full',
  message: 'The disk is full. Your recording was saved up to this point.',
  nextStep: 'Free some space, then record again.',
  detail: 'ENOSPC: no space left on device, write C:\\Users\\zainab\\Videos\\Scrim\\x.webm',
};

/** A recording service that does nothing but answer, with every call recorded. */
export function fakeRecording(overrides: Partial<RecordingApi> = {}): RecordingApi {
  return {
    start: vi.fn(() =>
      Promise.resolve({ ok: true as const, value: { folder: 'C:\\Recordings\\take 1' } }),
    ),
    pause: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    resume: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    stop: vi.fn(() => Promise.resolve({ ok: true as const, value: finished })),
    snapshot: vi.fn(() => snapshot),
    listRecoverable: vi.fn(() => Promise.resolve([])),
    recover: vi.fn(() => Promise.resolve({ ok: true as const, value: finished })),
    dismiss: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}
