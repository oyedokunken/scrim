import { readFileSync } from 'node:fs';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AppWindowIllustration,
  BackdropSwatchesIllustration,
  BeforeAfterIllustration,
  ClickRipplesIllustration,
  CursorHaloIllustration,
  ExportCardIllustration,
  FaceBubbleIllustration,
  ShortcutsIllustration,
  TrimTimelineIllustration,
  ZoomFrameIllustration,
  type IllustrationProps,
} from '@/components/illustrations';

const all: [string, ComponentType<IllustrationProps>][] = [
  ['AppWindow', AppWindowIllustration],
  ['BackdropSwatches', BackdropSwatchesIllustration],
  ['BeforeAfter', BeforeAfterIllustration],
  ['ClickRipples', ClickRipplesIllustration],
  ['CursorHalo', CursorHaloIllustration],
  ['ExportCard', ExportCardIllustration],
  ['FaceBubble', FaceBubbleIllustration],
  ['Shortcuts', ShortcutsIllustration],
  ['TrimTimeline', TrimTimelineIllustration],
  ['ZoomFrame', ZoomFrameIllustration],
];

const tokensCss = readFileSync(
  new URL('../../../../packages/tokens/src/tokens.css', import.meta.url),
  'utf8',
);
// The palette and spacing tokens, plus the font stack that the text in two illustrations uses.
const definedVariables = new Set([
  ...[...tokensCss.matchAll(/(--scrim-[a-z0-9-]+):/g)].map((match) => match[1]),
  '--font-sans',
]);

describe.each(all)('%s illustration', (_name, Component) => {
  it('is decorative by default', () => {
    const html = renderToStaticMarkup(<Component />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('<title');
  });

  it('exposes a name and description when given them', () => {
    const html = renderToStaticMarkup(<Component title="A title" description="A description" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('<title');
    expect(html).toContain('A title');
    expect(html).toContain('A description');
    expect(html).toMatch(/aria-labelledby="[^"]+ [^"]+"/);
    expect(html).not.toContain('aria-hidden');
  });

  it('uses a name only, with no description, when none is given', () => {
    const html = renderToStaticMarkup(<Component title="Only a title" />);
    expect(html).toMatch(/aria-labelledby="[^" ]+"/);
    expect(html).not.toContain('<desc');
  });

  it('draws with palette variables only and no raw colors', () => {
    const html = renderToStaticMarkup(<Component />);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\b(?:rgb|hsl)a?\(/);
    const used = [...html.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) {
      expect(definedVariables).toContain(name);
    }
  });

  it('keeps a fixed 320 by 200 canvas so it never shifts the layout', () => {
    const html = renderToStaticMarkup(<Component />);
    expect(html).toContain('viewBox="0 0 320 200"');
    expect(html).toContain('width="320"');
    expect(html).toContain('height="200"');
  });
});
