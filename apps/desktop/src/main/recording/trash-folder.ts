export interface TrashDeps {
  /** Stops every render still working on this folder. */
  cancel: (folder: string) => void;
  /** True while a render still has files of this folder open. */
  busy: (folder: string) => boolean;
  trash: (folder: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
}

const WAIT_STEP_MS = 100;
const WAIT_STEPS = 100;
const TRY_AGAIN_MS = 300;
const TRIES = 4;

/**
 * Moves a recording folder to the recycle bin. A render that has just started holds files in it
 * open, and Windows then refuses with "Operation was aborted", so the render is stopped and given
 * time to let go first, and a refusal is tried again a few times before it is reported.
 */
export async function trashWhenFree(folder: string, deps: TrashDeps): Promise<void> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  deps.cancel(folder);
  for (let step = 0; step < WAIT_STEPS && deps.busy(folder); step += 1) await sleep(WAIT_STEP_MS);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await deps.trash(folder);
      return;
    } catch (error) {
      if (attempt >= TRIES) throw error;
      await sleep(TRY_AGAIN_MS);
    }
  }
}
