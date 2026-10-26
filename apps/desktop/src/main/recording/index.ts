import { app } from 'electron';
import { createRecordingService } from './create-service';
import { startMarker } from './dev-marker';
import { readDevTrigger, runDevTrigger } from './dev-trigger';
import type { RecordingService } from './recording-service';

// Runs when this file is first loaded, which is before the app is ready, as the switch requires.
// At startup Chromium asks the network for a host called wpad to find a proxy configuration. That
// is a name lookup nobody asked for, in an app that promises no network during recording. With no
// proxy there is no lookup. The optional update check, the one allowed use of the network, will
// need its own session if it has to go through a proxy.
app.commandLine.appendSwitch('no-proxy-server');

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
