/** The record red, as the palette defines it. */
const RED = { r: 0xff, g: 0x3b, b: 0x30 };

/**
 * A filled red circle as a BGRA bitmap, for the taskbar overlay. Drawn in code so there is no file
 * to ship, with a soft edge from pixel coverage so it stays clean at every scaling.
 */
export function redDotBitmap(size: number): Buffer {
  const buffer = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const radius = size / 2 - 0.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      const coverage = Math.min(1, Math.max(0, radius + 0.5 - distance));
      const at = (y * size + x) * 4;
      buffer[at] = RED.b;
      buffer[at + 1] = RED.g;
      buffer[at + 2] = RED.r;
      buffer[at + 3] = Math.round(coverage * 255);
    }
  }
  return buffer;
}

/** The slice of a window the recording mark touches, so tests can stand in for it. */
export interface MarkableWindow {
  isDestroyed: () => boolean;
  isMinimized: () => boolean;
  minimize: () => void;
  restore: () => void;
  show: () => void;
  focus: () => void;
  setContentProtection: (enable: boolean) => void;
  // Method syntax, so Electron's narrower image type fits.
  setOverlayIcon(overlay: unknown, description: string): void;
}

export interface MarkOptions {
  /** Makes the red dot image. Called once per recording. */
  makeDot: () => unknown;
}

/**
 * While a recording runs, the main window is minimized, never hidden, so it keeps its taskbar
 * button, and the button carries a red dot. The window is also excluded from capture, so if it is
 * restored during the recording it does not show up in the video. Both are undone at the end.
 */
export function createRecordingMark(options: MarkOptions) {
  return {
    begin(window: MarkableWindow | null): void {
      if (!window || window.isDestroyed()) return;
      window.setContentProtection(true);
      window.setOverlayIcon(options.makeDot(), 'Recording');
      window.minimize();
    },
    end(window: MarkableWindow | null): void {
      if (!window || window.isDestroyed()) return;
      window.setOverlayIcon(null, '');
      window.setContentProtection(false);
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    },
  };
}
