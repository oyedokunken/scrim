import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AudioPanel } from '../../src/renderer/src/panels/audio-panel';
import {
  BackgroundPanel,
  backgroundClass,
  type BackgroundValue,
} from '../../src/renderer/src/panels/background-panel';
import { BackgroundPreview } from '../../src/renderer/src/panels/background-preview';
import { CameraPanel, type CameraValue } from '../../src/renderer/src/panels/camera-panel';
import { nearestCorner } from '../../src/renderer/src/panels/camera-preview';
import { DEFAULT_SETTINGS, settingsFileSchema } from '../../src/shared/settings';

const noop = (): void => undefined;
const camera: CameraValue = { on: true, size: 'M', shape: 'circle', corner: 'bottom-right' };
const background: BackgroundValue = {
  id: 'deep-green',
  padding: 'medium',
  corners: 'soft',
  shadow: true,
};

describe('the Camera panel', () => {
  const html = renderToStaticMarkup(<CameraPanel value={camera} onChange={noop} />);

  it('has the switch, size, shape and the four corner dots, and no range slider', () => {
    expect(html).toContain('Show camera');
    for (const label of ['Small', 'Medium', 'Large', 'Circle', 'Rounded']) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html.match(/class="corner-dot /g)).toHaveLength(4);
    expect(html).toContain('Or drag the bubble in the preview.');
    expect(html).not.toContain('type="range"');
  });

  it('marks the chosen corner and size', () => {
    expect(html).toMatch(
      /aria-label="Bottom right"[^>]*class="corner-dot corner-bottom-right selected"|class="corner-dot corner-bottom-right selected"[^>]*aria-label="Bottom right"/,
    );
    expect(html).toMatch(/aria-checked="true"[^>]*class="ui-segment selected">Medium/);
  });

  it('is disabled with a reason when the recording has no camera track', () => {
    const locked = renderToStaticMarkup(
      <CameraPanel value={camera} onChange={noop} disabledNote="This recording has no camera." />,
    );
    expect(locked).toContain('This recording has no camera.');
    expect(locked).toMatch(/role="switch"[^>]*disabled/);
    expect(locked).toMatch(/disabled=""[^>]*corner-dot/);
  });

  it('turns the options off when the camera is off', () => {
    const off = renderToStaticMarkup(
      <CameraPanel value={{ ...camera, on: false }} onChange={noop} />,
    );
    expect(off).toMatch(/role="radio"[^>]*disabled=""[^>]*>Small/);
  });
});

describe('nearestCorner', () => {
  it('snaps a drop to the quadrant it lands in', () => {
    expect(nearestCorner(10, 10, 400, 250)).toBe('top-left');
    expect(nearestCorner(390, 10, 400, 250)).toBe('top-right');
    expect(nearestCorner(10, 240, 400, 250)).toBe('bottom-left');
    expect(nearestCorner(390, 240, 400, 250)).toBe('bottom-right');
    expect(nearestCorner(200, 125, 400, 250)).toBe('bottom-right');
  });
});

describe('the Audio panel', () => {
  it('has keep sound and the three volumes, and disables the volume without sound', () => {
    const on = renderToStaticMarkup(
      <AudioPanel value={{ keepSound: true, volume: 'normal' }} onChange={noop} />,
    );
    for (const label of ['Quieter', 'Normal', 'Louder']) expect(on).toContain(`>${label}<`);
    expect(on).toContain('Keep sound');
    const off = renderToStaticMarkup(
      <AudioPanel value={{ keepSound: false, volume: 'normal' }} onChange={noop} />,
    );
    expect(off).toMatch(/role="radio"[^>]*disabled=""[^>]*>Quieter/);
  });
});

describe('the Background panel and preview', () => {
  const html = renderToStaticMarkup(<BackgroundPanel value={background} onChange={noop} />);

  it('lists the render presets, None and a disabled image tile, with padding, corners and shadow', () => {
    for (const label of ['Butter', 'Green', 'Deep green', 'Dots', 'Grid', 'None']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toMatch(/aria-label="Your image, coming soon"[^>]*disabled/);
    for (const label of ['Small', 'Medium', 'Large', 'Square', 'Soft', 'Round']) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('Soft shadow');
    expect(html).not.toContain('type="range"');
  });

  it('selects the chosen preset only', () => {
    expect(html.match(/aria-checked="true"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toMatch(/aria-checked="true"[^>]*aria-label="Deep green"/);
  });

  it('falls back to the default look for an id it does not know', () => {
    expect(backgroundClass('unknown')).toBe('bg-deep-green');
    expect(backgroundClass('dots')).toBe('bg-dots');
  });

  it('draws the preview from the value', () => {
    const preview = renderToStaticMarkup(
      <BackgroundPreview value={{ ...background, padding: 'large', corners: 'round' }} />,
    );
    expect(preview).toContain('data-padding="large"');
    expect(preview).toContain('data-corners="round"');
    expect(preview).toContain('data-shadow="on"');
    const none = renderToStaticMarkup(<BackgroundPreview value={{ ...background, id: 'none' }} />);
    expect(none).toContain('data-padding="none"');
    expect(none).toContain('data-shadow="off"');
  });
});

describe('the saved settings', () => {
  it('have defaults for every new field, and an older file without them still loads', () => {
    expect(DEFAULT_SETTINGS.bubbleCorner).toBe('bottom-right');
    expect(DEFAULT_SETTINGS.keepSound).toBe(true);
    expect(DEFAULT_SETTINGS.backgroundId).toBe('deep-green');
    expect(settingsFileSchema.safeParse({ version: 1, cameraOn: true }).success).toBe(true);
  });

  it('refuse a value outside the choices', () => {
    expect(settingsFileSchema.safeParse({ version: 1, bubbleSize: 'XL' }).success).toBe(false);
    expect(settingsFileSchema.safeParse({ version: 1, micVolume: 'loud' }).success).toBe(false);
  });
});
