import type { RecordingService } from './recording-service';
import type { FinishedRecording, RecordingError } from './types';

/**
 * A way to test real recordings before the home screen exists. It is read from environment
 * variables, only in a development run, and is removed once the home screen drives the service:
 *
 *   SCRIM_DEV_RECORD=10   record the primary display for 10 seconds
 *   SCRIM_DEV_CAMERA=1    also record the camera
 *   SCRIM_DEV_MIC=1       also record the microphone
 *   SCRIM_DEV_PAUSE=3     pause at 3 seconds for 2 seconds, then resume
 *   SCRIM_DEV_DEST=...    save into this folder instead of Videos\Scrim
 *   SCRIM_DEV_RECOVER=1   instead of recording, recover every unfinished recording and quit
 */
export interface DevTriggerPlan {
  mode: 'record' | 'recover';
  seconds: number;
  destination: string | undefined;
  camera: boolean;
  mic: boolean;
  /** Seconds into the recording at which to pause for two seconds. */
  pauseAt: number | undefined;
}

const MAX_SECONDS = 3600;
export const DEV_PAUSE_SECONDS = 2;

function positiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 && parsed <= MAX_SECONDS ? parsed : undefined;
}

/**
 * Reads the plan from the environment. Returns undefined, so nothing happens, when the app is
 * packaged or the variable is missing or not a sensible number of seconds.
 */
export function readDevTrigger(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): DevTriggerPlan | undefined {
  if (isPackaged) return undefined;
  const destination = env['SCRIM_DEV_DEST'] === '' ? undefined : env['SCRIM_DEV_DEST'];
  if (env['SCRIM_DEV_RECOVER'] === '1') {
    return {
      mode: 'recover',
      seconds: 0,
      destination,
      camera: false,
      mic: false,
      pauseAt: undefined,
    };
  }
  const seconds = positiveInteger(env['SCRIM_DEV_RECORD']);
  if (seconds === undefined) return undefined;
  const pauseAt = positiveInteger(env['SCRIM_DEV_PAUSE']);
  return {
    mode: 'record',
    destination,
    seconds,
    camera: env['SCRIM_DEV_CAMERA'] === '1',
    mic: env['SCRIM_DEV_MIC'] === '1',
    pauseAt: pauseAt !== undefined && pauseAt < seconds ? pauseAt : undefined,
  };
}

export interface DevTriggerDeps {
  service: Pick<
    RecordingService,
    'start' | 'pause' | 'resume' | 'stop' | 'listRecoverable' | 'recover'
  >;
  wait: (ms: number) => Promise<void>;
  log: (message: string) => void;
  /** Called once it is all over, so a dev run can quit. */
  done: () => void;
}

/** Runs the plan: record, optionally pause, stop, and log where everything landed. */
export async function runDevTrigger(plan: DevTriggerPlan, deps: DevTriggerDeps): Promise<void> {
  const { service, wait, log } = deps;
  const fail = (step: string, error: RecordingError): void => {
    log(`DEV RECORD ${step} failed: ${error.message} ${error.nextStep} (${error.code})`);
  };
  try {
    if (plan.mode === 'recover') {
      await recoverAll(service, log);
      return;
    }
    const started = await service.start({
      source: { kind: 'display' },
      camera: { enabled: plan.camera },
      mic: { enabled: plan.mic },
      destination: plan.destination,
    });
    if (!started.ok) {
      fail('start', started.error);
      return;
    }
    log(`DEV RECORD started: ${started.value.folder}`);

    let elapsed = 0;
    if (plan.pauseAt !== undefined) {
      await wait(plan.pauseAt * 1000);
      elapsed = plan.pauseAt;
      const paused = await service.pause();
      if (!paused.ok) {
        fail('pause', paused.error);
        return;
      }
      log(`DEV RECORD paused at ${String(plan.pauseAt)} s`);
      await wait(DEV_PAUSE_SECONDS * 1000);
      const resumed = await service.resume();
      if (!resumed.ok) {
        fail('resume', resumed.error);
        return;
      }
      log('DEV RECORD resumed');
    }
    await wait(Math.max(0, plan.seconds - elapsed) * 1000);

    const stopped = await service.stop();
    if (!stopped.ok) {
      fail('stop', stopped.error);
      return;
    }
    log(describeResult(stopped.value));
  } finally {
    deps.done();
  }
}

async function recoverAll(
  service: Pick<RecordingService, 'listRecoverable' | 'recover'>,
  log: (message: string) => void,
): Promise<void> {
  const found = await service.listRecoverable();
  log(`DEV RECOVER found ${String(found.length)} unfinished recording(s)`);
  for (const session of found) {
    const result = await service.recover(session.folder);
    if (result.ok)
      log(describeResult(result.value).replace('DEV RECORD finished', 'DEV RECOVER finished'));
    else log(`DEV RECOVER failed: ${result.error.message} (${result.error.code})`);
  }
}

function describeResult(result: FinishedRecording): string {
  const files = result.files.map((file) => `${file.kind}: ${file.path}`).join(', ');
  return `DEV RECORD finished: ${result.folder} (${String(Math.round(result.durationMs / 100) / 10)} s, ${String(result.bytes)} bytes, ${files}${result.inputLog === undefined ? ', no input log' : `, input log: ${result.inputLog}`})`;
}
