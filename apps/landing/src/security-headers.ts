export interface HeaderEntry {
  key: string;
  value: string;
}

/**
 * The Content Security Policy. See docs/adr/0002-landing-csp.md for why scripts and styles allow
 * inline code (it keeps the marketing pages static) and why eval is never allowed.
 */
export function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'media-src': ["'self'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'upgrade-insecure-requests': [],
  };
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ');
}

/**
 * Headers for every response. The development server needs eval for hot reload, so it gets no
 * Content Security Policy. Production never allows eval.
 */
export function securityHeaders(isProduction: boolean): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
  if (isProduction) {
    headers.push(
      { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    );
  }
  return headers;
}
