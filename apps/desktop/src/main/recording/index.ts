import { app } from 'electron';
import { createRecordingService } from './create-service';
import { startMarker } from './dev-marker';
import { readDevTrigger, runDevTrigger } from './dev-trigger';
import type { RecordingService } from './recording-service';

export type { RecordingService } from './recording-service';
export type * from './types';

/**
 * Starts the recording engine. Call it once, after the app is ready. It returns the service the
 * home screen and the typed bridge will talk to. In a development run it also looks at the
 * SCRIM_DEV_RECORD variables and, when they are set, makes a test recording and quits.
 */
export function registerRecording(options: { appOrigin: string }): RecordingService {
  const service = createRecordingService({ appOrigin: options.appOrigin });

  void service.listRecoverable().then((found) => {
    if (found.length > 0) {
      console.error(`${String(found.length)} unfinished recording(s) can be recovered.`);
    }
  });

  const plan = readDevTrigger(process.env, app.isPackaged);
  if (plan !== undefined) {
    const stopMarker =
      plan.mode === 'record' && process.env['SCRIM_DEV_MARKER'] === '1'
        ? startMarker(() => Number(process.hrtime.bigint()) / 1_000_000, console.log)
        : undefined;
    void runDevTrigger(plan, {
      service,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (message) => {
        console.log(message);
      },
      done: () => {
        stopMarker?.();
        app.quit();
      },
    });
  }
  return service;
}
