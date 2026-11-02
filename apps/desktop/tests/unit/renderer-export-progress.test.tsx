import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExportDoneDialog, savedWhere } from '../../src/renderer/src/review/export-done-dialog';
import { ExportProgress, toPercent } from '../../src/renderer/src/review/export-progress';

describe('export progress bar', () => {
  it('rounds and clamps the fraction', () => {
    expect(toPercent(0.426)).toBe(43);
    expect(toPercent(0)).toBe(0);
    expect(toPercent(1)).toBe(100);
    expect(toPercent(1.7)).toBe(100);
    expect(toPercent(-0.2)).toBe(0);
    expect(toPercent(Number.NaN)).toBe(0);
    expect(toPercent(null)).toBe(0);
  });

  it('is a progressbar with a name, aria values and the percentage inside', () => {
    const html = renderToStaticMarkup(<ExportProgress fraction={0.426} label="Exporting" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Exporting"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="43"');
    expect(html.match(/43%/g)).toHaveLength(2);
    expect(html).not.toContain('<progress');
  });

  it('shows 0 percent without a value while the progress is unknown', () => {
    const html = renderToStaticMarkup(<ExportProgress fraction={null} label="Exporting" />);
    expect(html).toContain('waiting');
    expect(html).not.toContain('aria-valuenow');
    expect(html).toContain('0%');
  });
});

describe('export done dialog', () => {
  const done = {
    jobId: 'j1',
    fileName: 'My very long recording name 2026-10-31.mp4',
    bytes: 5 * 1024 * 1024,
    durationMs: 65_000,
    fellBack: false,
  };

  it('stays closed without a finished export', () => {
    expect(renderToStaticMarkup(<ExportDoneDialog done={null} folder="C:/x" onDone={noop} />)).toBe(
      '',
    );
  });

  it('shows the file, its size and length, and the actions', () => {
    const html = renderToStaticMarkup(<ExportDoneDialog done={done} folder="C:/x" onDone={noop} />);
    expect(html).toContain('Your video is ready');
    expect(html).toContain(done.fileName);
    expect(html).toContain('5.0 MB');
    expect(html).toContain('01:05');
    for (const label of ['Show in folder', 'Open', 'Share', 'Done']) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).not.toContain("Scrim's own folder");
  });

  it('says so when the file fell back to the app folder', () => {
    const html = renderToStaticMarkup(
      <ExportDoneDialog done={{ ...done, fellBack: true }} folder="C:/x" onDone={noop} />,
    );
    expect(html).toContain('own folder');
    expect(savedWhere(true, 'D:/v')).toContain("Scrim's own folder");
    expect(savedWhere(false, 'D:/v')).toBe('D:/v');
    expect(savedWhere(false, null)).toBe('The folder you chose');
  });
});

function noop(): void {
  return undefined;
}
