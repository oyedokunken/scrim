import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';

const html = renderToStaticMarkup(<App />);

describe('the home screen', () => {
  it('has the name as the heading', () => {
    expect(html).toMatch(/<h1[^>]*>.*Scrim<\/h1>/s);
  });

  it('puts the brand mark to the left of the name, inside the heading', () => {
    const heading = /<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? '';
    const markAt = heading.indexOf('<svg');
    const nameAt = heading.indexOf('Scrim');
    expect(markAt).toBe(0);
    expect(nameAt).toBeGreaterThan(markAt);
    expect(heading).toMatch(/<\/svg>Scrim$/);
  });

  it('hides the mark from assistive technology, because the name is text', () => {
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<svg[^>]*focusable="false"/);
  });

  it('draws the mark in the brand colors, one tile, one set of brackets, one dot', () => {
    expect(html).toContain('fill="#004E52"');
    expect(html).toContain('stroke="#FBF8F4"');
    expect(html.match(/<rect /g)).toHaveLength(1);
    expect(html.match(/<path /g)).toHaveLength(1);
    expect(html.match(/<circle /g)).toHaveLength(1);
  });

  it('sizes the mark to the text and uses no inline style, which the packaged policy blocks', () => {
    expect(html).toMatch(/<svg[^>]*width="1em"[^>]*height="1em"/);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it('shows the new line of text under the name, and nothing of the old one', () => {
    expect(html).toContain('<p>Record anything on your screen effortlessly</p>');
    expect(html).not.toContain('Nothing leaves your computer');
  });
});
