import { currentPlatform } from '../platform/platform';
import { ipcMain } from 'electron';
import { join } from 'node:path';
import { BUBBLE_CHANNELS } from '../../recorder/bubble/channels';
import {
  windowSizeFor,
  hitRects,
  type BubbleShape,
  windowOrigin,
  type DotSide,
  type Point,
} from '../../recorder/bubble/geometry';
import { bubbleEventSchema, type BubbleCommand } from '../../recorder/bubble/protocol';
import { originOf } from '../renderer-target';
import { createAppWindow } from '../windows/create-window';
import type { BubbleWindow, CameraFailure } from './bubble-controller';

/** Where the picture's top left is, from the window's top left. */
function pictureOf(window: Point, side: DotSide): Point {
  const origin = windowOrigin({ x: 0, y: 0 }, side);
  return { x: window.x - origin.x, y: window.y - origin.y };
}

/**
 * The camera bubble's window. It is small, frameless and transparent, stays above everything, never
 * shows in the taskbar, is hidden from screen capture, and passes every click through except on the
 * round picture and the dot, which drag it.
 */
export function createBubbleWindow(options: {
  appOrigin: string;
  log: (message: string) => void;
}): BubbleWindow {
  let window: ReturnType<typeof createAppWindow> | undefined;
  let side: DotSide = 'right';
  let look: { size: number; shape: BubbleShape } = { size: 180, shape: 'circle' };
  let pending: BubbleCommand | undefined;
  let ready = false;
  const dragStart: (() => void)[] = [];
  const dragEnd: ((circle: Point) => void)[] = [];
  const cameraFailed: ((reason: CameraFailure) => void)[] = [];
  /** The pill's last buttons state, kept so a page that loads late still gets it. */
  let lastMedia: BubbleCommand | undefined;
  /** Moves made by the app itself, which must not count as the person dragging. */
  let placing = false;
  let placingTimer: ReturnType<typeof setTimeout> | undefined;

  const current = (): NonNullable<typeof window> | undefined =>
    window !== undefined && !window.isDestroyed() ? window : undefined;

  const onEvent = (event: Electron.IpcMainEvent, payload: unknown): void => {
    const target = current();
    if (target === undefined || event.sender !== target.webContents) return;
    const origin = event.senderFrame === null ? '' : originOf(event.senderFrame.url);
    if (origin !== options.appOrigin) return;
    const parsed = bubbleEventSchema.safeParse(payload);
    if (!parsed.success) return;
    if (parsed.data.type === 'camera-failed') {
      for (const callback of cameraFailed) callback(parsed.data.reason);
      return;
    }
    ready = true;
    if (pending !== undefined) target.webContents.send(BUBBLE_CHANNELS.command, pending);
    if (lastMedia !== undefined) target.webContents.send(BUBBLE_CHANNELS.command, lastMedia);
  };
  ipcMain.on(BUBBLE_CHANNELS.event, onEvent);

  const applyShape = (target: NonNullable<typeof window>): void => {
    target.setShape(hitRects(side, look.size, look.shape));
  };

  return {
    open(input) {
      if (current() !== undefined) return;
      side = input.side;
      look = { size: input.size, shape: input.shape };
      const origin = windowOrigin(input.circle, side);
      const created = createAppWindow(
        {
          ...windowSizeFor(input.size),
          x: Math.round(origin.x),
          y: Math.round(origin.y),
          show: false,
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          resizable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          hasShadow: false,
          webPreferences: {
            preload: join(__dirname, '../preload/bubble.js'),
            backgroundThrottling: false,
          },
        },
        'helper',
      );
      created.setAlwaysOnTop(true, 'screen-saver');
      // Windows leaves a window with this flag out of every capture, including the one in progress.
      if (currentPlatform().hidesWindowsFromCapture) created.setContentProtection(true);
      applyShape(created);
      created.on('will-move', () => {
        if (!placing) for (const callback of dragStart) callback();
      });
      created.on('moved', () => {
        if (placing || created.isDestroyed()) return;
        const [x, y] = created.getPosition();
        if (x === undefined || y === undefined) return;
        const circle = pictureOf({ x, y }, side);
        for (const callback of dragEnd) callback(circle);
      });
      created.once('ready-to-show', () => {
        // A camera switched off before the page was ready stays hidden.
        const hidden = lastMedia?.type === 'media' && !lastMedia.cameraOn;
        if (!created.isDestroyed() && !hidden) created.showInactive();
      });
      created.on('closed', () => {
        if (window === created) window = undefined;
      });
      window = created;
      ready = false;
      pending = {
        type: 'init',
        cameraDeviceId: input.camera.deviceId,
        mic: input.mic,
        side,
        size: input.size,
        shape: input.shape,
      };
      void created.loadURL(`${options.appOrigin}/bubble.html`).catch((error: unknown) => {
        options.log(
          `The bubble page did not load: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      });
    },
    setVisible(visible) {
      const target = current();
      if (target === undefined) return;
      if (visible) {
        if (!target.isVisible()) target.showInactive();
      } else target.hide();
    },
    media(next) {
      lastMedia = { type: 'media', ...next };
      const target = current();
      if (target !== undefined && ready)
        target.webContents.send(BUBBLE_CHANNELS.command, lastMedia);
    },
    onCameraFailed(callback) {
      cameraFailed.push(callback);
    },
    close() {
      pending = undefined;
      lastMedia = undefined;
      ready = false;
      current()?.destroy();
      window = undefined;
    },
    place(circle, nextSide) {
      const target = current();
      if (target === undefined) return;
      placing = true;
      try {
        if (nextSide !== side) {
          side = nextSide;
          applyShape(target);
          if (ready) target.webContents.send(BUBBLE_CHANNELS.command, { type: 'side', side });
        }
        const origin = windowOrigin(circle, side);
        target.setPosition(Math.round(origin.x), Math.round(origin.y));
      } finally {
        // The window's own 'moved' arrives a moment later, so the flag is cleared after it.
        if (placingTimer !== undefined) clearTimeout(placingTimer);
        placingTimer = setTimeout(() => {
          placing = false;
        }, 60);
      }
    },
    onDragStart(callback) {
      dragStart.push(callback);
    },
    onDragEnd(callback) {
      dragEnd.push(callback);
    },
  };
}
