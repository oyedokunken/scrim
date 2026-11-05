import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UpdateModal } from '../../src/renderer/src/updates/update-modal';
import { statusText } from '../../src/renderer/src/updates/updates-card';
import { hasUpdateToShow } from '../../src/renderer/src/updates/use-updates';
import type { UpdateSnapshot } from '../../src/shared/updates-contract';

const INFO = { version: '1.3.0', notes: 'Notes', sizeBytes: null };
const manual: UpdateSnapshot = { state: { phase: 'manual', info: INFO }, blocked: null };
const noop = () => undefined;

describe('the page for a deb install', () => {
  it('shows the pill and the sentence', () => {
    expect(hasUpdateToShow(manual)).toBe(true);
    expect(statusText(manual)).toBe('A new version of Scrim is out: 1.3.0.');
  });

  it('offers the release page and no download button', () => {
    const html = renderToStaticMarkup(
      <UpdateModal open snapshot={manual} onClose={noop} onDownload={noop} onInstall={noop} />,
    );
    expect(html).toContain('A new version of Scrim is out.');
    expect(html).toContain('Open the release page');
    expect(html).not.toContain('Update now');
    expect(html).not.toContain('Restart and install');
  });
});
