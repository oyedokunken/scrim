# 0002. Content Security Policy for the landing page

Status: accepted

## Context

The landing page must send a strict Content Security Policy (CLAUDE.md, "Quality bars"). It must
also keep the marketing pages static, so Vercel serves them from the CDN and the Hobby plan limits
are not a worry.

Next.js has two ways to deal with the inline scripts it emits (the bootstrap and the streamed
flight data):

1. A nonce per request. This is the strictest option. A nonce has to be generated for every
   request, which forces every page that reads it to render dynamically. No page can be
   prerendered, the CDN cannot cache the HTML, and every visit runs a function.
2. A header set at build time with `'unsafe-inline'` for scripts. Pages stay static. Inline
   script is allowed, so the policy gives less protection against an injected script tag.

Hashes are not a practical third option. The inline script contents differ per page and per
build, and `next.config.ts` headers cannot be generated from build output.

## Decision

Use option 2, set in `next.config.ts` through `src/security-headers.ts`.

- `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`.
- `'unsafe-eval'` and `'wasm-unsafe-eval'` are never allowed. A unit test fails if either appears.
- Everything else is closed down: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`, and no third party origin in any directive.
  A unit test fails if a scheme or a wildcard appears.
- HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, a same origin
  `Cross-Origin-Opener-Policy` and `X-Frame-Options` are sent on every response.
- The development server sends no policy and no HSTS, because hot reload needs eval. Production
  builds never relax the policy.

## Consequences

- The marketing pages are prerendered and cached at the edge. Only the API routes run code.
- Inline script is allowed, so the policy is weaker against script injection than a nonce policy.
  The residual risk is small here. The site loads no third party script, renders no user
  supplied HTML, stores no sessions and sets no cookies. React escapes interpolated text, and the
  only user input is the download form, which is validated and never echoed into a page.
- If the site ever renders user supplied content, or gains a page that must read a nonce, revisit
  this decision. A nonce policy through `proxy.ts` is the upgrade path, and it will make the
  affected routes dynamic.
- Lighthouse reports an informational note that the policy is not effective against XSS because of
  `'unsafe-inline'`. It does not affect the Best Practices score. This is the accepted trade off.
