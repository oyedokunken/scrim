import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function value(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  const found = match?.[1];
  if (found === undefined) {
    throw new Error(`--${name} is not defined in tokens.css`);
  }
  return found.trim();
}

describe('type scale', () => {
  it.each([
    'scrim-text-display',
    'scrim-text-h2',
    'scrim-text-h3',
    'scrim-text-body-lg',
    'scrim-text-body',
    'scrim-text-small',
  ])('defines %s', (name) => {
    expect(value(name)).toMatch(/rem|clamp\(/);
  });

  it('uses fluid sizes for display and headings and fixed sizes for reading text', () => {
    for (const name of ['scrim-text-display', 'scrim-text-h2', 'scrim-text-h3']) {
      expect(value(name)).toMatch(/^clamp\(/);
    }
    expect(value('scrim-text-body')).toMatch(/^[\d.]+rem$/);
    expect(value('scrim-text-small')).toMatch(/^[\d.]+rem$/);
  });

  it('keeps running text under 70 characters a line', () => {
    const measure = /^(\d+)ch$/.exec(value('scrim-measure'));
    expect(Number(measure?.[1])).toBeLessThan(70);
  });

  it('sets display text tighter than body text', () => {
    expect(Number(value('scrim-leading-display'))).toBeLessThan(
      Number(value('scrim-leading-body')),
    );
    expect(Number(value('scrim-leading-heading'))).toBeLessThan(
      Number(value('scrim-leading-body')),
    );
  });
});
