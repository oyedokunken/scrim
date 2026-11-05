import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroDemo } from '@/components/hero-demo/hero-demo';
import { textOf } from './support/html-text';
import {
  CARD_SCENES,
  DEMO_START_MS,
  MASTER_DURATION_MS,
  SEGMENTS,
  cardOpacity,
  clampTime,
  demoTimeAt,
  describePosition,
  formatTime,
  frameAt,
  frameVars,
  percentOf,
  sceneAt,
  sceneProgress,
  segmentAt,
  showLogo,
} from '@/lib/demo/master';
import { DEMO_DURATION_MS } from '@/lib/demo/script';
import { splitWords } from '@/lib/demo/words';
import { siteConfig } from '@/site.config';

describe('the master timeline', () => {
  it('has ten chapters that touch and cover the whole video', () => {
    expect(SEGMENTS.map((segment) => segment.id)).toEqual([
      'opening',
      'headline',
      'record',
      'recording',
      'stop',
      'edit',
      'export',
      'library',
      'platforms',
      'address',
    ]);
    expect(SEGMENTS[0]?.start).toBe(0);
    for (let index = 1; index < SEGMENTS.length; index += 1) {
      expect(SEGMENTS[index]?.start).toBe(SEGMENTS[index - 1]?.end);
    }
    expect(SEGMENTS[SEGMENTS.length - 1]?.end).toBe(MASTER_DURATION_MS);
  });

  it('runs about 40 to 50 seconds and gives every chapter a name', () => {
    expect(MASTER_DURATION_MS).toBeGreaterThanOrEqual(40_000);
    expect(MASTER_DURATION_MS).toBeLessThanOrEqual(50_000);
    for (const segment of SEGMENTS) {
      expect(segment.label).not.toBe('');
      expect(segment.end).toBeGreaterThan(segment.start);
    }
  });

  it('gives the live recording exactly the length of the scripted demo', () => {
    const recording = SEGMENTS.find((segment) => segment.id === 'recording');
    expect(recording?.start).toBe(DEMO_START_MS);
    expect((recording?.end ?? 0) - (recording?.start ?? 0)).toBe(DEMO_DURATION_MS);
  });

  it('finds the scene for a time and keeps times inside the video', () => {
    expect(segmentAt(0).id).toBe('opening');
    expect(segmentAt(DEMO_START_MS - 1).id).toBe('record');
    expect(segmentAt(DEMO_START_MS).id).toBe('recording');
    expect(segmentAt(DEMO_START_MS + DEMO_DURATION_MS).id).toBe('stop');
    expect(segmentAt(MASTER_DURATION_MS).id).toBe('address');
    expect(segmentAt(-50).id).toBe('opening');
    expect(clampTime(-1)).toBe(0);
    expect(clampTime(MASTER_DURATION_MS + 9)).toBe(MASTER_DURATION_MS);
  });

  it('shows the logo only on the first slide, at every sampled time', () => {
    const opening = SEGMENTS.find((segment) => segment.id === 'opening');
    expect(opening?.start).toBe(0);
    for (let time = -500; time <= MASTER_DURATION_MS + 500; time += 25) {
      const inOpening = time >= 0 && time < (opening?.end ?? 0);
      expect(showLogo(sceneAt(time)), `at ${String(time)} ms`).toBe(inOpening || time < 0);
    }
    expect(showLogo('opening')).toBe(true);
    for (const segment of SEGMENTS.slice(1)) {
      expect(showLogo(segment.id)).toBe(false);
    }
  });

  it('has faded the logo out before the first slide ends, and keeps it off the headline slide', () => {
    const opening = SEGMENTS.find((segment) => segment.id === 'opening');
    expect(frameAt((opening?.end ?? 0) - 1).logo).toBeLessThan(0.01);
    expect(frameAt(0).logo).toBe(1);
    expect(sceneAt(opening?.end ?? 0)).toBe('headline');
    expect(frameAt(opening?.end ?? 0).words).toBe(0);
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
    expect(first.address).toBe(0);
    expect(cardOpacity(0, 'address')).toBe(0);
    const last = frameAt(MASTER_DURATION_MS);
    expect(cardOpacity(MASTER_DURATION_MS, 'address')).toBe(1);
    expect(last.address).toBe(1);
    expect(last.brand).toBe(0);
  });

  it('plays the logo, then the headline, then hands over to the record screen', () => {
    const headline = SEGMENTS.find((segment) => segment.id === 'headline');
    const record = SEGMENTS.find((segment) => segment.id === 'record');
    expect(frameAt(1500).wordmark).toBe(1);
    expect(frameAt(1500).words).toBe(0);
    expect(frameAt((headline?.end ?? 0) - 100).words).toBe(1);
    expect(frameAt((record?.start ?? 0) + 10).brand).toBe(1);
    expect(frameAt((record?.start ?? 0) + 1000).brand).toBe(0);
  });

  it('fades each card in over the scene before it, and the record card out into the video', () => {
    for (const id of CARD_SCENES) {
      const segment = SEGMENTS.find((entry) => entry.id === id);
      expect(cardOpacity((segment?.start ?? 0) - 1, id)).toBe(0);
      expect(cardOpacity((segment?.start ?? 0) + 2000, id)).toBeGreaterThan(0.99);
    }
    const record = SEGMENTS.find((segment) => segment.id === 'record');
    expect(cardOpacity((record?.end ?? 0) - 1, 'record')).toBeLessThan(0.01);
    const stop = SEGMENTS.find((segment) => segment.id === 'stop');
    expect(cardOpacity((stop?.start ?? 0) + 1000, 'record')).toBe(0);
    expect(sceneProgress(stop?.start ?? 0, 'stop')).toBe(0);
    expect(sceneProgress(stop?.end ?? 0, 'stop')).toBe(1);
  });

  it('keeps every value between 0 and 1 at any time', () => {
    for (let time = -500; time <= MASTER_DURATION_MS + 500; time += 97) {
      for (const value of Object.values(frameAt(time))) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      for (const id of CARD_SCENES) {
        expect(cardOpacity(time, id)).toBeGreaterThanOrEqual(0);
        expect(cardOpacity(time, id)).toBeLessThanOrEqual(1);
        expect(sceneProgress(time, id)).toBeGreaterThanOrEqual(0);
        expect(sceneProgress(time, id)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('writes the frame as css variables, the same ones for the server and the player', () => {
    const variables = frameVars(MASTER_DURATION_MS);
    expect(variables['--on-address']).toBe('1.000');
    expect(variables['--p-address']).toBe('1.0000');
    expect(variables['--master']).toBe('1.00000');
    expect(Object.keys(frameVars(0))).toEqual(Object.keys(variables));
  });

  it('formats times and describes the position for the scrubber', () => {
    expect(formatTime(7000)).toBe('0:07');
    expect(formatTime(25_000)).toBe('0:25');
    expect(formatTime(99_000)).toBe(formatTime(MASTER_DURATION_MS));
    expect(describePosition(DEMO_START_MS + 1000)).toBe(
      `Recording, 0:${String(Math.floor((DEMO_START_MS + 1000) / 1000)).padStart(2, '0')} of ${formatTime(MASTER_DURATION_MS)}`,
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
    expect(html).toContain('data-scene="opening"');
    expect(html).toContain('data-testid="hero-logo"');
    expect(html).toContain('data-card="brand"');
    expect(html).toContain('>Scrim<');
    expect(html).toContain(siteConfig.tagline.split(' ')[0]);
  });

  it('sets the headline on two lines that read as one sentence', () => {
    const block = /<p class="[^"]*words[^"]*">(.*?)<\/p>/.exec(html)?.[1] ?? '';
    const lines = block
      .split(/<span class="[^"]*headlineLine[^"]*">/)
      .slice(1)
      .map((line) => textOf(line).replace(/\s+/g, ' ').trim());
    expect(lines).toEqual(['Record anything on your', 'screen effortlessly']);
    expect(siteConfig.tagline).toBe('Record anything on your screen effortlessly');
  });

  it('has the platform and address cards from the config', () => {
    expect(html).toContain(siteConfig.heroPlatformLine);
    expect(html).toContain(siteConfig.heroAddress);
  });

  it('has the play control, the sound toggle, the auto zoom switch and the timeline', () => {
    // The play control, the sound toggle and the auto zoom switch. There are no chapter buttons
    // and no chapter names while the video is being reworked.
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Sound"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('aria-label="Chapters"');
    for (const label of ['Logo', 'Headline', 'Recording', 'Platforms', 'Address']) {
      expect(html).not.toContain(`>${label}<`);
    }
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

  it('keeps the timeline plain: no segment blocks and no ruler', () => {
    expect(html).not.toContain('data-segment');
    expect(html).not.toMatch(/class="[^"]*(ruler|tick)/);
  });
});
