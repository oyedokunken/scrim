/** The packaged policy. This list is the single source of truth for the renderer CSP. */
const PACKAGED_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream: scrim-media:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

// Directives that Chromium ignores, with a console error, when delivered in a meta tag.
const HEADER_ONLY = new Set(['frame-ancestors']);

export interface CspOptions {
  /** True when the renderer is served from the app protocol. False only for the dev server. */
  packaged: boolean;
  /** Drop directives a meta tag cannot carry. */
  forMeta?: boolean;
}

/**
 * Builds the Content Security Policy. The dev server needs inline styles and scripts (hot
 * reload) and a websocket, so it gets a looser policy. Packaged builds never do.
 */
export function buildCsp({ packaged, forMeta = false }: CspOptions): string {
  return PACKAGED_DIRECTIVES.filter(
    (directive) => !(forMeta && HEADER_ONLY.has(directive.split(' ')[0] ?? '')),
  )
    .map((directive) => {
      if (packaged) return directive;
      if (directive.startsWith('script-src')) return "script-src 'self' 'unsafe-inline'";
      if (directive.startsWith('style-src')) return "style-src 'self' 'unsafe-inline'";
      if (directive.startsWith('connect-src')) return "connect-src 'self' ws://localhost:*";
      return directive;
    })
    .join('; ');
}
