import { ipcMain, screen, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { PILL_CHANNELS } from '../../recorder/pill/channels';
import { pillActionSchema, type PillAction, type PillState } from '../../recorder/pill/protocol';
import { originOf } from '../renderer-target';
import { createAppWindow } from '../windows/create-window';
import type { PillWindow } from './pill-controller';
import {
  PILL_SIZE,
  pillPositionSchema,
  resolvePillPosition,
  type Point,
  type Rect,
} from './pill-position';

export interface PillWindowDeps {
  appOrigin: string;
  /** Where the recording is, so the pill can stay out of it. Read each time the pill opens. */
  recordedArea: () => { displayId?: string; rect?: Rect } | undefined;
  /** The remembered position. Both calls may fail quietly, and then the default is used. */
  loadPosition: () => Promise<unknown>;
  savePosition: (point: Point) => Promise<void>;
  onAction: (action: PillAction) => void;
  log: (message: string) => void;
}

/**
 * The floating recording pill. It is a small frameless window that stays above everything, never
 * shows in the taskbar, is hidden from screen capture so it can never appear in the video, and
 * can be dragged. Only actions from its own page, from our own origin, are passed on.
 */
export function createPillWindow(deps: PillWindowDeps): PillWindow {
  let window: BrowserWindow | undefined;
  let opening = false;
  let last: PillState | undefined;
  let ready = false;

  const current = (): BrowserWindow | undefined =>
    window !== undefined && !window.isDestroyed() ? window : undefined;

  const onAction = (event: Electron.IpcMainEvent, payload: unknown): void => {
    const target = current();
    if (target === undefined || event.sender !== target.webContents) return;
    const origin = event.senderFrame === null ? '' : originOf(event.senderFrame.url);
    if (origin !== deps.appOrigin) {
      deps.log('Ignored a pill action from an unexpected origin.');
      return;
    }
    const parsed = pillActionSchema.safeParse(payload);
    if (!parsed.success) {
      deps.log('Ignored a pill action that did not match the contract.');
      return;
    }
    if (parsed.data.type === 'ready') {
      ready = true;
      if (last !== undefined) target.webContents.send(PILL_CHANNELS.state, last);
    }
    deps.onAction(parsed.data);
  };

  async function create(): Promise<void> {
    const area = deps.recordedArea();
    const display =
      screen.getAllDisplays().find((candidate) => String(candidate.id) === area?.displayId) ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const savedRaw = await deps.loadPosition().catch(() => undefined);
    const saved = pillPositionSchema.safeParse(savedRaw);
    const position = resolvePillPosition({
      saved: saved.success ? saved.data : undefined,
      workArea: display.workArea,
      workAreas: screen.getAllDisplays().map((candidate) => candidate.workArea),
      ...(area?.rect === undefined ? {} : { recorded: area.rect }),
    });
    // The recording may have ended while the position was read.
    if (!opening) return;
    const created = createAppWindow(
      {
        ...PILL_SIZE,
        x: position.x,
        y: position.y,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        focusable: true,
        hasShadow: false,
        webPreferences: {
          preload: join(__dirname, '../preload/pill.js'),
          backgroundThrottling: false,
        },
      },
      'helper',
    );
    created.setAlwaysOnTop(true, 'screen-saver');
    // Windows leaves a window with this flag out of every capture, including the one in progress.
    created.setContentProtection(true);
    ready = false;
    created.on('moved', () => {
      if (created.isDestroyed()) return;
      const [x, y] = created.getPosition();
      if (x === undefined || y === undefined) return;
      void deps.savePosition({ x, y }).catch(() => undefined);
    });
    created.once('ready-to-show', () => {
      if (!created.isDestroyed()) created.showInactive();
    });
    created.on('closed', () => {
      if (window === created) window = undefined;
    });
    window = created;
    void created.loadURL(`${deps.appOrigin}/pill.html`).catch((error: unknown) => {
      deps.log(`The pill page did not load: ${error instanceof Error ? error.message : 'unknown'}`);
    });
  }

  ipcMain.on(PILL_CHANNELS.action, onAction);

  return {
    open() {
      if (current() !== undefined || opening) return;
      opening = true;
      void create().finally(() => {
        opening = false;
      });
    },
    close() {
      opening = false;
      last = undefined;
      current()?.destroy();
      window = undefined;
    },
    send(state) {
      last = state;
      const target = current();
      if (target !== undefined && ready) target.webContents.send(PILL_CHANNELS.state, state);
    },
  };
}
