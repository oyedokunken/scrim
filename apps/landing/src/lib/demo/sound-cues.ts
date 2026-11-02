import type { Segment } from './master';

/** The sounds the hero video can make. Each one is synthesised, so nothing is downloaded. */
export type CueKind = 'click' | 'pop' | 'whoosh' | 'rise' | 'fall' | 'chime' | 'shutter';

/** One sound at one moment of the master timeline. */
export interface Cue {
  /** Master milliseconds. */
  t: number;
  kind: CueKind;
}

export interface CueSource {
  segments: readonly Segment[];
  /** The clicks of the live recording, in recording milliseconds. */
  clicks: readonly { t: number }[];
  /** The stretches of the live recording where the camera is zoomed in. */
  zoomSpans: readonly { start: number; end: number }[];
}

/** Where in a scene each UI sound lands, in milliseconds from the start of that scene. */
const SCENE_CUES: Readonly<Record<string, readonly { at: number; kind: CueKind }[]>> = {
  record: [
    { at: 1200, kind: 'pop' },
    { at: 1700, kind: 'pop' },
    { at: 3000, kind: 'click' },
    { at: 4300, kind: 'rise' },
  ],
  stop: [
    { at: 0, kind: 'fall' },
    { at: 2600, kind: 'click' },
  ],
  edit: [
    { at: 1200, kind: 'pop' },
    { at: 2200, kind: 'pop' },
    { at: 3200, kind: 'pop' },
    { at: 4200, kind: 'click' },
  ],
  export: [
    { at: 600, kind: 'click' },
    { at: 2700, kind: 'chime' },
  ],
  library: [
    { at: 800, kind: 'pop' },
    { at: 2200, kind: 'whoosh' },
  ],
  platforms: [{ at: 700, kind: 'pop' }],
  address: [{ at: 1000, kind: 'click' }],
};

/**
 * Every sound of the video with its time, in order. A pure function of the timeline, so the cue
 * list can be tested without a browser or an audio device.
 */
export function soundCuesFor(source: CueSource): Cue[] {
  const cues: Cue[] = [];
  for (const segment of source.segments) {
    for (const entry of SCENE_CUES[segment.id] ?? []) {
      cues.push({ t: segment.start + entry.at, kind: entry.kind });
    }
    if (segment.id === 'recording') {
      for (const click of source.clicks) {
        cues.push({ t: segment.start + click.t, kind: 'click' });
      }
      for (const span of source.zoomSpans) {
        cues.push({ t: segment.start + span.start, kind: 'whoosh' });
      }
    }
  }
  return cues.sort((a, b) => a.t - b.t);
}

/** The longest step between two frames that still counts as playing rather than as a seek. */
export const MAX_PLAY_STEP_MS = 250;

/**
 * The cues that fall in the step from one frame to the next. A jump back, or a jump of more than
 * a quarter of a second, is a seek and plays nothing, so scrubbing stays silent.
 */
export function cuesBetween(cues: readonly Cue[], fromMs: number, toMs: number): Cue[] {
  if (toMs <= fromMs || toMs - fromMs > MAX_PLAY_STEP_MS) {
    return [];
  }
  return cues.filter((cue) => cue.t > fromMs && cue.t <= toMs);
}
