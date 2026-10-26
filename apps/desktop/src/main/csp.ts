const PACKAGED_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

/**
 * Builds the Content Security Policy. The dev server needs inline styles and a
 * websocket for hot reload, so it gets a looser policy. Packaged builds never do.
 */
export function buildCsp(options: { packaged: boolean }): string {
  if (options.packaged) return PACKAGED_DIRECTIVES.join('; ');
  return PACKAGED_DIRECTIVES.map((directive) => {
    if (directive.startsWith('style-src')) return "style-src 'self' 'unsafe-inline'";
    if (directive.startsWith('connect-src')) return "connect-src 'self' ws://localhost:*";
    return directive;
  }).join('; ');
}
