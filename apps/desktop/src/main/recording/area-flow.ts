import { toEvenPixels, type Rect } from '../../recorder/region/geometry';
import {
  regionEventSchema,
  type AreaKind,
  type DeviceChoice,
  type RegionCommand,
  type WindowTile,
} from '../../recorder/region/protocol';
import type { ScreenshotOptions, ScreenshotResult, ScreenshotSource } from './screenshot';
import type { Outcome, RecordingError, RecordingOptions, SourceSpec } from './types';

export interface DisplayInfo {
  /** The system's id for the display, as text. The recording service uses the same one. */
  id: string;
  /** Position and size on the desktop, in device independent pixels. */
  bounds: Rect;
  scaleFactor: number;
}

/** One overlay window, as the flow sees it. The real one wraps a BrowserWindow. */
export interface OverlayHandle {
  onEvent(callback: (value: unknown) => void): void;
  /** The window closed, by the person or because the display went away. */
  onClosed(callback: () => void): void;
  send(command: RegionCommand): void;
  focus(): void;
  close(): void;
}

export interface AreaDeps {
  displays(): DisplayInfo[];
  /** The display the pointer is on, which shows the pill and the hint. */
  pointerDisplayId(): string | undefined;
  openOverlay(display: DisplayInfo): OverlayHandle;
  /** The windows that can be picked, with a picture of each. */
  listWindows(): Promise<WindowTile[]>;
  startRecording(options: RecordingOptions): Promise<Outcome<{ folder: string }>>;
  takeScreenshot(
    source: ScreenshotSource,
    options: ScreenshotOptions,
  ): Promise<Outcome<ScreenshotResult>>;
  /**
   * Shows the camera bubble on a display while the person centres themselves, before Start. Called
   * again when the camera or microphone choice changes. `hidePreview` takes it away. A recording
   * that starts takes the same bubble over.
   */
  showPreview?: (input: { displayId: string; camera: DeviceChoice; mic: DeviceChoice }) => void;
  hidePreview?: () => void;
  /** Runs before any overlay shows, so the main window can step aside and is never captured. */
  beforeOpen?: () => Promise<void>;
  wait: (ms: number) => Promise<void>;
  log: (message: string) => void;
  /** How long to wait for the first overlay to show before giving up. */
  readyTimeoutMs?: number;
  countdownSeconds?: number;
  /** Time for the overlays to leave the screen before a screenshot is taken. */
  captureDelayMs?: number;
}

export interface AreaRequest {
  mode: 'record' | 'screenshot';
  /** What the pill starts on. Region when left out. */
  area?: AreaKind | undefined;
  camera: DeviceChoice;
  mic: DeviceChoice;
  /** Recording only. The export folder. The working folder is made in the projects folder. */
  destination?: string | undefined;
  /** Recording only. Seconds counted down before the start: 0 is off, 3 is the default. */
  countdownSeconds?: 0 | 3 | undefined;
  name?: string | undefined;
  style?: RecordingOptions['style'];
  /** Screenshot only. A folder to save to, and whether to copy. */
  folder?: string | undefined;
  copyToClipboard?: boolean | undefined;
}

export type AreaOutcome =
  | { ok: true; mode: 'record'; folder: string }
  | { ok: true; mode: 'screenshot'; result: ScreenshotResult }
  | { ok: false; reason: 'cancelled' | 'busy' }
  /** The chooser could not open. `step` says where, as a short code with no path in it. */
  | { ok: false; reason: 'failed'; step?: AreaFailStep }
  /** The area was chosen but starting the recording or taking the picture did not work. */
  | { ok: false; reason: 'rejected'; error: RecordingError };

type AreaFailStep = 'no-displays' | 'overlay-not-ready' | 'overlay-open' | 'nothing-confirmed';

/** The kind of an error, never its text, which can carry a path. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_COUNTDOWN = 3;
const DEFAULT_CAPTURE_DELAY_MS = 180;

/**
 * Lets the person choose what to record or photograph, on any display. One transparent overlay
 * covers each display. Drawing on one clears the box on the others, and the area kind, the camera
 * and the microphone stay the same on all of them. Everything that matters is worked out here from
 * the display's own position and scale, and never taken from the page: the page only says where in
 * its window the box is, or which window card was picked. Recording then counts down on the chosen
 * display, closes every overlay and starts. A screenshot closes the overlays first so they are
 * not in the picture. Only one flow runs at a time.
 */
