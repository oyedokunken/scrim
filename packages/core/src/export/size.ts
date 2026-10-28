import type { Frame } from '../input/types';

export type ResolutionPreset = 'source' | '720p' | '1080p' | '1440p' | '2160p';

/** The largest output Scrim writes. The owner has not confirmed this ceiling yet (CLAUDE.md). */
export const MAX_OUTPUT: Frame = { width: 3840, height: 2160 };

const PRESET_BOX: Record<Exclude<ResolutionPreset, 'source'>, Frame> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
};

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}

/**
 * The size of the exported video for a source frame. The source is fitted inside the preset box
 * without changing its shape, never enlarged, capped at 3840 by 2160, and both sides are even
 * because H.264 with yuv420p requires it. The same input always gives the same size.
 */
export function outputSize(source: Frame, preset: ResolutionPreset): Frame {
  const box = preset === 'source' ? MAX_OUTPUT : PRESET_BOX[preset];
  const limit = {
    width: Math.min(box.width, MAX_OUTPUT.width),
    height: Math.min(box.height, MAX_OUTPUT.height),
  };
  const scale = Math.min(1, limit.width / source.width, limit.height / source.height);
  return { width: evenFloor(source.width * scale), height: evenFloor(source.height * scale) };
}
