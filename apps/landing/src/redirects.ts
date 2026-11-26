import { OFFICIAL_ORIGIN } from './lib/origins';

/** The address the site used before it had its own domain. Only this exact host is redirected. */
export const OLD_HOST = 'scriim.vercel.app';

/** The address the site had before www.usescrim.app. It now sends visitors to the official one. */
export const PREVIOUS_HOST = 'scrim.oyedokun.dev';

export { OFFICIAL_ORIGIN } from './lib/origins';

/**
 * Sends every path on an old address, with its query string, to the same path on the official
 * address with a 308. Each rule matches one exact host, so preview deployment addresses and the
 * official address itself are never redirected.
 */
export function oldAddressRedirects() {
  return [OLD_HOST, PREVIOUS_HOST].map((host) => ({
    source: '/:path*',
    has: [{ type: 'host' as const, value: host }],
    destination: `${OFFICIAL_ORIGIN}/:path*`,
    permanent: true,
  }));
}
