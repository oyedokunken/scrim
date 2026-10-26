import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * A keyed hash of an IP address. The same address always gives the same hash, which is what rate
 * limiting needs, but the hash cannot be turned back into the address without the secret.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

/** The visitor's IP address from the proxy headers, or "unknown". It is never stored or logged. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded !== undefined && forwarded !== '') {
    return forwarded;
  }
  const real = headers.get('x-real-ip')?.trim();
  return real !== undefined && real !== '' ? real : 'unknown';
}

/** The browser string cut to 200 characters, or null when there is none. */
export function truncateUserAgent(userAgent: string | null): string | null {
  const trimmed = userAgent?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, 200);
}
