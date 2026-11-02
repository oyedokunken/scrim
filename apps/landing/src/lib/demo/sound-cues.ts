import { MASTER_DURATION_MS, type Segment } from './master';

/** The effects and the music parts the hero video can play. Everything is synthesised. */
export type CueKind =
  | 'click'
  | 'pop'
  | 'whoosh'
  | 'rise'
  | 'fall'
  | 'chime'
  | 'shutter'
  /** One bar of the pad chord. */
  | 'pad'
  /** A soft beat. */
  | 'pulse'
  /** A short swell where the scene changes. */
  | 'swell'
  /** The music fades in. */
  | 'musicIn'
  /** The music fades out, at the end of the loop. */
  | 'musicOut';

/** One sound at one moment of the master timeline. */
export interface Cue {
  /** Master milliseconds. */
  t: number;
  kind: CueKind;
  /** Which chord of the progression a pad plays. */
  chord?: number;
  /** How long a pad lasts, in milliseconds. */
  ms?: number;
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

/** A calm, modern pace: 96 beats a minute, four beats to a bar. */
export const BPM = 96;
export const BEAT_MS = 60_000 / BPM;
export const BAR_MS = BEAT_MS * 4;
/** How long the music takes to fade out at the end of the loop. */
export const FADE_OUT_MS = 1600;

/**
 * The four chords of the pad, as frequencies in hertz: Cmaj7, Am7, Fmaj7 and G6. Soft, open and
 * in no hurry. Each bar plays one, and the progression repeats.
 */
export const CHORDS: readonly (readonly number[])[] = [
  [130.81, 196.0, 246.94, 329.63],
  [110.0, 164.81, 220.0, 329.63],
  [87.31, 174.61, 220.0, 329.63],
  [98.0, 196.0, 246.94, 329.63],
];

/** The chord that plays at a master time, and how long is left of its bar. */
export function chordAt(timeMs: number): { chord: number; remainingMs: number } {
  const t = Math.max(0, timeMs);
  const bar = Math.floor(t / BAR_MS);
  return { chord: bar % CHORDS.length, remainingMs: (bar + 1) * BAR_MS - t };
}

/** The music of the whole video: a pad each bar, a beat each beat, a swell at each new scene. */
function musicCues(segments: readonly Segment[]): Cue[] {
  const cues: Cue[] = [{ t: 1, kind: 'musicIn' }];
  const total = MASTER_DURATION_MS;
  for (let bar = 0; bar * BAR_MS < total; bar += 1) {
    cues.push({ t: bar * BAR_MS + 2, kind: 'pad', chord: bar % CHORDS.length, ms: BAR_MS });
  }
  for (let beat = 0; beat * BEAT_MS < total - FADE_OUT_MS; beat += 1) {
    // The first beat of each bar is the strongest, and the pulse starts once the headline is up.
    if (beat * BEAT_MS >= 2000) {
      cues.push({ t: beat * BEAT_MS + 3, kind: 'pulse' });
    }
  }
  for (const segment of segments.slice(1)) {
    cues.push({ t: segment.start + 4, kind: 'swell' });
  }
  cues.push({ t: total - FADE_OUT_MS, kind: 'musicOut' });
  return cues;
}

/**
 * Every sound of the video with its time, in order: the effects and the music. A pure function of
 * the timeline, so the cue list can be tested without a browser or an audio device.
 */
export function soundCuesFor(source: CueSource): Cue[] {
  const cues: Cue[] = musicCues(source.segments);
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

/** The cue kinds that are music rather than effects. Effects duck the music. */
const MUSIC_KINDS: ReadonlySet<CueKind> = new Set(['pad', 'pulse', 'swell', 'musicIn', 'musicOut']);

export function isMusic(kind: CueKind): boolean {
  return MUSIC_KINDS.has(kind);
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
