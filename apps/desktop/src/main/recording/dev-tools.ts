import type { AreaOutcome, AreaRequest } from './area-flow';
import type { ScreenshotOptions, ScreenshotResult, ScreenshotSource } from './screenshot';
import type { SourceInfo } from './sources';
import type { Outcome } from './types';

/**
 * Ways to try the capture helpers before the home screen drives them, in a development run only:
 *
 *   SCRIM_DEV_TOOL=area-shot    show the area overlay in screenshot mode and log what was saved
 *   SCRIM_DEV_TOOL=area-record  show the area overlay in recording mode, record for a few seconds
 *                               (SCRIM_DEV_SECONDS, default 5) and log where it went
 *   SCRIM_DEV_TOOL=area-pick    the same overlay in recording mode, but nothing is recorded: what was
 *                               chosen is logged and that is all. For testing the overlay itself
 *   SCRIM_DEV_TOOL=sources      log the screens and windows that can be recorded
 *   SCRIM_DEV_TOOL=shot         take a screenshot of the primary display into SCRIM_DEV_DEST
 *                               (or the system temp folder) and copy it to the clipboard
 *
 * They are removed once the home screen uses the same functions.
 */
export type DevTool = 'area-shot' | 'area-record' | 'area-pick' | 'sources' | 'shot';

const TOOLS: readonly string[] = ['area-shot', 'area-record', 'area-pick', 'sources', 'shot'];

export function readDevTool(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): DevTool | undefined {
  if (isPackaged) return undefined;
  const value = env['SCRIM_DEV_TOOL'];
  return value !== undefined && TOOLS.includes(value) ? (value as DevTool) : undefined;
}

export interface DevToolDeps {
  runArea: (request: AreaRequest) => Promise<AreaOutcome>;
  stopRecording: () => Promise<void>;
  listSources: () => Promise<SourceInfo[]>;
  takeShot: (
    source: ScreenshotSource,
    options: ScreenshotOptions,
  ) => Promise<Outcome<ScreenshotResult>>;
  wait: (ms: number) => Promise<void>;
  /** Where a screenshot or a recording is saved. */
  folder: string;
  /** How long a recording from the overlay runs before the tool stops it. */
  seconds: number;
  log: (message: string) => void;
  /** Called when the tool is finished, so a development run can quit. */
  done: () => void;
}

const OFF = { enabled: false } as const;

/** Runs one tool and always calls `done`. What it logs never includes a picture. */
export async function runDevTool(tool: DevTool, deps: DevToolDeps): Promise<void> {
  const { log } = deps;
  try {
    if (tool === 'area-shot') {
      const outcome = await deps.runArea({
        mode: 'screenshot',
        camera: OFF,
        mic: OFF,
        folder: deps.folder,
        copyToClipboard: true,
      });
      log(`DEV AREA ${JSON.stringify(outcome)}`);
    } else if (tool === 'area-pick') {
      const outcome = await deps.runArea({ mode: 'record', camera: OFF, mic: OFF });
      log(`DEV AREA ${JSON.stringify(outcome)}`);
    } else if (tool === 'area-record') {
      const outcome = await deps.runArea({
        mode: 'record',
        camera: OFF,
        mic: OFF,
        destination: deps.folder,
      });
      log(`DEV AREA ${JSON.stringify(outcome)}`);
      if (outcome.ok) {
        await deps.wait(deps.seconds * 1000);
        await deps.stopRecording();
        log('DEV AREA stopped');
      }
    } else if (tool === 'sources') {
      const sources = await deps.listSources();
      log(`DEV SOURCES ${String(sources.length)} found`);
      for (const source of sources) {
        const picture = source.thumbnail === '' ? 'no thumbnail' : 'thumbnail';
        log(`DEV SOURCE ${source.kind} ${source.id} "${source.name}" ${picture}`);
      }
    } else {
      const outcome = await deps.takeShot(
        { kind: 'display' },
        { folder: deps.folder, copyToClipboard: true },
      );
      log(
        outcome.ok
          ? `DEV SHOT ${JSON.stringify(outcome.value)}`
          : `DEV SHOT failed: ${outcome.error.message}`,
      );
    }
  } catch (error) {
    log(`DEV TOOL failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    deps.done();
  }
}
