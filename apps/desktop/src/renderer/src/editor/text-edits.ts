import { cleanText, newTextItem, tidyTexts, type TextItem } from '@scrim/core/render';
import type { Edits } from './edits';

/** The texts of the edits, tidied. Empty when none were added. */
export function textsOf(edits: Edits): readonly TextItem[] {
  return edits.texts ?? [];
}

function withTexts(edits: Edits, texts: TextItem[]): Edits {
  const rest: Edits = { ...edits };
  delete rest.texts;
  return texts.length === 0 ? rest : { ...rest, texts };
}

/** Adds a text at the playhead and returns the new edits and the id of the new item. */
export function addText(
  edits: Edits,
  id: string,
  playheadMs: number,
  durationMs: number,
): { edits: Edits; id: string } {
  const item = newTextItem(id, playheadMs, durationMs);
  return { edits: withTexts(edits, tidyTexts([...textsOf(edits), item], durationMs)), id };
}

/** Changes one item, then clamps it back into the recording and the frame. */
export function updateText(
  edits: Edits,
  id: string,
  patch: Partial<Omit<TextItem, 'id'>>,
  durationMs: number,
): Edits {
  // Clearing the field must not delete the item: the old words stay until new ones are typed.
  const safe = { ...patch };
  if (patch.text !== undefined && cleanText(patch.text) === '') delete safe.text;
  const next = textsOf(edits).map((item) => (item.id === id ? { ...item, ...safe } : item));
  return withTexts(edits, tidyTexts(next, durationMs));
}

export function deleteText(edits: Edits, id: string): Edits {
  return withTexts(
    edits,
    textsOf(edits).filter((item) => item.id !== id),
  );
}

/** A new id that no item uses yet. */
export function freshTextId(edits: Edits): string {
  const used = new Set(textsOf(edits).map((item) => item.id));
  for (let n = 1; ; n += 1) {
    const id = `text-${String(n)}`;
    if (!used.has(id)) return id;
  }
}
