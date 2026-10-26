const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com']);
const REPO_PATH = '/oyedokunken/scrim';

/**
 * The only URLs `shell.openExternal` may open: the Scrim repository on GitHub, over https, with
 * no explicit port and no embedded credentials.
 */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return false;
    if (parsed.port !== '' || parsed.username !== '' || parsed.password !== '') return false;
    // The parser drops a default port, so :443 looks like no port. Read the raw text as well.
    if (/^[a-z]+:\/\/[^/?#]*:/i.test(url)) return false;
    return parsed.pathname === REPO_PATH || parsed.pathname.startsWith(`${REPO_PATH}/`);
  } catch {
    return false;
  }
}
