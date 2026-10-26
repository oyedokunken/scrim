/** What a copy attempt achieved. */
export type CopyResult = 'copied' | 'selected' | 'failed';

export interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/**
 * Copies text with the Clipboard API. When the browser blocks it (an insecure page, a denied
 * permission), it calls `fallback`, which should select the text so the visitor can copy it with
 * the keyboard, and reports `selected` so the interface can say so.
 */
export async function copyText(
  text: string,
  clipboard: ClipboardLike | undefined,
  fallback: () => boolean,
): Promise<CopyResult> {
  if (clipboard !== undefined) {
    try {
      await clipboard.writeText(text);
      return 'copied';
    } catch {
      // Blocked or unavailable. Fall through to selecting the text.
    }
  }
  return fallback() ? 'selected' : 'failed';
}

/** The message shown, and spoken through the live region, for each result. */
export function copyMessage(result: CopyResult | null): string {
  switch (result) {
    case 'copied':
      return 'Copied';
    case 'selected':
      return 'Selected. Press Ctrl+C or Cmd+C to copy';
    case 'failed':
      return 'Could not copy. Select the commands by hand';
    case null:
      return '';
  }
}
