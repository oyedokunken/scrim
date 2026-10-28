import type { EditorApi } from '../editor/editor-api';

function words(error: { message: string; nextStep: string }): string {
  return `${error.message} ${error.nextStep}`;
}

/**
 * Maps the editor's view of the app onto the typed bridge. A failure becomes plain words for the page,
 * never a thrown error. The export panel is not wired here yet, so the editor shows none.
 */
export const editorApi: EditorApi = {
  async open(folder) {
    try {
      const result = await window.scrim.invoke('editor:open', { folder });
      return result.ok
        ? { ok: true, project: result.value }
        : { ok: false, message: words(result.error) };
    } catch {
      return { ok: false, message: 'Scrim could not open this recording. Try again.' };
    }
  },
  async saveEdits(folder, edits) {
    try {
      const result = await window.scrim.invoke('editor:save-edits', { folder, edits });
      return result.ok ? { ok: true } : { ok: false, message: words(result.error) };
    } catch {
      return { ok: false, message: 'Scrim could not save your edits. Try again.' };
    }
  },
};
