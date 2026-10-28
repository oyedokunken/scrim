import { describe, expect, it } from 'vitest';
import {
  boundsAt,
  formatBoundsLine,
  parseBoundsNdjson,
  sessionLogSchema,
  toSessionLog,
  type BoundsSample,
  type RawInputEvent,
} from '../src';

const sample = (at: number, x: number, y: number, width = 800, height = 600): BoundsSample => ({
  at,
  x,
  y,
  width,
  height,
});

describe('parseBoundsNdjson', () => {
  it('reads samples in time order and skips noise and a cut off last line', () => {
    const text = `${formatBoundsLine(sample(200, 5, 5))}garbage\n${formatBoundsLine(sample(100, 1, 1))}{"at":300,"x":`;
    expect(parseBoundsNdjson(text).map((entry) => entry.at)).toEqual([100, 200]);
  });

  it('rejects a sample with no size', () => {
    expect(parseBoundsNdjson('{"at":1,"x":0,"y":0,"width":0,"height":5}\n')).toEqual([]);
    expect(parseBoundsNdjson('')).toEqual([]);
  });
});

describe('boundsAt', () => {
  const samples = [sample(100, 10, 10), sample(200, 20, 20), sample(300, 30, 30)];

  it('takes the latest sample at or before the time', () => {
    expect(boundsAt(samples, 250)?.x).toBe(20);
    expect(boundsAt(samples, 200)?.x).toBe(20);
    expect(boundsAt(samples, 9999)?.x).toBe(30);
  });

  it('takes the first sample for a time before all of them, and nothing for no samples', () => {
    expect(boundsAt(samples, 0)?.x).toBe(10);
    expect(boundsAt([], 5)).toBeUndefined();
  });
});

describe('toSessionLog with window bounds and display ids', () => {
  const base = {
    startTime: 0,
    pauses: [],
    frame: { width: 800, height: 600 },
    origin: { x: 0, y: 0 },
    scale: 1,
  };
  const click = (at: number, x: number, y: number): RawInputEvent => ({
    type: 'down',
    at,
    x,
    y,
    button: 'left',
    display: '7',
  });

  it('places each event relative to the window as it was at that moment', () => {
    const result = toSessionLog([click(150, 150, 140), click(250, 250, 240)], {
      ...base,
      windowBounds: [sample(100, 100, 100), sample(200, 200, 200)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events.map((event) => [event.x, event.y])).toEqual([
      [50, 40],
      [50, 40],
    ]);
    expect(result.value.windowBounds).toEqual([
      { t: 100, x: 100, y: 100, width: 800, height: 600 },
      { t: 200, x: 200, y: 200, width: 800, height: 600 },
    ]);
    expect(sessionLogSchema.safeParse(result.value).success).toBe(true);
  });

  it('keeps the display id of each event', () => {
    const result = toSessionLog([click(10, 5, 5)], base);
    expect(result.ok && result.value.events[0]).toMatchObject({ display: '7' });
  });

  it('leaves the display out when the event had none, and the bounds out without a window', () => {
    const result = toSessionLog([{ type: 'down', at: 5, x: 1, y: 1, button: 'left' }], base);
    expect(result.ok && 'display' in result.value.events[0]!).toBe(false);
    expect(result.ok && 'windowBounds' in result.value).toBe(false);
  });

  it('drops a window position that repeats the one before it', () => {
    const result = toSessionLog([], {
      ...base,
      windowBounds: [sample(10, 5, 5), sample(20, 5, 5), sample(30, 6, 5)],
    });
    expect(result.ok && result.value.windowBounds?.map((entry) => entry.t)).toEqual([10, 30]);
  });

  it('puts window positions on media time across a pause', () => {
    const result = toSessionLog([], {
      ...base,
      pauses: [{ pausedAt: 100, resumedAt: 200 }],
      windowBounds: [sample(50, 1, 1), sample(300, 2, 2)],
    });
    expect(result.ok && result.value.windowBounds?.map((entry) => entry.t)).toEqual([50, 200]);
  });
});
