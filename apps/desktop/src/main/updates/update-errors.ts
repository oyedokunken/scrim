import type { UpdateErrorKind } from '../../shared/updates-contract';

export interface UpdateFailure {
  kind: UpdateErrorKind;
  message: string;
  nextStep: string;
}

const OFFLINE = [
  'enotfound',
  'econnrefused',
  'etimedout',
  'enetunreach',
  'enetdown',
  'eai_again',
  'ehostunreach',
  'err_internet_disconnected',
  'err_name_not_resolved',
  'err_network_changed',
  'err_connection_refused',
  'err_connection_timed_out',
  'err_address_unreachable',
];

const BLOCKED = [
  'econnreset',
  'err_connection_reset',
  'err_proxy',
  'err_tunnel',
  'err_cert',
  'cert_',
  'self signed',
  'unable to verify the first certificate',
  'status code 403',
  'status code 429',
  'status code 407',
  'rate limit',
  'http 403',
  'http 429',
  ' 403 ',
  ' 429 ',
];

const TEXT: Readonly<Record<UpdateErrorKind, { message: string; nextStep: string }>> = {
  offline: {
    message: 'Scrim could not reach the update server.',
    nextStep: 'Check your internet connection and try again.',
  },
  blocked: {
    message: 'The update server did not answer.',
    nextStep:
      'A firewall, a proxy or GitHub itself may be blocking the request. Try again later. Your copy was not changed.',
  },
  checksum: {
    message: 'The downloaded update did not match its checksum, so it was thrown away.',
    nextStep: 'Nothing was changed. Try again, or download the installer from the website.',
  },
  signature: {
    message: 'The update is not signed by the publisher Scrim expects, so it was not installed.',
    nextStep: 'Nothing was changed. Download the installer from the website instead.',
  },
  'not-found': {
    message: 'No update information was found for the latest release.',
    nextStep: 'Try again later. Nothing was changed.',
  },
  unknown: {
    message: 'The update could not be completed.',
    nextStep: 'Nothing was changed. Try again.',
  },
};

function textOf(error: unknown, depth = 0): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    // Node's fetch hides the real reason, such as ECONNREFUSED, in the cause.
    const cause = depth < 2 ? textOf(error.cause, depth + 1) : '';
    return `${typeof code === 'string' ? code : ''} ${error.message} ${cause}`.toLowerCase();
  }
  return typeof error === 'string' ? error.toLowerCase() : '';
}

/**
 * Sorts an updater failure into a kind the person can act on. The updater's own text can hold
 * addresses and file names, so it is read here and never shown or logged: only the kind leaves.
 */
export function classifyUpdateError(error: unknown): UpdateFailure {
  const text = ` ${textOf(error)} `;
  let kind: UpdateErrorKind = 'unknown';
  if (text.includes('checksum') || text.includes('sha512') || text.includes('sha256')) {
    kind = 'checksum';
  } else if (
    text.includes('not signed') ||
    text.includes('signature') ||
    text.includes('publisher') ||
    text.includes('code sign')
  ) {
    kind = 'signature';
  } else if (OFFLINE.some((needle) => text.includes(needle))) {
    kind = 'offline';
  } else if (BLOCKED.some((needle) => text.includes(needle))) {
    kind = 'blocked';
  } else if (
    text.includes('status code 404') ||
    text.includes('cannot find latest') ||
    text.includes('latest.yml') ||
    text.includes('latest-mac.yml') ||
    text.includes('latest-linux.yml') ||
    text.includes('no published versions')
  ) {
    kind = 'not-found';
  }
  return { kind, ...TEXT[kind] };
}
