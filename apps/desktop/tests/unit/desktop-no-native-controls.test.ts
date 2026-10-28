import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../src/renderer');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx|ts)$/.test(name) ? [path] : [];
  });
}

const files = sources(ROOT).map((path) => ({
  name: relative(ROOT, path).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('the main window uses no native controls', () => {
  it.each([
    ['a native select or option', /<select\b|<option\b|<datalist\b/],
    [
      'a native checkbox, radio, range, color, file or date input',
      /type=["'](checkbox|radio|range|color|file|date|time)["']/,
    ],
    ['a browser dialog function', /\b(window\.)?(confirm|alert|prompt)\(/],
    ['a native details disclosure', /<details\b/],
  ])('has no %s', (_label, pattern) => {
    const hits = files.filter((file) => pattern.test(file.text)).map((file) => file.name);
    expect(hits).toEqual([]);
  });

  it('creates a dialog only in the shared Dialog, so every modal has a title and a close button', () => {
    const hits = files.filter((file) => /<dialog\b/.test(file.text)).map((file) => file.name);
    expect(hits).toEqual(['ui/dialog.tsx']);
    const dialog = files.find((file) => file.name === 'ui/dialog.tsx')?.text ?? '';
    expect(dialog).toContain('aria-label="Close"');
    expect(dialog).toContain('showModal()');
  });

  it('wraps every icon only button in a tooltip', () => {
    const missing = files
      .filter((file) => file.text.includes('icon-button') && /<button\b/.test(file.text))
      // The toast close button sits inside a toast, which already says what it is.
      .filter((file) => file.name !== 'ui/toast.tsx')
      .filter((file) => !file.text.includes('<Tooltip'))
      .map((file) => file.name);
    expect(missing).toEqual([]);
  });

  it('asks before it deletes, discards or overwrites', () => {
    const result = files.find((file) => file.name.endsWith('screenshot-result.tsx'))?.text ?? '';
    const editor = files.find((file) => file.name.endsWith('screenshot-editor.tsx'))?.text ?? '';
    expect(result.indexOf('<ConfirmDialog')).toBeGreaterThan(-1);
    expect(editor).toContain('<ConfirmDialog');
    // The delete call is only reached from the confirm handler.
    expect(result.match(/image:delete/g)).toHaveLength(1);
    expect(result).toMatch(/onConfirm=\{remove\}/);
  });
});
