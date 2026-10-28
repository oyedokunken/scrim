/** The parts of the hero video, in the order people see them. */
export const STAGES = ['intro', 'words', 'demo', 'platforms', 'address'] as const;
export type Stage = (typeof STAGES)[number];

/** How long each timed card stays. The demo has no timer: it ends when the product demo ends. */
export const STAGE_MS = { intro: 1500, words: 2800, platforms: 3200 } as const;

/** The stage that follows a timed stage, or null when the stage ends some other way. */
export function stageAfterTimer(stage: Stage): Stage | null {
  switch (stage) {
    case 'intro':
      return 'words';
    case 'words':
      return 'demo';
    case 'platforms':
      return 'address';
    default:
      return null;
  }
}

/** The stage that follows the end of the product demo. */
export function stageAfterDemo(stage: Stage): Stage {
  return stage === 'demo' ? 'platforms' : stage;
}

/** The sentence that animates in on the second card, split so each word can arrive in turn. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}