export function createAreaFlow(deps: AreaDeps): {
  run(request: AreaRequest): Promise<AreaOutcome>;
  cancel(): void;
} {
  let running: { cancel: () => void } | undefined;

  return {
    async run(request) {
      if (running !== undefined) return { ok: false, reason: 'busy' };
      const displays = deps.displays();
      if (displays.length === 0) {
        deps.log('area.failed step=no-displays');
        return { ok: false, reason: 'failed', step: 'no-displays' };
      }

      let cancelled = false;
      let handedOver = false;
      const preview = { shown: false };
      const tracked: AreaDeps = {
        ...deps,
        showPreview: (input) => {
          preview.shown = true;
          deps.showPreview?.(input);
        },
        hidePreview: () => {
          preview.shown = false;
          deps.hidePreview?.();
        },
      };
      let finish: (outcome: AreaOutcome) => void = () => undefined;
      const done = new Promise<AreaOutcome>((resolve) => {
        finish = resolve;
      });
      running = {
        cancel: () => {
          cancelled = true;
          finish({ ok: false, reason: 'cancelled' });
        },
      };

      try {
        await deps.beforeOpen?.();
        const outcome = await choose(tracked, request, displays, done, finish, () => cancelled);
        handedOver = outcome.ok && outcome.mode === 'record';
        return outcome;
      } finally {
        running = undefined;
        // A recording that started keeps the bubble. Anything else takes it away.
        if (!handedOver && preview.shown) deps.hidePreview?.();
      }
    },
    cancel() {
      running?.cancel();
    },
  };
}

interface Entry {
  display: DisplayInfo;
  handle: OverlayHandle;
}

