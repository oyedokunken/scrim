import { OFFICIAL_ORIGIN } from './lib/origins';

/** The address the site used before it had its own domain. Only this exact host is redirected. */
export const OLD_HOST = 'scriim.vercel.app';

export { OFFICIAL_ORIGIN } from './lib/origins';

/**
 * Sends every path on the old address, with its query string, to the same path on the official
 * address with a 308. It matches the exact host only, so preview deployment addresses and the
 * official address itself are never redirected.
 */
export function oldAddressRedirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host' as const, value: OLD_HOST }],
      destination: `${OFFICIAL_ORIGIN}/:path*`,
      permanent: true,
    },
  ];
}
