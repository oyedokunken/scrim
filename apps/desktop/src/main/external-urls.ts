const ALLOWED_HOSTS: ReadonlySet<string> = new Set(['github.com', 'www.github.com']);
const REPO_PATH = '/oyedokunken/scrim';

/** The only URLs `shell.openExternal` may open: the Scrim repository on GitHub. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return false;
    return parsed.pathname === REPO_PATH || parsed.pathname.startsWith(`${REPO_PATH}/`);
  } catch {
    return false;
  }
}
