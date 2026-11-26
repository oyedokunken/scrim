/** The one official address of the site. */
export const OFFICIAL_ORIGIN = 'https://www.usescrim.app';

/**
 * Every address the site answers on, apart from the one in SITE_URL: the official address, the bare
 * domain that sends visitors to it, and the address the site used before the domain. A request
 * from any of them may call the API. Anything else is refused.
 */
export const KNOWN_ORIGINS: readonly string[] = [
  OFFICIAL_ORIGIN,
  'https://usescrim.app',
  'https://scrim.oyedokun.dev',
];

/**
 * True when the request comes from this site: its Origin header names the configured address, one
 * of the known addresses or the host that received the request. A request with no Origin header,
 * or a foreign one, is not from this site.
 */
export function isOwnOrigin(headers: Headers, siteOrigin: string): boolean {
  const origin = headers.get('origin');
  if (origin === null) {
    return false;
  }
  try {
    const url = new URL(origin);
    return (
      url.origin === siteOrigin ||
      KNOWN_ORIGINS.includes(url.origin) ||
      url.host === headers.get('host')
    );
  } catch {
    return false;
  }
}
