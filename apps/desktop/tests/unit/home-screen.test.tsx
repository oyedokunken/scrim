import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeView, type HomeViewProps } from '../../src/renderer/src/components/home-view';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';

function render(overrides: Partial<HomeViewProps> = {}): string {
  return renderToStaticMarkup(
    <HomeView
      settings={DEFAULT_SETTINGS}
      cameras={[
        { deviceId: 'cam-1', label: 'Front camera' },
        { deviceId: 'cam-2', label: 'Desk camera' },
      ]}
      mics={[{ deviceId: 'mic-1', label: 'Headset microphone' }]}
      busy={false}
      error={null}
      onChange={vi.fn()}
      onChooseFolder={vi.fn()}
      onStart={vi.fn()}
      {...overrides}
    />,
  );
}

const html = render();

describe('the home screen header', () => {
  it('has the name as the heading', () => {
    expect(html).toMatch(/<h1[^>]*>.*Scrim<\/h1>/s);
  });

  it('puts the brand mark to the left of the name, inside the heading', () => {
    const heading = /<h1[^>]*>(.*?)<\/h1>/s.exec(html)?.[1] ?? '';
    expect(heading.indexOf('<svg')).toBe(0);
    expect(heading.indexOf('Scrim')).toBeGreaterThan(0);
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

  it('shows the line of text under the name, and nothing of the old one', () => {
    expect(html).toContain('<p class="tagline">Record anything on your screen effortlessly</p>');
    expect(html).not.toContain('Nothing leaves your computer');
  });
});

describe('the home screen controls', () => {
  it('has every control the plan lists, each with a label', () => {
    for (const label of [
      'Style',
      'Zoom in where you click',
      'Zoom level',
      'Hold after a click',
      'Smoothness',
      'Camera',
      'Camera to use',
      'Microphone',
      'Microphone to use',
      'Change folder',
      'Start recording',
    ]) {
      expect(html, label).toContain(label);
    }
  });

  it('gives each input a label that points at it, so a screen reader can name it', () => {
    const ids = [...html.matchAll(/<(?:input|select) id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    for (const id of ids) {
      expect(html, `label for ${id ?? ''}`).toContain(`for="${id ?? ''}"`);
    }
  });

  it('shows the saved choices', () => {
    expect(html).toMatch(/<option value="halo-ripples" selected="">Halo and ripples<\/option>/);
    expect(html).toContain('1.8x');
    expect(html).toContain('1.2 s');
    expect(html).toContain('60%');
    expect(html).toMatch(/id="zoom-on"[^>]*checked=""/);
  });

  it('offers the four cursor styles', () => {
    for (const label of ['Halo and ripples', 'Halo only', 'Ripples only', 'Off']) {
      expect(html).toContain(`>${label}</option>`);
    }
  });

  it('keeps the zoom limits from the plan on the sliders', () => {
    expect(html).toMatch(/id="zoom-level"[^>]*min="1.2"[^>]*max="3"/);
    expect(html).toMatch(/id="zoom-hold"[^>]*min="200"[^>]*max="5000"/);
    expect(html).toMatch(/id="zoom-smooth"[^>]*min="0"[^>]*max="1"/);
  });

  it('turns the zoom sliders off when auto zoom is off', () => {
    const off = render({ settings: { ...DEFAULT_SETTINGS, zoomOn: false } });
    for (const id of ['zoom-level', 'zoom-hold', 'zoom-smooth']) {
      expect(off).toMatch(new RegExp(`id="${id}"[^>]*disabled=""`));
    }
    for (const id of ['zoom-level', 'zoom-hold', 'zoom-smooth']) {
      expect(html).not.toMatch(new RegExp(`id="${id}"[^>]*disabled=""`));
    }
  });

  it('lists the cameras and microphones, and picks the saved ones', () => {
    const on = render({
      settings: { ...DEFAULT_SETTINGS, cameraOn: true, cameraDeviceId: 'cam-2', micOn: true },
    });
    expect(on).toContain('Front camera');
    expect(on).toContain('Desk camera');
    expect(on).toContain('Headset microphone');
    expect(on).toMatch(/<option value="cam-2" selected="">Desk camera<\/option>/);
    expect(on).not.toMatch(/id="camera-device"[^>]*disabled=""/);
  });

  it('turns a device list off when its device is off, or when there is none', () => {
    expect(html).toMatch(/id="camera-device"[^>]*disabled=""/);
    expect(html).toMatch(/id="mic-device"[^>]*disabled=""/);
    const none = render({
      cameras: [],
      mics: [],
      settings: { ...DEFAULT_SETTINGS, cameraOn: true, micOn: true },
    });
    expect(none).toContain('No camera found');
    expect(none).toContain('No microphone found');
  });

  it('shows the default folder, or the one that was chosen', () => {
    expect(html).toContain('Videos\\Scrim');
    const chosen = render({ settings: { ...DEFAULT_SETTINGS, destinationFolder: 'D:\\Takes' } });
    expect(chosen).toContain('D:\\Takes');
    expect(chosen).not.toContain('Videos\\Scrim');
  });
});

describe('starting', () => {
  it('has a Start button that is ready', () => {
    expect(html).toMatch(/<button[^>]*class="button primary start"[^>]*>Start recording<\/button>/);
    expect(html).not.toMatch(/class="button primary start"[^>]*disabled/);
  });

  it('shows that it is working and cannot be pressed twice', () => {
    const busy = render({ busy: true });
    expect(busy).toMatch(
      /class="button primary start"[^>]*disabled=""[^>]*>Starting\.\.\.<\/button>/,
    );
  });

  it('says how to start and stop from anywhere', () => {
    expect(html).toContain('Ctrl+Shift+R');
    expect(html).toContain('Ctrl+Shift+S');
  });
});

describe('errors', () => {
  it('shows nothing when there is no error', () => {
    expect(html).not.toContain('role="alert"');
  });

  it('shows what went wrong and what to do, announced at once', () => {
    const failed = render({
      error: { message: 'The disk is full.', nextStep: 'Free some space, then record again.' },
    });
    expect(failed).toMatch(/role="alert"/);
    expect(failed).toContain('The disk is full.');
    expect(failed).toContain('Free some space, then record again.');
  });
});
