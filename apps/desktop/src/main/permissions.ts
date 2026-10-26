import { originOf } from './renderer-target';

const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'display-capture']);

/** Whether a URL belongs to the app's own origin. Malformed URLs are never ours. */
export function isOwnUrl(url: string, appOrigin: string): boolean {
  const origin = originOf(url);
  return origin !== '' && origin === appOrigin;
}

/** Allow only camera, microphone and screen capture, and only for our own page. */
export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  appOrigin: string,
): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && isOwnUrl(requestingUrl, appOrigin);
}
