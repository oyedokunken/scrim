import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Rail } from '../../src/renderer/src/shell/rail';
import { UpdateModal } from '../../src/renderer/src/updates/update-modal';
import { statusText, UpdatesCard } from '../../src/renderer/src/updates/updates-card';
import { hasUpdateToShow } from '../../src/renderer/src/updates/use-updates';
import type { UpdateSnapshot } from '../../src/shared/updates-contract';

const INFO = { version: '1.2.0', notes: 'Faster export\n- Fewer bugs', sizeBytes: 5_242_880 };
const snap = (state: UpdateSnapshot['state'], blocked: UpdateSnapshot['blocked'] = null) => ({
  state,
  blocked,
});
const noop = () => undefined;

const modal = (snapshot: UpdateSnapshot) =>
  renderToStaticMarkup(
    <UpdateModal open snapshot={snapshot} onClose={noop} onDownload={noop} onInstall={noop} />,
  );

describe('the rail pill', () => {
  it('shows on the Settings item only when an update is waiting', () => {
    const on = renderToStaticMarkup(
      <Rail view="record" onView={noop} updatePill onUpdatePill={noop} />,
    );
    expect(on).toContain('aria-label="New update available"');
    expect(on.match(/update-pill-rail/g)).toHaveLength(1);
    const off = renderToStaticMarkup(<Rail view="record" onView={noop} />);
    expect(off).not.toContain('New update available');
  });

  it('follows the update state', () => {
    expect(hasUpdateToShow(snap({ phase: 'idle' }))).toBe(false);
    expect(hasUpdateToShow(snap({ phase: 'none' }))).toBe(false);
    expect(hasUpdateToShow(snap({ phase: 'available', info: INFO }))).toBe(true);
    expect(hasUpdateToShow(snap({ phase: 'downloading', info: INFO, percent: 4 }))).toBe(true);
    expect(hasUpdateToShow(snap({ phase: 'ready', info: INFO }))).toBe(true);
  });
});

describe('the update window', () => {
  it('names the version, the size and the notes, with Update now and Later', () => {
    const html = modal(snap({ phase: 'available', info: INFO }));
    expect(html).toContain('New update available');
    expect(html).toContain('Version 1.2.0, about 5.0 MB');
    expect(html).toContain('Faster export');
    expect(html).toContain('Update now');
    expect(html).toContain('Later');
  });

  it('shows notes as text, never as markup', () => {
    const html = modal(
      snap({
        phase: 'available',
        info: { ...INFO, notes: '<img src=x onerror=alert(1)>' },
      }),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('shows a progress bar while downloading, and no second download button press', () => {
    const html = modal(snap({ phase: 'downloading', info: INFO, percent: 42 }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('width:42%');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Update now/);
  });

  it('asks for the restart once the file is downloaded', () => {
    const html = modal(snap({ phase: 'ready', info: INFO }));
    expect(html).toContain('Restart and install');
    expect(html).toContain('Restart to install it');
  });

  it('says what went wrong and offers Try again', () => {
    const html = modal(
      snap({
        phase: 'error',
        kind: 'checksum',
        message: 'The downloaded update did not match its checksum, so it was thrown away.',
        nextStep: 'Nothing was changed.',
        info: INFO,
      }),
    );
    expect(html).toContain('did not match its checksum');
    expect(html).toContain('Try again');
    expect(html).toContain('role="alert"');
  });

  it('holds back Update now while the app is busy, and says why', () => {
    const html = modal(snap({ phase: 'available', info: INFO }, 'recording'));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Update now/);
    expect(html).toContain('Updates wait until the recording is finished.');
  });
});

describe('the Updates card', () => {
  const card = (snapshot: UpdateSnapshot, autoCheck = false) =>
    renderToStaticMarkup(
      <UpdatesCard
        snapshot={snapshot}
        autoCheck={autoCheck}
        onAutoCheck={noop}
        onCheck={noop}
        onShowUpdate={noop}
      />,
    );

  it('has a Check for updates button and the startup switch, which starts off', () => {
    const html = card(snap({ phase: 'idle' }));
    expect(html).toContain('Check for updates');
    expect(html).toContain('Check for updates when the app starts');
    expect(html).toMatch(/aria-checked="false"/);
    expect(html).toContain('carries nothing about you or your');
  });

  it('shows the pill when an update exists', () => {
    expect(card(snap({ phase: 'available', info: INFO }))).toContain('New update available');
    expect(card(snap({ phase: 'none' }))).not.toContain('New update available');
  });

  it('disables the button while checking, while busy and where updates are unsupported', () => {
    const disabled = (html: string) =>
      /<button[^>]*disabled[^>]*>(Check for updates|Checking)/.test(html);
    expect(disabled(card(snap({ phase: 'checking' })))).toBe(true);
    expect(disabled(card(snap({ phase: 'idle' }, 'exporting')))).toBe(true);
    expect(disabled(card(snap({ phase: 'unsupported', message: 'Not here.' })))).toBe(true);
    expect(disabled(card(snap({ phase: 'idle' })))).toBe(false);
  });

  it('describes each state in one plain sentence', () => {
    expect(statusText(snap({ phase: 'none' }))).toBe('You have the latest version.');
    expect(statusText(snap({ phase: 'idle' }))).toBe('');
    expect(statusText(snap({ phase: 'downloading', info: INFO, percent: 7 }))).toContain('7%');
  });
});
