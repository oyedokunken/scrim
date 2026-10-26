export const APP_SCHEME = 'app';
export const APP_HOST = 'scrim';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

export type RendererTarget =
  { kind: 'app'; url: string; origin: string } | { kind: 'dev'; url: string; origin: string };

/**
 * Scheme plus host. Node reports an opaque origin for custom schemes, so the origin is built
 * by hand. A file URL has no host and never matches the app origin.
 */
export function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

/**
 * Where the renderer loads from, and so the one allowed origin for navigation, permissions
 * and IPC sender checks. The dev server is used only in an unpackaged app that was started
 * with a dev server URL. Everything else is served from the app protocol.
 */
export function resolveRendererTarget(input: {
  isPackaged: boolean;
  devUrl: string | undefined;
}): RendererTarget {
  if (!input.isPackaged && input.devUrl) {
    return { kind: 'dev', url: input.devUrl, origin: originOf(input.devUrl) };
  }
  return { kind: 'app', url: APP_ENTRY_URL, origin: APP_ORIGIN };
}
