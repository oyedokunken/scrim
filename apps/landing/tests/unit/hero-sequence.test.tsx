import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeroShow } from '@/components/hero-demo/hero-show';
import { STAGES, STAGE_MS, splitWords, stageAfterDemo, stageAfterTimer } from '@/lib/demo/sequence';
import { siteConfig } from '@/site.config';

describe('the hero sequence', () => {
  it('runs mark, words, demo, platforms, address in that order', () => {
    expect(STAGES).toEqual(['intro', 'words', 'demo', 'platforms', 'address']);
    expect(stageAfterTimer('intro')).toBe('words');
    expect(stageAfterTimer('words')).toBe('demo');
    expect(stageAfterTimer('platforms')).toBe('address');
  });

  it('leaves the demo and the final card to other triggers', () => {
    expect(stageAfterTimer('demo')).toBeNull();
    expect(stageAfterTimer('address')).toBeNull();
    expect(stageAfterDemo('demo')).toBe('platforms');
    expect(stageAfterDemo('address')).toBe('address');
    expect(stageAfterDemo('intro')).toBe('intro');
  });

  it('gives every timed card a positive duration', () => {
    for (const ms of Object.values(STAGE_MS)) {
      expect(ms).toBeGreaterThan(0);
    }
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

  it('renders the cards on the server with the address and the platform line from the config', () => {
    const html = renderToStaticMarkup(<HeroShow />);
    expect(html).toContain('data-stage="intro"');
    expect(html).toContain(siteConfig.heroAddress);
    expect(html).toContain('Available for all platforms');
    expect(html).toContain('Replay');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<video');
  });

  it('keeps the address on a single config constant', () => {
    expect(siteConfig.heroAddress).toBe('scrim.app');
    expect(siteConfig.heroPlatformLine).toBe('Available for all platforms');
  });
});