async function choose(
  deps: AreaDeps,
  request: AreaRequest,
  displays: DisplayInfo[],
  done: Promise<AreaOutcome>,
  finish: (outcome: AreaOutcome) => void,
  isCancelled: () => boolean,
): Promise<AreaOutcome> {
  const entries: Entry[] = [];
  const pointerId = deps.pointerDisplayId();
  let anyReady = false;
  let phase: 'choosing' | 'counting' | 'closing' = 'choosing';
  let area: AreaKind = request.area ?? 'region';
  let camera = request.camera;
  let mic = request.mic;
  let windows: WindowTile[] = [];
  let windowsRequested = false;
  let confirmed: { source: SourceSpec; entry: Entry } | undefined;
  let confirmedSignal: () => void = () => undefined;
  const confirmedPromise = new Promise<void>((resolve) => {
    confirmedSignal = resolve;
  });

  // The overlay that has something chosen and Start on offer, and the bubble it caused to show.
  let staged: Entry | undefined;
  let previewKey: string | undefined;
  const syncPreview = (): void => {
    const wanted =
      request.mode === 'record' && phase !== 'closing' && staged !== undefined && camera.enabled;
    if (!wanted || staged === undefined) {
      if (previewKey !== undefined) deps.hidePreview?.();
      previewKey = undefined;
      return;
    }
    const key = JSON.stringify([staged.display.id, camera.deviceId, mic.enabled, mic.deviceId]);
    if (key === previewKey) return;
    if (previewKey !== undefined) deps.hidePreview?.();
    previewKey = key;
    deps.showPreview?.({ displayId: staged.display.id, camera, mic });
  };

  const others = (entry: Entry): Entry[] => entries.filter((other) => other !== entry);
  // Overlays this flow closes itself, whose closing is not the person cancelling.
  const closedByUs = new Set<Entry>();
  const closeAll = (except?: Entry): void => {
    for (const entry of entries) {
      if (entry === except) continue;
      closedByUs.add(entry);
      try {
        entry.handle.close();
      } catch (error) {
        deps.log(`An overlay did not close cleanly: ${String(error)}`);
      }
    }
  };

  const timer = setTimeout(() => {
    if (!anyReady) {
      deps.log('area.failed step=overlay-not-ready');
      finish({ ok: false, reason: 'failed', step: 'overlay-not-ready' });
    }
  }, deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);

  // A picture of each window is a capture of the screen, so the list is read only when the person
  // chooses Window, once, and the cards follow the overlays, which show at once.
  function loadWindows(): void {
    if (windowsRequested) return;
    windowsRequested = true;
    void deps
      .listWindows()
      .then((tiles) => {
        windows = tiles;
        if (phase !== 'choosing') return;
        for (const entry of entries) entry.handle.send({ type: 'windows', tiles });
      })
      .catch((error: unknown) => {
        deps.log(`The window list could not be read: ${String(error)}`);
      });
  }

  for (const display of displays) {
    let handle: OverlayHandle;
    try {
      handle = deps.openOverlay(display);
    } catch (error) {
      deps.log(`area.failed step=overlay-open error=${errorName(error)}`);
      clearTimeout(timer);
      closeAll();
      return { ok: false, reason: 'failed', step: 'overlay-open' };
    }
    const entry: Entry = { display, handle };
    entries.push(entry);

    handle.onClosed(() => {
      if (closedByUs.has(entry)) return;
      if (phase === 'choosing' || phase === 'counting') finish({ ok: false, reason: 'cancelled' });
    });
    handle.onEvent((value) => {
      const parsed = regionEventSchema.safeParse(value);
      if (!parsed.success) {
        deps.log('Ignored an area event that did not match the schema.');
        return;
      }
      const event = parsed.data;
      switch (event.type) {
        case 'ready':
          anyReady = true;
          handle.send({
            type: 'init',
            mode: request.mode,
            area,
            camera,
            mic,
            primary: pointerId === undefined ? entries[0] === entry : display.id === pointerId,
          });
          if (windows.length > 0) handle.send({ type: 'windows', tiles: windows });
          if (area === 'window') loadWindows();
          return;
        case 'staged':
          if (phase !== 'choosing') return;
          if (event.ready) staged = entry;
          else if (staged === entry) staged = undefined;
          syncPreview();
          return;
        case 'begin':
          if (phase !== 'choosing') return;
          for (const other of others(entry)) other.handle.send({ type: 'clear' });
          return;
        case 'area':
          if (phase !== 'choosing') return;
          area = event.area;
          staged = undefined;
          syncPreview();
          if (area === 'window') loadWindows();
          for (const other of others(entry)) {
            other.handle.send({ type: 'clear' });
            other.handle.send({ type: 'set-area', area });
          }
          return;
        case 'devices':
          camera = event.camera;
          mic = event.mic;
          for (const other of others(entry)) {
            other.handle.send({ type: 'set-devices', camera, mic });
          }
          syncPreview();
          return;
        case 'cancel':
          finish({ ok: false, reason: 'cancelled' });
          return;
        case 'confirm-region': {
          if (phase !== 'choosing') return;
          const region = toEvenPixels(event.rect, display.scaleFactor, {
            width: display.bounds.width,
            height: display.bounds.height,
          });
          if (region === undefined) return;
          confirmed = {
            entry,
            source: {
              kind: 'region',
              displayId: display.id,
              crop: {
                x: display.bounds.x + region.dip.x,
                y: display.bounds.y + region.dip.y,
                width: region.dip.width,
                height: region.dip.height,
              },
            },
          };
          confirmedSignal();
          return;
        }
        case 'confirm-window': {
          if (phase !== 'choosing') return;
          // Only a window that was offered can be picked, whatever the page says.
          if (!windows.some((tile) => tile.id === event.sourceId)) return;
          confirmed = { entry, source: { kind: 'window', sourceId: event.sourceId } };
          confirmedSignal();
          return;
        }
        case 'confirm-display':
          if (phase !== 'choosing') return;
          confirmed = { entry, source: { kind: 'display', displayId: display.id } };
          confirmedSignal();
          return;
      }
    });
  }

  // The display under the pointer gets the keyboard, so Enter and Escape work at once.
  const focusEntry = entries.find((entry) => entry.display.id === pointerId) ?? entries[0];
  focusEntry?.handle.focus();

  const chosen = await Promise.race([done, confirmedPromise.then(() => 'chosen' as const)]);
  clearTimeout(timer);
  if (chosen !== 'chosen' || confirmed === undefined) {
    phase = 'closing';
    closeAll();
    if (chosen === 'chosen') deps.log('area.failed step=nothing-confirmed');
    return chosen === 'chosen'
      ? { ok: false, reason: 'failed', step: 'nothing-confirmed' }
      : chosen;
  }

  const { source, entry } = confirmed;
  if (request.mode === 'screenshot') {
    phase = 'closing';
    closeAll();
    await deps.wait(deps.captureDelayMs ?? DEFAULT_CAPTURE_DELAY_MS);
    const taken = await deps.takeScreenshot(source, {
      folder: request.folder,
      copyToClipboard: request.copyToClipboard ?? true,
    });
    return taken.ok
      ? { ok: true, mode: 'screenshot', result: taken.value }
      : { ok: false, reason: 'rejected', error: taken.error };
  }

  // Recording: count down on the display that was chosen, then close everything and start.
  phase = 'counting';
  closeAll(entry);
  const seconds = request.countdownSeconds ?? deps.countdownSeconds ?? DEFAULT_COUNTDOWN;
  for (let n = seconds; n >= 1; n -= 1) {
    entry.handle.send({ type: 'count', n });
    const next = await Promise.race([
      deps.wait(1000).then(() => 'tick' as const),
      done.then(() => 'cancel' as const),
    ]);
    if (next === 'cancel' || isCancelled()) {
      phase = 'closing';
      closeAll();
      return { ok: false, reason: 'cancelled' };
    }
  }
  phase = 'closing';
  entry.handle.send({ type: 'count', n: null });
  closeAll();
  // A moment for the overlay to leave the screen, so the first frames do not show it.
  await deps.wait(deps.captureDelayMs ?? DEFAULT_CAPTURE_DELAY_MS);

  const started = await deps.startRecording({
    source,
    camera,
    mic,
    destination: request.destination,
    name: request.name,
    style: request.style,
  });
  return started.ok
    ? { ok: true, mode: 'record', folder: started.value.folder }
    : { ok: false, reason: 'rejected', error: started.error };
}
