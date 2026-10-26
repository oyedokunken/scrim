import { shell } from 'electron';
import { isAllowedExternalUrl } from './external-urls';

export type OpenFn = (url: string) => Promise<void>;

/**
 * The one function that opens a link in the system browser. The window open handler and the
 * IPC channel both call it, so the allowlist cannot be skipped. Returns whether it opened.
 */
export async function openExternalChecked(
  url: string,
  open: OpenFn = (target) => shell.openExternal(target),
): Promise<boolean> {
  if (!isAllowedExternalUrl(url)) return false;
  await open(url);
  return true;
}
