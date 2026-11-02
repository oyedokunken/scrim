import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  activeTexts,
  cleanText,
  clampTextItem,
  editListSchema,
  emptyEditList,
  isTextVisible,
  newTextItem,
  textItemSchema,
  TEXT_COLORS,
  TEXT_LIMITS,
  TEXT_SIZES,
  tidyTexts,
  type TextItem,
} from '../src';
import { buildTimeline, createRenderModel } from '../src/render';
import type { SessionFile } from '../src/session/schema';

const DURATION = 10_000;

const session: SessionFile = {
  version: 1,
  id: '6f1f3c1e-0000-4000-8000-000000000001',
  name: 'test',
  createdAt: '2026-10-27T10:00:00.000Z',
  app: { version: '0.0.0', os: 'windows', arch: 'x64' },
  pid: 1,
  source: {
    kind: 'display',
    origin: { x: 0, y: 0 },
    scaleFactor: 1,
    frame: { width: 1280, height: 720 },
  },
  capture: { cursorInCapture: true },
  tracks: [
    {
      kind: 'screen',
      file: 'screen.raw.webm',
      mimeType: 'video/webm',
      startedAt: 0,
      bytesWritten: 1,
      complete: true,
      stoppedAt: DURATION,
    },
  ],
  clock: { rendererOffsetMs: 0, uncertaintyMs: 1 },
  pauses: [],
  input: { status: 'recorded', file: 'x.scrim.json' },
  warnings: [],
  heartbeatAt: '2026-10-27T10:00:10.000Z',
  heartbeatElapsedMs: DURATION,
  cleanClose: true,
};

const item = (over: Partial<TextItem> = {}): TextItem => ({
  id: 'a',
  text: 'Hello',
  startMs: 1000,
  endMs: 3000,
  x: 0.5,
  y: 0.5,
  size: 'medium',
  color: 'white',
  chip: false,
  ...over,
});

const modelWith = (
  texts: TextItem[],
  edits: {
    trim?: { startMs: number; endMs: number } | null;
    cuts?: { startMs: number; endMs: number }[];
  } = {},
) =>
  createRenderModel({
    session,
    log: null,
    edits: { trim: edits.trim ?? null, cuts: edits.cuts ?? [], texts },
    settings: { preset: 'source', fps: 30 },
  });

describe('the edit list with text', () => {
  it('loads an older file that has no text', () => {
    const parsed = editListSchema.parse({ version: 1, trim: null, cuts: [] });
    expect(parsed.texts).toBeUndefined();
    expect(emptyEditList().texts).toBeUndefined();
  });

  it('accepts a valid item and round trips it', () => {
    const list = { version: 1, trim: null, cuts: [], texts: [item()] };
    expect(editListSchema.parse(list)).toEqual(list);
  });

  it.each([
    ['empty text', { text: '' }],
    ['markup', { text: '<b>hi</b>' }],
    ['a line break', { text: 'a\nb' }],
    ['text that is too long', { text: 'x'.repeat(TEXT_LIMITS.maxLength + 1) }],
    ['a position outside the frame', { x: 1.2 }],
    ['a negative position', { y: -0.1 }],
    ['an end before the start', { startMs: 500, endMs: 400 }],
    ['an unknown size', { size: 'huge' }],
    ['an unknown color', { color: 'red' }],
    ['an extra field', { font: 'Comic' }],
  ])('rejects %s', (_label, over) => {
    expect(textItemSchema.safeParse({ ...item(), ...over }).success).toBe(false);
  });
});

