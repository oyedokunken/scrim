import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { fileName, formatWhen } from '../../src/renderer/src/format';
import { ScreenshotPanel } from '../../src/renderer/src/screenshot/screenshot-panel';
import type { ShotEntry } from '../../src/shared/image-contract';

const NOW = new Date(2026, 9, 28, 15, 0).getTime();
const shot = (name: string, modifiedMs: number): ShotEntry => ({
  path: `C:\\Pictures\\Scrim\\${name}`,
  name,
  modifiedMs,
  bytes: 10,
  width: 800,
  height: 600,
});

describe('formatWhen', () => {
  it('says today, yesterday or the date', () => {
    expect(formatWhen(new Date(2026, 9, 28, 9, 5).getTime(), NOW)).toBe('Today 09:05');
    expect(formatWhen(new Date(2026, 9, 27, 23, 59).getTime(), NOW)).toBe('Yesterday 23:59');
    expect(formatWhen(new Date(2026, 9, 12, 10, 0).getTime(), NOW)).toBe('12 Oct 2026');
  });
});

describe('fileName', () => {
  it('drops the folder, and the extension when asked', () => {
    expect(fileName('C:\\a\\b\\shot one.png')).toBe('shot one.png');
    expect(fileName('/a/b/shot one.png', true)).toBe('shot one');
    expect(fileName('plain')).toBe('plain');
  });
});

describe('the screenshots panel', () => {
  const list = [shot('b.png', NOW - 1000), shot('a.png', NOW - 86_400_000)];
  const html = (shots: ShotEntry[] | null, openPath: string | null = null) =>
    renderToStaticMarkup(
      <ScreenshotPanel shots={shots} openPath={openPath} onOpen={vi.fn()} now={NOW} />,
    );

  it('is titled Screenshots with the total count', () => {
    const out = html(list);
    expect(out).toContain('Screenshots');
    expect(out).toMatch(/shot-panel-count">2</);
  });

  it('lists every screenshot, with its name and time, in the order given', () => {
    const out = html(list);
    expect(out.indexOf('b.png')).toBeLessThan(out.indexOf('a.png'));
    expect(out).toContain('Today 14:59');
    expect(out).toContain('Yesterday 15:00');
    expect(out.match(/<button[^>]*class="shot-item/g)).toHaveLength(2);
  });

  it('marks the open one', () => {
    const out = html(list, list[1]?.path ?? null);
    expect(out.match(/<button[^>]*aria-current="true"/g)).toHaveLength(1);
    expect(out).toContain('shot-item selected');
  });

  it('says nothing is there yet only when the list is really empty', () => {
    expect(html([])).toContain('Screenshots you take will show up here.');
    expect(html([])).toMatch(/shot-panel-count">0</);
    expect(html(list)).not.toContain('will show up here');
  });

  it('shows a loading state with no count before the first listing', () => {
    const out = html(null);
    expect(out).toContain('Loading');
    expect(out).not.toContain('shot-panel-count');
  });
});
