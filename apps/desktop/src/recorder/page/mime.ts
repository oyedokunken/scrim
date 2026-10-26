/**
 * In order of preference. Hardware friendly H.264 first, then the open codecs.
 *
 * `video/mp4;codecs=avc1` is deliberately not here. It is supported, but measured on Windows it
 * ignores the timeslice: nothing is delivered until the recorder stops, then everything arrives at
 * once. A crash would lose the whole recording, which breaks the rule that a recording is never
 * lost. WebM delivers a chunk every second. Put mp4 back only if a later Chromium streams it.
 */
export const VIDEO_MIME_TYPES = [
  'video/webm;codecs=h264',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
] as const;

export const AUDIO_MIME_TYPES = ['audio/webm;codecs=opus'] as const;

/** The first supported type for a track, or undefined when this browser supports none. */
export function pickMimeType(
  kind: 'video' | 'audio',
  isSupported: (mimeType: string) => boolean,
): string | undefined {
  const candidates = kind === 'video' ? VIDEO_MIME_TYPES : AUDIO_MIME_TYPES;
  return candidates.find((mimeType) => isSupported(mimeType));
}
