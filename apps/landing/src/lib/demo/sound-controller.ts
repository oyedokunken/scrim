import { cuesBetween, type Cue } from './sound-cues';
import type { SoundEngine } from './sound';

/**
 * Holds the one decision that matters for sound: nothing is created, loaded or played until the
 * visitor has turned it on. The engine module is fetched only then, so the page stays light, and
 * the choice lives in memory only, with no cookie and no storage.
 */
export interface SoundController {
  /** True once the visitor has turned sound on and it has not been turned off. */
  readonly on: boolean;
  /** Turns sound on. Must be called from a click, because browsers block audio otherwise. */
  enable(): Promise<void>;
  /** Turns sound off and closes the audio context. */
  disable(): void;
  /** Plays the cues in the step from one frame to the next, while the video is running. */
  step(fromMs: number, toMs: number): void;
}

export function createSoundController(
  cues: readonly Cue[],
  load: () => Promise<SoundEngine | null>,
): SoundController {
  let engine: SoundEngine | null = null;
  let on = false;
  let generation = 0;

  return {
    get on() {
      return on;
    },
    async enable() {
      on = true;
      generation += 1;
      const mine = generation;
      const loaded = await load();
      if (mine !== generation) {
        // Turned off while the engine was loading.
        loaded?.close();
        return;
      }
      engine = loaded;
      if (loaded === null) {
        on = false;
      }
    },
    disable() {
      on = false;
      generation += 1;
      engine?.close();
      engine = null;
    },
    step(fromMs, toMs) {
      if (engine === null) {
        return;
      }
      for (const cue of cuesBetween(cues, fromMs, toMs)) {
        engine.play(cue.kind);
      }
    },
  };
}