describe('cleaning and clamping', () => {
  it('turns markup and control characters into plain words', () => {
    expect(cleanText('  <script>alert(1)</script>\n\tdone  ')).toBe('script alert(1) /script done');
    expect(cleanText('a   b')).toBe('a b');
    expect(cleanText('x'.repeat(500))).toHaveLength(TEXT_LIMITS.maxLength);
  });

  it('keeps an item inside the recording and the frame, and drops empty ones', () => {
    const clamped = clampTextItem(item({ startMs: -50, endMs: 99_999, x: -2, y: 7 }), DURATION);
    expect(clamped).toMatchObject({ startMs: 0, endMs: DURATION, x: 0, y: 1 });
    expect(clampTextItem(item({ text: '<>' }), DURATION)).toBeNull();
  });

  it('keeps new items inside the recording', () => {
    const made = newTextItem('n', 9_900, DURATION);
    expect(made.endMs).toBeLessThanOrEqual(DURATION);
    expect(made.endMs).toBeGreaterThan(made.startMs);
    expect(textItemSchema.safeParse(made).success).toBe(true);
  });

  it('is always valid, in the frame and sorted, whatever it is given', () => {
    const arbitrary = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      text: fc.string({ maxLength: 200 }),
      startMs: fc.double({ min: -5000, max: 20_000, noNaN: true }),
      endMs: fc.double({ min: -5000, max: 20_000, noNaN: true }),
      x: fc.double({ min: -3, max: 3, noNaN: true }),
      y: fc.double({ min: -3, max: 3, noNaN: true }),
      size: fc.constantFrom(...TEXT_SIZES),
      color: fc.constantFrom(...TEXT_COLORS),
      chip: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arbitrary, { maxLength: 20 }), (items) => {
        const tidy = tidyTexts(items, DURATION);
        for (const t of tidy) {
          expect(textItemSchema.safeParse(t).success).toBe(true);
          expect(t.startMs).toBeGreaterThanOrEqual(0);
          expect(t.endMs).toBeLessThanOrEqual(DURATION);
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.x).toBeLessThanOrEqual(1);
        }
        for (let i = 1; i < tidy.length; i += 1) {
          expect(tidy[i]?.startMs).toBeGreaterThanOrEqual(tidy[i - 1]?.startMs ?? 0);
        }
      }),
    );
  });
});

describe('text in the render model', () => {
  it('shows an item only between its start and end', () => {
    const model = modelWith([item()]);
    expect(model.describeAt(500).texts).toHaveLength(0);
    expect(model.describeAt(1000).texts).toHaveLength(1);
    expect(model.describeAt(2999).texts).toHaveLength(1);
    expect(model.describeAt(3000).texts).toHaveLength(0);
  });

  it('follows the cuts: output time maps back to the recording clock', () => {
    const model = modelWith([item({ startMs: 5000, endMs: 6000 })], {
      cuts: [{ startMs: 1000, endMs: 3000 }],
    });
    // Output 3000 is recording 5000 once 2000 ms are cut.
    expect(model.describeAt(2900).texts).toHaveLength(0);
    expect(model.describeAt(3100).texts).toHaveLength(1);
  });

  it('ignores an item wholly inside a cut or outside the trim', () => {
    const inCut = item({ startMs: 2000, endMs: 2500 });
    const model = modelWith([inCut], { cuts: [{ startMs: 1000, endMs: 3000 }] });
    expect(model.texts).toHaveLength(0);
    for (let i = 0; i < model.frameCount; i += 1) {
      expect(model.describeFrame(i).texts).toHaveLength(0);
    }
    const trimmed = modelWith([item({ startMs: 0, endMs: 900 })], {
      trim: { startMs: 1000, endMs: 5000 },
    });
    expect(trimmed.texts).toHaveLength(0);
  });

  it('shows the part of an item that crosses a cut on both sides', () => {
    const model = modelWith([item({ startMs: 500, endMs: 4000 })], {
      cuts: [{ startMs: 1000, endMs: 3000 }],
    });
    expect(model.describeAt(700).texts).toHaveLength(1);
    expect(model.describeAt(1500).texts).toHaveLength(1);
  });

  it('never shows an item at a moment that was cut, for any cuts', () => {
    const span = fc
      .tuple(fc.integer({ min: 0, max: 9000 }), fc.integer({ min: 100, max: 3000 }))
      .map(([s, l]) => ({ startMs: s, endMs: Math.min(DURATION, s + l) }));
    fc.assert(
      fc.property(
        fc.array(span, { maxLength: 4 }),
        fc.array(span, { minLength: 1, maxLength: 4 }),
        (cuts, texts) => {
          const items = texts.map((t, i) => item({ id: String(i), ...t }));
          const model = modelWith(items, { cuts });
          const timeline = buildTimeline(DURATION, { trim: null, cuts });
          for (let i = 0; i < model.frameCount; i += 3) {
            const frame = model.describeFrame(i);
            const inCut = cuts.some(
              (c) => frame.recordingTimeMs > c.startMs && frame.recordingTimeMs < c.endMs,
            );
            expect(inCut).toBe(false);
            for (const shown of frame.texts) {
              expect(frame.recordingTimeMs).toBeGreaterThanOrEqual(shown.startMs);
              expect(frame.recordingTimeMs).toBeLessThan(shown.endMs);
              expect(isTextVisible(shown, timeline)).toBe(true);
            }
          }
          expect(activeTexts(model.texts, -1)).toHaveLength(0);
        },
      ),
    );
  });
});
