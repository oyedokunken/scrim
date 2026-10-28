import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = join(__dirname, '../../src/renderer');

/** Every `<button ...>` opening tag in a page, as text. */
function buttons(file: string): string[] {
  const html = readFileSync(join(RENDERER, file), 'utf8');
  return html.match(/<button\b[^>]*>/gs) ?? [];
}

describe('tooltips on the recording pill and the area overlay', () => {
  for (const file of ['pill.html', 'region.html']) {
    it(`gives every button in ${file} a title, except the plain text ones in the discard question`, () => {
      const missing = buttons(file).filter(
        (tag) => !/\btitle="[^"]+"/.test(tag) && !/\bclass="btn text/.test(tag),
      );
      expect(missing).toEqual([]);
    });
  }

  it('keeps the pill free of inline styles, which the page policy forbids', () => {
    const html = readFileSync(join(RENDERER, 'pill.html'), 'utf8');
    expect(html).not.toMatch(/\sstyle=/);
  });
});
