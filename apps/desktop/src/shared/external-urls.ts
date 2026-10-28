const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com']);
const REPO_PATH = '/oyedokunken/scrim';
// The owner's own site, root page only (owner decision, 2026-10-28).
const OWNER_HOSTS: ReadonlySet<string> = new Set(['www.oyedokun.dev', 'oyedokun.dev']);

/**
 * The only URLs `shell.openExternal` may open, over https with no explicit port and no embedded
 * credentials: the Scrim repository on GitHub, and the root page of the owner's site.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const github = ALLOWED_HOSTS.has(parsed.hostname);
    const owner = OWNER_HOSTS.has(parsed.hostname);
    if (parsed.protocol !== 'https:' || !(github || owner)) return false;
    if (parsed.port !== '' || parsed.username !== '' || parsed.password !== '') return false;
    // The parser drops a default port, so :443 looks like no port. Read the raw text as well.
    if (/^[a-z]+:\/\/[^/?#]*:/i.test(url)) return false;
    if (owner) return parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
    return parsed.pathname === REPO_PATH || parsed.pathname.startsWith(`${REPO_PATH}/`);
  } catch {
    return false;
  }
}
