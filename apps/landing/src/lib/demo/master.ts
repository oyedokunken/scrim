import { DEMO_DURATION_MS } from './script';

/**
 * The one timeline behind the hero video. Every layer (the logo, the headline, the app screens,
 * the live recording and the closing card) reads its state from the same clock, so they stay in
 * step while playing, pausing and scrubbing.
 */

/** Slide one is the logo alone. Slide two is the headline alone. Only slide one carries the logo. */
export type Scene =
  | 'opening'
  | 'headline'
  | 'record'
  | 'recording'
  | 'stop'
  | 'edit'
  | 'export'
  | 'library'
  | 'closing';

export interface Segment {
  id: Scene;
  label: string;
  start: number;
  end: number;
}

/** Each scene, its chapter name and how long it lasts. The recording scene is the live zoom demo. */
const PLAN: readonly { id: Scene; label: string; ms: number }[] = [
  { id: 'opening', label: 'Logo', ms: 2000 },
  { id: 'headline', label: 'Headline', ms: 2600 },
  { id: 'record', label: 'Record', ms: 5000 },
  { id: 'recording', label: 'Recording', ms: DEMO_DURATION_MS },
  { id: 'stop', label: 'Stop', ms: 3600 },
  { id: 'edit', label: 'Edit', ms: 5000 },
  { id: 'export', label: 'Export', ms: 3600 },
  { id: 'library', label: 'Library', ms: 4400 },
  { id: 'closing', label: 'Address', ms: 3400 },
];

export const SEGMENTS: readonly Segment[] = PLAN.reduce<Segment[]>((list, entry) => {
  const start = list[list.length - 1]?.end ?? 0;
  list.push({ id: entry.id, label: entry.label, start, end: start + entry.ms });
  return list;
}, []);

function segmentOf(id: Scene): Segment {
  return SEGMENTS.find((segment) => segment.id === id) as Segment;
}

/** Where the live recording scene begins, in master milliseconds. */
export const DEMO_START_MS = segmentOf('recording').start;
export const MASTER_DURATION_MS = (SEGMENTS[SEGMENTS.length - 1] as Segment).end;

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

/** The scene a time falls in. */
export function sceneAt(timeMs: number): Scene {
  return segmentAt(timeMs).id;
}

/**
 * The Scrim logo belongs to the first slide and to no other. The page renders the logo only
 * while this is true, so no later scene can show it, whatever its CSS does.
 */
export function showLogo(scene: Scene): boolean {
  return scene === 'opening';
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

/** How long a card takes to fade in or out. */
const FADE_MS = 350;

/**
 * The scenes drawn as a card of their own over the video. The logo and the headline share the
 * green brand card, and the recording scene is the video itself.
 */
export const CARD_SCENES: readonly Scene[] = [
  'record',
  'stop',
  'edit',
  'export',
  'library',
  'closing',
];

/** How far a scene has got, from 0 at its start to 1 at its end. */
export function sceneProgress(timeMs: number, id: Scene): number {
  const segment = segmentOf(id);
  const x = (clampTime(timeMs) - segment.start) / (segment.end - segment.start);
  return Math.min(1, Math.max(0, x));
}

/**
 * How opaque a scene's card is. A card fades in over the scene before it. The record card also
 * fades out into the live recording, which has no card of its own.
 */
export function cardOpacity(timeMs: number, id: Scene): number {
  const t = clampTime(timeMs);
  const segment = segmentOf(id);
  const fadeIn = ease(t, segment.start, FADE_MS);
  const fadeOut = id === 'record' ? 1 - ease(t, segment.end - FADE_MS, FADE_MS) : 1;
  return Math.min(fadeIn, fadeOut);
}

/** How opaque each layer is and how far each animation has got, from 0 to 1. */
export interface Frame {
  /** The mark has landed and the wordmark has grown out beside it. */
  wordmark: number;
  /** How opaque the logo is. It is gone by the end of the first slide. */
  logo: number;
  /** The headline words have all arrived at 1. */
  words: number;
  /** The green card behind the logo and the headline. It goes once the record card covers it. */
  brand: number;
  /** The platform logos on the closing card have arrived at 1. */
  logos: number;
  /** The address has arrived. */
  address: number;
}

/** The state of every layer at a master time. A pure function, so scrubbing and playing agree. */
export function frameAt(timeMs: number): Frame {
  const t = clampTime(timeMs);
  const opening = segmentOf('opening');
  const headline = segmentOf('headline');
  const record = segmentOf('record');
  const closing = segmentOf('closing');
  return {
    wordmark: ease(t, 500, 800),
    logo: 1 - ease(t, opening.end - 350, 350),
    words: ease(t, headline.start + 250, 1500),
    brand: t < record.start + FADE_MS ? 1 : 0,
    logos: ease(t, closing.start + 900, 900),
    address: ease(t, closing.start + 250, 900),
  };
}

/** The CSS variables for a frame, to write on the root element. */
export function frameVars(timeMs: number): Record<`--${string}`, string> {
  const frame = frameAt(timeMs);
  const vars: Record<`--${string}`, string> = {
    '--wordmark': frame.wordmark.toFixed(3),
    '--logo': frame.logo.toFixed(3),
    '--words': frame.words.toFixed(3),
    '--brand': frame.brand.toFixed(3),
    '--logos': frame.logos.toFixed(3),
    '--address': frame.address.toFixed(3),
    '--master': (clampTime(timeMs) / MASTER_DURATION_MS).toFixed(5),
  };
  for (const id of CARD_SCENES) {
    vars[`--on-${id}`] = cardOpacity(timeMs, id).toFixed(3);
    vars[`--p-${id}`] = sceneProgress(timeMs, id).toFixed(4);
  }
  return vars;
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
