import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CursorPanel } from '../../src/renderer/src/panels/cursor-panel';
import { ZoomPanel } from '../../src/renderer/src/panels/zoom-panel';
import { PlatformNote, setPlatformInfoForTests } from '../../src/renderer/src/platform';
import { ScreenshotResult } from '../../src/renderer/src/screenshot/screenshot-result';
import type { PlatformInfo } from '../../src/shared/platform-info';
import { ErrorProvider, ToastProvider } from '../../src/renderer/ui';

const linux = (session: PlatformInfo['session']): PlatformInfo => ({
  os: 'linux',
  session,
  fileManager: 'Files',
  shareSheet: false,
  cursorEffects: session !== 'wayland',
  cursorEffectsNote:
    session === 'wayland'
      ? 'On Wayland, Linux does not let apps follow the mouse, so auto zoom and cursor effects are off. Log in with an X11 session to use them.'
      : null,
  shortcutsNote: null,
});
const wayland = linux('wayland');
const x11 = linux('x11');
const unknown = linux('unknown');
const windows: PlatformInfo = {
  os: 'windows',
  session: null,
  fileManager: 'Explorer',
  shareSheet: true,
  cursorEffects: true,
  cursorEffectsNote: null,
  shortcutsNote: null,
};

const NOTE =
  'On Wayland, Linux does not let apps follow the mouse, so auto zoom and cursor effects are off. Log in with an X11 session to use them.';

const cursor = { style: 'halo-ripples', haloColor: 'brand' } as const;
const zoom = { on: true, level: 1.8, holdMs: 1200, smoothness: 0.6 };

describe('the platform note', () => {
  it('shows the text in a calm note', () => {
    const html = renderToStaticMarkup(<PlatformNote text="Plain words." />);
    expect(html).toContain('role="note"');
    expect(html).toContain('Plain words.');
  });

  it('renders nothing without text', () => {
    expect(renderToStaticMarkup(<PlatformNote text={null} />)).toBe('');
  });
});

describe('the cursor and zoom notes by session', () => {
  afterEach(() => {
    setPlatformInfoForTests(undefined);
  });

  it('says why cursor effects are off on Wayland, on the Cursor and Zoom pages', () => {
    setPlatformInfoForTests(wayland);
    expect(renderToStaticMarkup(<CursorPanel value={cursor} onChange={vi.fn()} />)).toContain(NOTE);
    expect(renderToStaticMarkup(<ZoomPanel value={zoom} onChange={vi.fn()} />)).toContain(NOTE);
  });

  it.each([
    ['x11', x11],
    ['unknown', unknown],
    ['windows', windows],
  ])('shows no note on %s', (_name, info) => {
    setPlatformInfoForTests(info);
    expect(renderToStaticMarkup(<CursorPanel value={cursor} onChange={vi.fn()} />)).not.toContain(
      'platform-note',
    );
    expect(renderToStaticMarkup(<ZoomPanel value={zoom} onChange={vi.fn()} />)).not.toContain(
      'platform-note',
    );
  });
});

describe('the Share button', () => {
  afterEach(() => {
    setPlatformInfoForTests(undefined);
  });
  const result = (
    <ToastProvider>
      <ErrorProvider>
        <ScreenshotResult
          path="/home/me/Pictures/Scrim/a.png"
          width={10}
          height={10}
          onEdit={vi.fn()}
          onDone={vi.fn()}
        />
      </ErrorProvider>
    </ToastProvider>
  );

  it('is hidden on Linux, where there is no share sheet, and Copy and Show in folder remain', () => {
    setPlatformInfoForTests(x11);
    const html = renderToStaticMarkup(result);
    expect(html).not.toContain('lucide-share');
    expect(html).toContain('Show in folder');
  });

  it('is still there on Windows', () => {
    setPlatformInfoForTests(windows);
    expect(renderToStaticMarkup(result)).toContain('lucide-share');
  });
});
