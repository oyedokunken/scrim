import type { RegionOutcome } from './region-selector';
import type { ScreenshotOptions, ScreenshotResult, ScreenshotSource } from './screenshot';
import type { SourceInfo } from './sources';
import type { Outcome } from './types';

/**
 * Ways to try the capture helpers before the home screen drives them, in a development run only:
 *
 *   SCRIM_DEV_TOOL=region    show the region overlays and log what was chosen
 *   SCRIM_DEV_TOOL=sources   log the screens and windows that can be recorded
 *   SCRIM_DEV_TOOL=shot      take a screenshot of the primary display into SCRIM_DEV_DEST
 *                            (or the system temp folder) and copy it to the clipboard
 *
 * They are removed once the home screen uses the same functions.
 */
export type DevTool = 'region' | 'sources' | 'shot';

export function readDevTool(
  env: Readonly<Record<string, string | undefined>>,
  isPackaged: boolean,
): DevTool | undefined {
  if (isPackaged) return undefined;
  const value = env['SCRIM_DEV_TOOL'];
  return value === 'region' || value === 'sources' || value === 'shot' ? value : undefined;
}

export interface DevToolDeps {
  pickRegion(): Promise<RegionOutcome>;
  listSources(): Promise<SourceInfo[]>;
  takeShot(
    source: ScreenshotSource,
    options: ScreenshotOptions,
  ): Promise<Outcome<ScreenshotResult>>;
  /** Where a screenshot is saved. */
  folder: string;
  log: (message: string) => void;
  /** Called when the tool is finished, so a development run can quit. */
  done(): void;
}

/** Runs one tool and always calls `done`. What it logs never includes a picture. */
export async function runDevTool(tool: DevTool, deps: DevToolDeps): Promise<void> {
  const { log } = deps;
  try {
    if (tool === 'region') {
      const outcome = await deps.pickRegion();
      log(`DEV REGION ${JSON.stringify(outcome)}`);
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
