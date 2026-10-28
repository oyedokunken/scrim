import { smoothnessToEaseMs } from '@scrim/core';
import type { z } from 'zod';
import type { AreaOutcome, AreaRequest } from '../recording/area-flow';
import type { RecordingOptions } from '../recording/types';
import type { areaOutcomeSchema } from '../../shared/recording-contract';
import type { Settings } from '../../shared/settings';
import { toBridgeError } from './recording-handlers';
import type { Handlers } from './dispatcher';

/** The part of the area chooser the bridge uses. The real one fits it as it is. */
export interface AreaApi {
  run: (request: AreaRequest) => Promise<AreaOutcome>;
  cancel: () => void;
}

/** The cursor and zoom choices saved in settings, as the look a new recording starts with. */
export function styleFromSettings(settings: Settings): NonNullable<RecordingOptions['style']> {
  return {
    cursor: { style: settings.cursorStyle },
    zoom: {
      enabled: settings.zoomOn,
      maxZoom: settings.zoomLevel,
      holdMs: settings.holdAfterClickMs,
      easeMs: smoothnessToEaseMs(settings.smoothness),
    },
  };
}

/** The camera and microphone choices saved in settings, in the shape the engine takes. */
export function devicesFromSettings(settings: Settings): Pick<AreaRequest, 'camera' | 'mic'> {
  const choice = (enabled: boolean, deviceId: string | null) => ({
    enabled,
    ...(deviceId === null ? {} : { deviceId }),
  });
  return {
    camera: choice(settings.cameraOn, settings.cameraDeviceId),
    mic: choice(settings.micOn, settings.micDeviceId),
  };
}

type BridgeAreaOutcome = z.infer<typeof areaOutcomeSchema>;

/** The outcome without the session folder, which the page never needs. */
export function toBridgeAreaOutcome(outcome: AreaOutcome): BridgeAreaOutcome {
  if (outcome.ok) {
    return outcome.mode === 'record'
      ? { ok: true, mode: 'record' }
      : {
          ok: true,
          mode: 'screenshot',
          result: {
            ...(outcome.result.path === undefined ? {} : { path: outcome.result.path }),
            ...(outcome.result.saveError === undefined
              ? {}
              : {
                  saveError: {
                    message: outcome.result.saveError.message,
                    nextStep: outcome.result.saveError.nextStep,
                  },
                }),
            copied: outcome.result.copied,
            width: outcome.result.width,
            height: outcome.result.height,
          },
        };
  }
  return outcome.reason === 'rejected'
    ? { ok: false, reason: 'rejected', error: toBridgeError(outcome.error) }
    : { ok: false, reason: outcome.reason };
}

export interface AreaHandlerDeps {
  area: AreaApi;
  settings: () => Settings;
  /** Where screenshots go: Pictures\Scrim, since screenshots are not recordings. */
  screenshotFolder: () => string;
}

export interface AreaInput {
  mode: 'record' | 'screenshot';
  area?: AreaRequest['area'];
  camera: AreaRequest['camera'];
  mic: AreaRequest['mic'];
  name?: string | undefined;
}

/** Fills in what only the main process may decide: the folder, the clipboard and the look. */
export function buildAreaRequest(
  input: AreaInput,
  saved: Settings,
  screenshotFolder: string,
): AreaRequest {
  if (input.mode === 'record') {
    return {
      mode: 'record',
      area: input.area,
      camera: input.camera,
      mic: input.mic,
      destination: saved.destinationFolder ?? undefined,
      name: input.name,
      style: styleFromSettings(saved),
      countdownSeconds: saved.countdownOn ? 3 : 0,
    };
  }
  return {
    mode: 'screenshot',
    area: input.area,
    camera: input.camera,
    mic: input.mic,
    folder: screenshotFolder,
    copyToClipboard: true,
  };
}

/**
 * The area chooser calls. The page says what to do and with which devices. The folder, the
 * clipboard choice and the look all come from the main process, so the page cannot redirect a file.
 */
export function createAreaHandlers(
  deps: AreaHandlerDeps,
): Pick<Handlers, 'area:run' | 'area:cancel'> {
  return {
    'area:run': async (input) =>
      toBridgeAreaOutcome(
        await deps.area.run(buildAreaRequest(input, deps.settings(), deps.screenshotFolder())),
      ),
    'area:cancel': () => {
      deps.area.cancel();
    },
  };
}
