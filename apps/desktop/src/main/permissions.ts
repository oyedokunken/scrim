const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['media', 'display-capture']);

/**
 * Whether a URL belongs to the app's own origin. Malformed URLs are never ours.
 * Packaged pages load from disk, whose origin is opaque, so the app origin
 * `file://` matches any file URL.
 */
export function isOwnUrl(url: string, appOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return appOrigin === 'file://';
    return parsed.origin === appOrigin;
  } catch {
    return false;
  }
}

/** Allow only camera, microphone and screen capture, and only for our own page. */
export function isPermissionAllowed(
  permission: string,
  requestingUrl: string,
  appOrigin: string,
): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && isOwnUrl(requestingUrl, appOrigin);
}
