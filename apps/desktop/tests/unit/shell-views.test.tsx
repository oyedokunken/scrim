import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/src/shell/app-shell';
import { Header } from '../../src/renderer/src/shell/header';
import { ScreenshotView } from '../../src/renderer/src/shell/screenshot-view';
import { Placeholder } from '../../src/renderer/src/shell/placeholder';
import { Rail } from '../../src/renderer/src/shell/rail';
import { RecordPanel } from '../../src/renderer/src/shell/record-panel';
import { RecordView } from '../../src/renderer/src/shell/record-view';
import { SHORTCUTS } from '../../src/renderer/src/shell/shortcuts';
import { StatusBar } from '../../src/renderer/src/shell/status-bar';
import {
  VIEW_IDS,
  VIEW_LABELS,
  hasPanel,
  isSettingsPanel,
  isViewId,
  showsSavedCard,
} from '../../src/renderer/src/shell/views';
import { Welcome } from '../../src/renderer/src/shell/welcome';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

const noop = vi.fn();

describe('views', () => {
  it('lists the rail in the designed order', () => {
    expect(VIEW_IDS).toEqual([
      'record',
      'screenshot',
      'cursor',
      'zoom',
      'camera',
      'audio',
      'background',
      'library',
      'settings',
    ]);
  });

  it('labels every view', () => {
    for (const id of VIEW_IDS) expect(VIEW_LABELS[id].length).toBeGreaterThan(0);
  });

  it('gives library, settings and screenshot the full width, and every other view a panel', () => {
    expect(hasPanel('library')).toBe(false);
    expect(hasPanel('settings')).toBe(false);
    expect(hasPanel('screenshot')).toBe(false);
    for (const id of VIEW_IDS.filter(
      (v) => v !== 'library' && v !== 'settings' && v !== 'screenshot',
    )) {
      expect(hasPanel(id)).toBe(true);
    }
  });

  it('knows which views are settings panels', () => {
    expect(VIEW_IDS.filter(isSettingsPanel)).toEqual([
      'cursor',
      'zoom',
      'camera',
      'audio',
      'background',
    ]);
  });

  it('shows the saved recording card on the Record view and nowhere else', () => {
    expect(VIEW_IDS.filter(showsSavedCard)).toEqual(['record']);
  });

  it('recognises a view id', () => {
    expect(isViewId('zoom')).toBe(true);
    expect(isViewId('home')).toBe(false);
  });
});

