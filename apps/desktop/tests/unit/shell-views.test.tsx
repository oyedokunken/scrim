import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/src/shell/app-shell';
import { Header } from '../../src/renderer/src/shell/header';
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

  it('gives library and settings the full width, and every other view a panel', () => {
    expect(hasPanel('library')).toBe(false);
    expect(hasPanel('settings')).toBe(false);
    for (const id of VIEW_IDS.filter((v) => v !== 'library' && v !== 'settings')) {
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

  it('puts a divider before the library', () => {
    expect(html).toContain('rail-group after-divider');
    expect(html.match(/after-divider/g)).toHaveLength(1);
  });
});

describe('the header', () => {
  const html = renderToStaticMarkup(
    <Header title="Record" primary={<button type="button">Go</button>} onHelp={noop} />,
  );

  it('shows the mark, the name and the view title', () => {
    expect(html).toContain('Scrim');
    expect(html).toContain('<h1 class="app-header-title">Record</h1>');
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
    expect(html).toContain('Nothing leaves this PC');
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
  it('says Get started on the first launch and Continue after', () => {
    expect(renderToStaticMarkup(<Welcome firstRun onContinue={noop} />)).toContain('>Get started<');
    const again = renderToStaticMarkup(<Welcome firstRun={false} onContinue={noop} />);
    expect(again).toContain('>Continue<');
    expect(again).not.toContain('Get started');
  });

  it('shows the name, the line, and the privacy promise, and nothing else to press', () => {
    const html = renderToStaticMarkup(<Welcome firstRun onContinue={noop} />);
    expect(html).toContain('Scrim');
    expect(html).toContain('Record anything on your screen effortlessly');
    expect(html).toContain('Nothing leaves your computer.');
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});

describe('the Record view', () => {
  const view = (busy = false, error: { message: string; nextStep: string } | null = null) =>
    renderToStaticMarkup(<RecordView busy={busy} error={error} onStart={noop} />);

  it('has the stage, the big button with the red dot, and the shortcut', () => {
    const html = view();
    expect(html).toContain('class="stage"');
    expect(html).toMatch(
      /record-button[^>]*><span class="record-dot" aria-hidden="true"><\/span>Start recording/,
    );
    expect(html).toContain('aria-label="Ctrl Shift R"');
  });

  it('says there are no recordings yet instead of showing an empty box', () => {
    expect(view()).toContain('No recordings yet');
  });

  it('cannot be started twice', () => {
    const html = view(true);
    expect(html).toMatch(/disabled=""[^>]*><span class="record-dot"/);
    expect(html).toContain('Starting...');
  });

  it('shows what went wrong, as an alert', () => {
    const html = view(false, { message: 'The disk is full.', nextStep: 'Free some space.' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Free some space.');
  });
});

describe('the Record panel', () => {
  const panel = (overrides = {}) =>
    renderToStaticMarkup(
      <RecordPanel
        settings={{ ...DEFAULT_SETTINGS, ...overrides }}
        cameras={[{ deviceId: 'c1', label: 'Front camera' }]}
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
