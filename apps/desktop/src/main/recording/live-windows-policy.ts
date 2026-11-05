import { keysOfAccelerator } from '../../shared/shortcut-keys';
import { PILL_SIZE, defaultPillPosition, type Rect } from './pill-position';

/** What the pill does for a recording. */
type PillPlan =
  /** Today's behavior: the pill is hidden from capture by the system, so it shows where it likes. */
  | 'default'
  /** Shown, kept clear of the recorded box, because the system cannot hide it from capture. */
  | 'outside-region'
  /** Not shown: there is no place for it that is out of the picture. */
  | 'none';

export interface LiveWindowsPlan {
  pill: PillPlan;
  /** Hide the camera bubble when capture starts. The camera is still recorded. */
  hideBubble: boolean;
  /** A short system notification for the start of the recording, or null. */
  notice: { title: string; body: string } | null;
}

export interface LiveWindowsInput {
  /** Whether setContentProtection really keeps a window out of a capture on this system. */
  hidesWindowsFromCapture: boolean;
  source: { kind: 'display' | 'region' | 'window'; rect?: Rect | undefined } | undefined;
  /** The work area of the display being recorded. */
  workArea: Rect;
  cameraOn: boolean;
  /** The stop shortcut as an accelerator, for example CommandOrControl+Shift+S. */
  stopAccelerator: string;
  trayAvailable: boolean;
}

const CAMERA_HINT = 'Your camera is recording. The bubble appears in the video.';

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The sentence that says how to stop when there is no pill. */
export function stopHint(stopAccelerator: string, trayAvailable: boolean): string {
  const keys = keysOfAccelerator(stopAccelerator).join('+');
  return trayAvailable
    ? `Press ${keys} or use the Scrim icon in the system tray to stop.`
    : `Press ${keys} to stop, or open Scrim and stop from there.`;
}

/**
 * How the live windows (the pill and the camera bubble) keep out of the video. Where the system
 * hides a window from capture (Windows, macOS) nothing changes. Where it cannot (Linux) the bubble
 * goes while recording, the pill stays outside the recorded box or does not show at all, and a
 * short notification says how to stop. Pure, so every branch is tested without a desktop.
 */
export function planLiveWindows(input: LiveWindowsInput): LiveWindowsPlan {
  if (input.hidesWindowsFromCapture) {
    return { pill: 'default', hideBubble: false, notice: null };
  }

  let pill: PillPlan = 'none';
  const rect = input.source?.kind === 'region' ? input.source.rect : undefined;
  if (rect !== undefined) {
    const spot = defaultPillPosition(input.workArea, rect);
    const free = !overlaps({ ...spot, ...PILL_SIZE }, rect);
    pill = free ? 'outside-region' : 'none';
  }

  const lines: string[] = [];
  if (pill === 'none') lines.push(stopHint(input.stopAccelerator, input.trayAvailable));
  if (input.cameraOn) lines.push(CAMERA_HINT);
  return {
    pill,
    hideBubble: true,
    notice: lines.length === 0 ? null : { title: 'Scrim is recording', body: lines.join(' ') },
  };
}
