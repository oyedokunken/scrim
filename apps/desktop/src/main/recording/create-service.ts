import { app, desktopCapturer, screen, session, systemPreferences } from 'electron';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type * as UiohookModule from 'uiohook-napi';
import { createHookSource } from './input-source';
import { installDisplayMediaHandler, type CaptureTarget } from './display-media';
import { resolveFfmpegPaths, runProcess } from './ffmpeg';
import { realServiceFs } from './fs-adapter';
import { createUnavailableBoundsSource } from './window-bounds-source';
import { RecorderHost } from './recorder-host';
import { openRecorderWindow } from './recorder-window';
import { RecordingService } from './recording-service';
import { createSessionIndex } from './session-store';
import type { Outcome, ResolvedSource, SourceSpec } from './types';
import { makeError } from './messages';

function hrNow(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function osName(): 'windows' | 'macos' | 'linux' {
  if (process.platform === 'win32') return 'windows';
  return process.platform === 'darwin' ? 'macos' : 'linux';
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // No permission to signal it still means the process exists.
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM';
  }
}

function toCaptureTarget(spec: SourceSpec): CaptureTarget {
  return spec.kind === 'window'
    ? { kind: 'window', sourceId: spec.sourceId }
    : { kind: 'display', displayId: spec.displayId };
}

/**
 * Where a display or window sits on the desktop. A display and a region use the display's own
 * origin and scale, so mouse positions map to pixels of the full recorded frame. Electron cannot
 * report the bounds of another application's window, so a window is mapped as if it filled the
 * primary display until that is solved natively, and the session records it as a window.
 */
function resolveSource(spec: SourceSpec): Promise<Outcome<ResolvedSource>> {
  const displays = screen.getAllDisplays();
  const requested = spec.kind === 'window' ? undefined : spec.displayId;
  const display =
    displays.find((candidate) => String(candidate.id) === requested) ?? screen.getPrimaryDisplay();
  if (spec.kind === 'window') {
    return Promise.resolve(
      desktopCapturer
        .getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources): Outcome<ResolvedSource> => {
          if (!sources.some((source) => source.id === spec.sourceId)) {
            return { ok: false, error: makeError('screen-unavailable') };
          }
          return {
            ok: true,
            value: {
              kind: 'window',
              origin: { x: display.bounds.x, y: display.bounds.y },
              scaleFactor: display.scaleFactor,
            },
          };
        }),
    );
  }
  return Promise.resolve({
    ok: true,
    value: {
      kind: spec.kind,
      displayId: String(display.id),
      ...(spec.kind === 'region' ? { crop: spec.crop } : {}),
      origin: { x: display.bounds.x, y: display.bounds.y },
      scaleFactor: display.scaleFactor,
    },
  });
}

export interface CreateServiceOptions {
  /** The origin the app and the recorder page are served from. */
  appOrigin: string;
  log?: ((message: string) => void) | undefined;
}

/** The recording service wired to Electron: real files, the real display, the real recorder window. */
export function createRecordingService(options: CreateServiceOptions): RecordingService {
  const log =
    options.log ??
    ((message: string): void => {
      console.error(message);
    });
  let target: SourceSpec | undefined;
  installDisplayMediaHandler(session.defaultSession, () =>
    target === undefined ? undefined : toCaptureTarget(target),
  );

  const requireHook = createRequire(__filename);
  return new RecordingService({
    fs: realServiceFs,
    now: hrNow,
    wallNow: () => new Date(),
    uuid: randomUUID,
    app: {
      version: app.getVersion(),
      os: osName(),
      arch: process.arch === 'arm64' ? 'arm64' : 'x64',
      pid: process.pid,
    },
    createHost: (callbacks) =>
      new RecorderHost({
        transport: openRecorderWindow({ appOrigin: options.appOrigin, log }),
        now: hrNow,
        ...callbacks,
      }),
    createInputSource: () =>
      createHookSource({
        platform: process.platform,
        env: process.env,
        // The native module is loaded only when a recording starts, and a failure to load it only
        // turns the mouse log off.
        load: () =>
          Promise.resolve().then((): unknown => {
            // The type import above is what tells the tooling this native dependency is used.
            const hook = requireHook('uiohook-napi') as typeof UiohookModule;
            return hook;
          }),
        isAccessibilityTrusted: () =>
          process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(false),
        locate: (point) => {
          // Windows reports physical pixels. The other systems already report points.
          const dip = process.platform === 'win32' ? screen.screenToDipPoint(point) : point;
          return { x: dip.x, y: dip.y, display: String(screen.getDisplayNearestPoint(dip).id) };
        },
      }),
    createBoundsSource: () =>
      createUnavailableBoundsSource('Reading another window needs a native module.'),
    run: runProcess,
    ffmpeg: resolveFfmpegPaths({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      platform: process.platform,
      env: process.env,
    }),
    resolveSource,
    setCaptureTarget: (spec) => {
      target = spec;
    },
    defaultDestination: () => join(app.getPath('videos'), 'Scrim'),
    index: createSessionIndex(join(app.getPath('userData'), 'sessions.json'), realServiceFs),
    isProcessAlive: isAlive,
    log,
    trace: !app.isPackaged && process.env['SCRIM_DEV_TRACE'] === '1',
    timers: {
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: (handle) => {
        if (handle !== undefined) clearInterval(handle as NodeJS.Timeout);
      },
    },
  });
}
