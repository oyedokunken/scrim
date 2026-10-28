import type { SessionFile } from '@scrim/core';

/** A small session object for the export tests. No files are involved. */
export function makeSession(
  options: {
    screenStartMs?: number;
    pauses?: SessionFile['pauses'];
    cropPx?: { x: number; y: number; width: number; height: number };
    frame?: { width: number; height: number };
    withBubble?: boolean;
  } = {},
): SessionFile {
  const start = options.screenStartMs ?? 0;
  const track = (
    kind: 'screen' | 'camera' | 'mic',
    offset: number,
  ): SessionFile['tracks'][number] => ({
    kind,
    file: `${kind}.raw.webm`,
    mimeType: kind === 'mic' ? 'audio/webm;codecs=opus' : 'video/webm;codecs=h264',
    startedAt: start + offset,
    bytesWritten: 1,
    complete: true,
    stoppedAt: start + 4000,
  });
  return {
    version: 1,
    id: '6e8f53a5-1efc-44e5-aaa1-624bd921d469',
    name: 'Test',
    createdAt: '2026-10-28T16:26:43.683Z',
    app: { version: '1.0.0', os: 'windows', arch: 'x64' },
    pid: 1,
    source: {
      kind: options.cropPx === undefined ? 'display' : 'region',
      origin: { x: 0, y: 0 },
      scaleFactor: 1.5,
      frame: options.frame ?? { width: 1280, height: 720 },
      ...(options.cropPx === undefined ? {} : { cropPx: options.cropPx }),
    },
    capture: { cursorInCapture: true },
    tracks: [track('screen', 0), track('camera', 40), track('mic', 20)],
    clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
    pauses: options.pauses ?? [],
    input: { status: 'unavailable', reason: 'error' },
    warnings: [],
    ...(options.withBubble === true
      ? {
          bubble: [
            { t: 0, corner: 'bl' as const, x: 16, y: 300, size: 120 },
            { t: 2000, corner: 'tl' as const, x: 16, y: 16, size: 120 },
          ],
        }
      : {}),
    heartbeatAt: '2026-10-28T16:27:16.620Z',
    heartbeatElapsedMs: start + 4000,
    cleanClose: true,
  };
}
