import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroDemo } from '@/components/hero-demo/hero-demo';
import {
  DEMO_START_MS,
  FINAL_START_MS,
  MASTER_DURATION_MS,
  PLATFORMS_START_MS,
  SEGMENTS,
  clampTime,
  demoTimeAt,
  describePosition,
  formatTime,
  frameAt,
  frameVars,
  percentOf,
  segmentAt,
} from '@/lib/demo/master';
import { DEMO_DURATION_MS } from '@/lib/demo/script';
import { splitWords } from '@/lib/demo/words';
import { siteConfig } from '@/site.config';

describe('the master timeline', () => {
  it('has five segments that touch and cover the whole video', () => {
    expect(SEGMENTS.map((segment) => segment.id)).toEqual([
      'intro',
      'tagline',
      'demo',
      'platforms',
      'final',
    ]);
    expect(SEGMENTS[0]?.start).toBe(0);
    for (let index = 1; index < SEGMENTS.length; index += 1) {
      expect(SEGMENTS[index]?.start).toBe(SEGMENTS[index - 1]?.end);
    }
    expect(SEGMENTS[SEGMENTS.length - 1]?.end).toBe(MASTER_DURATION_MS);
  });

  it('gives the product demo exactly its own length', () => {
    const demo = SEGMENTS.find((segment) => segment.id === 'demo');
    expect(demo?.start).toBe(DEMO_START_MS);
    expect((demo?.end ?? 0) - (demo?.start ?? 0)).toBe(DEMO_DURATION_MS);
    expect(PLATFORMS_START_MS).toBe(DEMO_START_MS + DEMO_DURATION_MS);
    expect(FINAL_START_MS).toBeGreaterThan(PLATFORMS_START_MS);
  });

  it('finds the segment for a time and keeps times inside the video', () => {
    expect(segmentAt(0).id).toBe('intro');
    expect(segmentAt(DEMO_START_MS).id).toBe('demo');
    expect(segmentAt(PLATFORMS_START_MS - 1).id).toBe('demo');
    expect(segmentAt(PLATFORMS_START_MS).id).toBe('platforms');
    expect(segmentAt(MASTER_DURATION_MS).id).toBe('final');
    expect(segmentAt(-50).id).toBe('intro');
    expect(clampTime(-1)).toBe(0);
    expect(clampTime(MASTER_DURATION_MS + 9)).toBe(MASTER_DURATION_MS);
  });

  it('maps master time to demo time and holds the ends', () => {
    expect(demoTimeAt(0)).toBe(0);
    expect(demoTimeAt(DEMO_START_MS)).toBe(0);
    expect(demoTimeAt(DEMO_START_MS + 4000)).toBe(4000);
    expect(demoTimeAt(MASTER_DURATION_MS)).toBe(DEMO_DURATION_MS);
  });

  it('opens on the mark alone and ends on the address card', () => {
    const first = frameAt(0);
    expect(first.wordmark).toBe(0);
    expect(first.brand).toBe(1);
    expect(first.platforms).toBe(0);
    expect(first.final).toBe(0);
    const last = frameAt(MASTER_DURATION_MS);
    expect(last.final).toBe(1);
    expect(last.address).toBe(1);
    expect(last.brand).toBe(0);
  });

  it('shows the wordmark before the tagline and the tagline before the demo', () => {
    expect(frameAt(1500).wordmark).toBe(1);
    expect(frameAt(1500).words).toBe(0);
    expect(frameAt(DEMO_START_MS - 100).words).toBe(1);
    expect(frameAt(DEMO_START_MS - 100).brand).toBe(1);
    expect(frameAt(DEMO_START_MS + 1000).brand).toBe(0);
  });

  it('keeps every value between 0 and 1 at any time', () => {
    for (let time = -500; time <= MASTER_DURATION_MS + 500; time += 97) {
      for (const value of Object.values(frameAt(time))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('writes the frame as css variables, the same ones for the server and the player', () => {
    const variables = frameVars(MASTER_DURATION_MS);
    expect(variables['--final']).toBe('1.000');
    expect(variables['--master']).toBe('1.00000');
    expect(Object.keys(frameVars(0))).toEqual(Object.keys(variables));
  });

  it('formats times and describes the position for the scrubber', () => {
    expect(formatTime(7000)).toBe('0:07');
    expect(formatTime(25_000)).toBe('0:25');
    expect(formatTime(99_000)).toBe(formatTime(MASTER_DURATION_MS));
    expect(describePosition(DEMO_START_MS + 1000)).toBe(
      `Demo, 0:06 of ${formatTime(MASTER_DURATION_MS)}`,
    );
    expect(percentOf(MASTER_DURATION_MS / 2)).toBe(50);
  });

  it('splits the tagline into words', () => {
    expect(splitWords('Record anything  on your screen')).toEqual([
      'Record',
      'anything',
      'on',
      'your',
      'screen',
    ]);
  });
});

describe('the hero video on the server', () => {
  const html = renderToStaticMarkup(<HeroDemo />);

  it('draws the logo card first, with the mark and the wordmark', () => {
    expect(html).toContain('data-stage="intro"');
    expect(html).toContain('data-card="brand"');
    expect(html).toContain('>Scrim<');
    expect(html).toContain(siteConfig.tagline.split(' ')[0]);
  });

  it('has the platform and address cards from the config', () => {
    expect(html).toContain(siteConfig.heroPlatformLine);
    expect(html).toContain(siteConfig.heroAddress);
  });

  it('has one play control and the auto zoom switch, and the timeline as the only other control', () => {
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('>Pause<');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Auto zoom"');
    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="Video timeline"');
  });

  it('has no caption, no extra label and nothing that is downloaded', () => {
    expect(html).not.toContain('Play demo');
    expect(html).not.toContain('Auto zoom is on');
    expect(html).not.toContain('Zoom, planned from your clicks');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<img');
  });

  it('shows every segment on the timeline', () => {
    for (const segment of SEGMENTS) {
      expect(html).toContain(`data-segment="${segment.id}"`);
    }
  });
});