describe('the icon rail', () => {
  const html = renderToStaticMarkup(<Rail view="zoom" onView={noop} />);

  it('is a named navigation with one item per view', () => {
    expect(html).toContain('<nav class="rail" aria-label="Sections">');
    expect(html.match(/class="rail-item/g)).toHaveLength(9);
  });

  it('marks the open view, and only that one is in the tab order', () => {
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/rail-item selected" aria-current="page"[^>]*><svg[^>]*>.*?Zoom/s);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(8);
  });

  it('hides its icons from assistive technology, because each has a label', () => {
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(9);
  });

  it('pins the library and settings below a divider, apart from the scrolling group', () => {
    expect(html).toContain('rail-top');
    expect(html.match(/class="rail-bottom"/g)).toHaveLength(1);
    expect(html.indexOf('rail-bottom')).toBeGreaterThan(html.indexOf('Background'));
    expect(html.slice(html.indexOf('rail-bottom'))).toContain('Library');
    expect(html.slice(html.indexOf('rail-bottom'))).toContain('Settings');
  });
});

describe('the header', () => {
  const html = renderToStaticMarkup(
    <Header primary={<button type="button">Go</button>} onHelp={noop} />,
  );

  it('shows the mark and the name, and no view title', () => {
    expect(html).toContain('Scrim');
    expect(html).not.toContain('<h1');
    expect(html).not.toContain('app-header-title');
    expect(html).toContain('brand-mark');
  });

  it('shows the primary action and a labelled help button', () => {
    expect(html).toContain('>Go<');
    expect(html).toContain('aria-label="Keyboard shortcuts"');
  });
});

describe('the status bar', () => {
  it('shows the state, the folder and both shortcuts', () => {
    const html = renderToStaticMarkup(<StatusBar state="Recording 00:42" folder="Videos\Scrim" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Recording 00:42');
    expect(html).toContain('Saved in Videos\\Scrim');
    expect(html).not.toContain('Nothing leaves');
    expect(html).toContain('aria-label="Ctrl Shift R"');
    expect(html).toContain('aria-label="Ctrl Shift S"');
  });
});

describe('the shell', () => {
  const shell = (view: 'record' | 'library') =>
    renderToStaticMarkup(
      <AppShell
        view={view}
        onView={noop}
        title={VIEW_LABELS[view]}
        status={{ state: 'Ready', folder: 'Videos\\Scrim' }}
        panel={<p>panel content</p>}
      >
        <p>main content</p>
      </AppShell>,
    );

  it('has one main landmark, the rail, the panel and the status bar', () => {
    const html = shell('record');
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('<nav class="rail"');
    expect(html).toContain('<aside class="shell-panel" aria-label="Record settings">');
    expect(html).toContain('panel content');
    expect(html).toContain('<footer class="status-bar">');
  });

  it('drops the panel on views that use the whole width', () => {
    const html = shell('library');
    expect(html).toContain('shell no-panel');
    expect(html).not.toContain('shell-panel');
    expect(html).not.toContain('panel content');
  });

  it('lists the three shortcuts in the help sheet', () => {
    const html = shell('record');
    for (const shortcut of Object.values(SHORTCUTS)) expect(html).toContain(shortcut.label);
  });
});

describe('the welcome screen', () => {
  const welcome = (firstRun: boolean, version: string | null = '1.0.0') =>
    renderToStaticMarkup(
      <Welcome firstRun={firstRun} version={version} onContinue={noop} onOpenLink={noop} />,
    );

  it('says Get started on the first launch and Continue after', () => {
    expect(welcome(true)).toContain('>Get started<');
    expect(welcome(false)).toContain('>Continue<');
    expect(welcome(false)).not.toContain('Get started');
  });

  it('shows the mark, the name, the version pill and the line', () => {
    const html = welcome(true);
    expect(html).toContain('Scrim');
    expect(html).toContain('<span class="version-pill">v1.0.0</span>');
    expect(html).toContain('Record anything on your screen effortlessly');
  });

  it('keeps the pill in place and empty until the version arrives', () => {
    expect(welcome(true, null)).toContain('<span class="version-pill"></span>');
  });

  it('credits the owner with a handle that opens a closed card, and has no privacy line', () => {
    const html = welcome(true);
    expect(html).toContain('Built by');
    expect(html).toMatch(
      /<button[^>]*class="built-by-handle"[^>]*aria-expanded="false"[^>]*>@oyedokunken<\/button>/,
    );
    // The card is in the page but hidden until the handle is hovered, clicked or focused.
    expect(html).toMatch(/class="built-by-panel"[^>]*hidden/);
    expect(html).not.toContain('Nothing leaves your computer');
  });

  it('offers the website, GitHub and LinkedIn in the card, each with a tooltip name', () => {
    const html = welcome(true);
    for (const [name, href] of [
      ['Website', 'https://www.oyedokun.dev/'],
      ['GitHub', 'https://github.com/oyedokunken'],
      ['LinkedIn', 'https://www.linkedin.com/in/oyedokunken'],
    ] as const) {
      expect(html).toContain(`href="${href}"`);
      expect(html).toContain(`aria-label="${name} (opens in your browser)"`);
      expect(html).toContain(
        `class="built-by-tip" data-visible="false" aria-hidden="true">${name}`,
      );
    }
    expect(html.match(/class="built-by-link"/g)).toHaveLength(3);
  });

  it('has the main button and the handle as its only buttons', () => {
    expect(welcome(true).match(/<button/g)).toHaveLength(2);
  });
});

describe('the Record view', () => {
  const view = (busy = false) => renderToStaticMarkup(<RecordView busy={busy} onStart={noop} />);

  it('has the stage holding the big button with the red dot and the shortcut in its corner', () => {
    const html = view();
    expect(html).toContain('class="stage"');
    expect(html).toMatch(/stage-shortcut"><span>Shortcut<\/span>.*Ctrl Shift R/s);
    expect(html.indexOf('record-button')).toBeGreaterThan(html.indexOf('class="stage"'));
    expect(html.indexOf('record-button')).toBeLessThan(html.indexOf('</section>'));
    expect(html.match(/ui-keycaps/g)).toHaveLength(1);
    expect(html).toMatch(
      /record-button[^>]*><span class="record-dot" aria-hidden="true"><\/span>Start recording/,
    );
    expect(html).toContain('aria-label="Ctrl Shift R"');
  });

  it('has no list of recent recordings: Library holds the history', () => {
    expect(view()).not.toContain('Recent recordings');
  });

  it('cannot be started twice', () => {
    const html = view(true);
    expect(html).toMatch(/disabled=""[^>]*><span class="record-dot"/);
    expect(html).toContain('Starting...');
  });
});

describe('the Record panel', () => {
  const panel = (overrides = {}) =>
    renderToStaticMarkup(
      <RecordPanel
        settings={{ ...DEFAULT_SETTINGS, ...overrides }}
        cameras={[
          { deviceId: 'c1', label: 'Front camera', isDefault: true },
          { deviceId: 'c2', label: 'Desk camera', isDefault: false },
        ]}
        mics={[]}
        onChange={noop}
        onChooseFolder={noop}
      />,
    );

  it('has camera, microphone and the save folder, and nothing about cursor or zoom', () => {
    const html = panel();
    expect(html).toContain('>Camera<');
    expect(html).toContain('>Microphone<');
    expect(html).toContain('>Save to<');
    expect(html).toContain('Videos\\Scrim');
    expect(html).not.toContain('Zoom');
    expect(html).not.toContain('Cursor');
  });

  it('lists the cameras, and turns the list off while the camera is off', () => {
    const html = panel();
    expect(html).toContain('Front camera');
    expect(html).toMatch(/id="camera-device"[^>]*disabled=""/);
    expect(panel({ cameraOn: true })).not.toMatch(/id="camera-device"[^>]*disabled=""/);
  });

  it('uses the custom select, never a native one, and tags the system default', () => {
    const html = panel();
    expect(html).not.toContain('<select');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('ui-select-tag">Default<');
  });

  it('says so when there is no microphone', () => {
    expect(panel()).toContain('No microphone found');
  });

  it('labels every list so a screen reader can name it', () => {
    expect(panel()).toContain('for="camera-device"');
  });

  it('shows a chosen folder', () => {
    expect(panel({ destinationFolder: 'D:\\Takes' })).toContain('D:\\Takes');
  });
});

describe('the placeholder', () => {
  it('gives each unbuilt view a plain sentence', () => {
    expect(renderToStaticMarkup(<Placeholder view="library" />)).toContain('No recordings yet');
    expect(renderToStaticMarkup(<Placeholder view="zoom" inPanel />)).toContain(
      'These settings arrive with the editor.',
    );
  });
});

describe('the Screenshot view', () => {
  const html = renderToStaticMarkup(<ScreenshotView busy={false} onTake={noop} />);

  it('uses the same stage with the button inside and Ctrl Shift X in the corner', () => {
    expect(html).toContain('class="stage"');
    expect(html).toContain('Take screenshot');
    expect(html).toContain('aria-label="Ctrl Shift X"');
    expect(html.indexOf('record-button')).toBeLessThan(html.indexOf('</section>'));
  });
});

describe('the app shell title', () => {
  it('puts the view title in the main area once, not in the header', () => {
    const html = renderToStaticMarkup(
      <AppShell
        view="screenshot"
        onView={noop}
        title="Screenshot"
        status={{ state: 'Ready', folder: 'x' }}
        panel={null}
      >
        <p>body</p>
      </AppShell>,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<main class="shell-main"><h1 class="page-title">Screenshot<\/h1>/);
  });
});
