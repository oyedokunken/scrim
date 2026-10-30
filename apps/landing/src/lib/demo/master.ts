import { DEMO_DURATION_MS } from './script';

/**
 * The one timeline behind the hero video. Every layer (the logo card, the tagline, the product
 * demo, the platform card and the address card) reads its state from the same clock, so they
 * stay in step while playing, pausing and scrubbing.
 */
export interface Segment {
  id: 'intro' | 'tagline' | 'demo' | 'platforms' | 'final';
  label: string;
  start: number;
  end: number;
}

const INTRO_MS = 2200;
const TAGLINE_MS = 3000;
const PLATFORMS_MS = 3200;
const FINAL_MS = 3600;

export const DEMO_START_MS = INTRO_MS + TAGLINE_MS;
export const PLATFORMS_START_MS = DEMO_START_MS + DEMO_DURATION_MS;
export const FINAL_START_MS = PLATFORMS_START_MS + PLATFORMS_MS;
export const MASTER_DURATION_MS = FINAL_START_MS + FINAL_MS;

export const SEGMENTS: readonly Segment[] = [
  { id: 'intro', label: 'Intro', start: 0, end: INTRO_MS },
  { id: 'tagline', label: 'Tagline', start: INTRO_MS, end: DEMO_START_MS },
  { id: 'demo', label: 'Demo', start: DEMO_START_MS, end: PLATFORMS_START_MS },
  { id: 'platforms', label: 'Platforms', start: PLATFORMS_START_MS, end: FINAL_START_MS },
  { id: 'final', label: 'Address', start: FINAL_START_MS, end: MASTER_DURATION_MS },
];

/** Keeps a time inside the timeline. */
export function clampTime(timeMs: number): number {
  return Math.min(MASTER_DURATION_MS, Math.max(0, timeMs));
}

/** The segment a time falls in. The last instant belongs to the last segment. */
export function segmentAt(timeMs: number): Segment {
  const time = clampTime(timeMs);
  const found = SEGMENTS.find((segment) => time >= segment.start && time < segment.end);
  return found ?? (SEGMENTS[SEGMENTS.length - 1] as Segment);
}

/** Where the product demo is, in its own milliseconds, for a master time. */
export function demoTimeAt(timeMs: number): number {
  return Math.min(DEMO_DURATION_MS, Math.max(0, timeMs - DEMO_START_MS));
}

/** 0 before `start`, 1 after `start + duration`, a smooth ease in between. */
function ease(timeMs: number, start: number, duration: number): number {
  const x = Math.min(1, Math.max(0, (timeMs - start) / duration));
  return x * x * (3 - 2 * x);
}

/** How opaque each layer is and how far each animation has got, from 0 to 1. */
export interface Frame {
  /** The mark has landed and the wordmark has grown out beside it. */
  wordmark: number;
  /** The logo shrinks up to make room for the tagline. */
  lift: number;
  /** The tagline words have all arrived at 1. */
  words: number;
  /** The green logo card. It fades out as the demo starts. */
  brand: number;
  /** The platform card. */
  platforms: number;
  /** The platform logos have all arrived at 1. */
  logos: number;
  /** The address card. */
  final: number;
  /** The address has arrived. */
  address: number;
}

const FADE_MS = 450;

/** The state of every card at a master time. A pure function, so scrubbing and playing agree. */
export function frameAt(timeMs: number): Frame {
  const t = clampTime(timeMs);
  return {
    wordmark: ease(t, 500, 800),
    lift: ease(t, INTRO_MS, 700),
    words: ease(t, INTRO_MS + 700, 1700),
    brand: 1 - ease(t, DEMO_START_MS, FADE_MS),
    platforms: ease(t, PLATFORMS_START_MS, FADE_MS),
    logos: ease(t, PLATFORMS_START_MS + 250, 1100),
    final: ease(t, FINAL_START_MS, FADE_MS),
    address: ease(t, FINAL_START_MS + 250, 900),
  };
}

/** The CSS variables for a frame, to write on the root element. */
export function frameVars(timeMs: number): Record<`--${string}`, string> {
  const frame = frameAt(timeMs);
  return {
    '--wordmark': frame.wordmark.toFixed(3),
    '--lift': frame.lift.toFixed(3),
    '--words': frame.words.toFixed(3),
    '--brand': frame.brand.toFixed(3),
    '--platforms': frame.platforms.toFixed(3),
    '--logos': frame.logos.toFixed(3),
    '--final': frame.final.toFixed(3),
    '--address': frame.address.toFixed(3),
    '--master': (clampTime(timeMs) / MASTER_DURATION_MS).toFixed(5),
  };
}

/** Minutes and seconds with no leading zero on the minutes: 7000 becomes 0:07. */
export function formatTime(timeMs: number): string {
  const total = Math.floor(clampTime(timeMs) / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`;
}

/** The spoken position for the scrubber, for example "Demo, 0:12 of 0:30". */
export function describePosition(timeMs: number): string {
  return `${segmentAt(timeMs).label}, ${formatTime(timeMs)} of ${formatTime(MASTER_DURATION_MS)}`;
}

/** The share of the timeline a time sits at, as a percentage for CSS. */
export function percentOf(timeMs: number): number {
  return (clampTime(timeMs) / MASTER_DURATION_MS) * 100;
}
