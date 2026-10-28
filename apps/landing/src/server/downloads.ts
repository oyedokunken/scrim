import 'server-only';
import { matchAsset } from '@/lib/asset-match';
import { downloadRequestSchema, fieldErrors, type DownloadResponse } from '@/lib/download-request';
import { clientIp, hashIp, truncateUserAgent } from './ip';
import type { LatestRelease } from './releases';

/** At most this many downloads from one network in an hour. */
export const HOURLY_LIMIT = 10;
/** The largest request body we read, in bytes. A real form is a few hundred. */
export const MAX_BODY_BYTES = 4096;
/** The version stored for someone who asked to hear about a system that has no installer yet. */
const WAITLIST_VERSION = 'waitlist';

export interface RecordEntry {
  email: string;
  name: string;
  updatesOptIn: boolean;
  os: 'windows' | 'macos' | 'linux';
  arch: 'x64' | 'arm64' | null;
  version: string;
  ipHash: string;
  userAgent: string | null;
}

/** What recording a download tells us, which the email needs. */
export interface RecordResult {
  downloadId: string;
  /** The token behind this person's unsubscribe link. */
  unsubscribeToken: string;
  /** True when this address was already emailed within the last hour. */
  emailedRecently: boolean;
}

/** What the handler needs from a database. */
export interface DownloadStore {
  countRecent(ipHash: string, since: Date): Promise<number>;
  record(entry: RecordEntry): Promise<RecordResult>;
  markEmailSent(downloadId: string): Promise<void>;
}

/** Everything needed to send the thank you email after the response has gone out. */
export interface EmailJob {
  to: string;
  name: string;
  os: 'windows' | 'macos' | 'linux';
  arch: 'x64' | 'arm64' | null;
  updatesOptIn: boolean;
  direct: boolean;
  filename: string;
  version: string;
  url: string;
  unsubscribeToken: string;
  downloadId: string;
}

export interface DownloadDeps {
  store: DownloadStore;
  getRelease: () => Promise<LatestRelease | null>;
  /** The secret that keys the IP hash. */
  ipSecret: string;
  releasesUrl: string;
  /** The site's own origin, for the same origin check. */
  siteOrigin: string;
  now?: () => Date;
  /** Called with a message that never carries personal data. */
  log?: (message: string) => void;
}

export interface HandlerInput {
  headers: Headers;
  bodyText: string;
}

export interface HandlerResult {
  status: number;
  body: DownloadResponse | { error: string; fields?: Record<string, string> };
  /** Present when a thank you email should be sent once the response is out. */
  email?: EmailJob;
}

function sameOrigin(headers: Headers, siteOrigin: string): boolean {
  const origin = headers.get('origin');
  if (origin === null) {
    return false;
  }
  try {
    const url = new URL(origin);
    return url.origin === siteOrigin || url.host === headers.get('host');
  } catch {
    return false;
  }
}

/**
 * The download request, start to finish. It validates, refuses abuse and works out which file to
 * send the visitor to. Keeping the count and the record is bookkeeping: if the database fails,
 * the visitor still gets their file. Nothing here logs a name, an email or an IP address.
 */
export async function handleDownloadRequest(
  { headers, bodyText }: HandlerInput,
  deps: DownloadDeps,
): Promise<HandlerResult> {
  const log = deps.log ?? (() => undefined);
  const now = deps.now?.() ?? new Date();

  if (!(headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return { status: 415, body: { error: 'Send the request as JSON.' } };
  }
  if (new TextEncoder().encode(bodyText).length > MAX_BODY_BYTES) {
    return { status: 413, body: { error: 'That request is too large.' } };
  }
  if (!sameOrigin(headers, deps.siteOrigin)) {
    return { status: 403, body: { error: 'This request must come from the Scrim website.' } };
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return { status: 400, body: { error: 'That request could not be read.' } };
  }
  const parsed = downloadRequestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: 'Check the form and try again.', fields: fieldErrors(parsed.error) },
    };
  }
  const request = parsed.data;

  // A person never sees the honeypot, so a filled one is a bot. It gets a normal looking answer
  // and nothing is stored, so it learns nothing.
  if (request.website !== undefined && request.website !== '') {
    return {
      status: 200,
      body: { url: deps.releasesUrl, filename: '', version: '', direct: false },
    };
  }

  const ipHash = hashIp(clientIp(headers), deps.ipSecret);

  try {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    if ((await deps.store.countRecent(ipHash, since)) >= HOURLY_LIMIT) {
      return {
        status: 429,
        body: { error: 'Too many downloads from this network. Please try again in an hour.' },
      };
    }
  } catch {
    log('Could not check the download rate limit.');
  }

  // Only Windows has an installer in version 1. Anyone else joins the update list instead: the row
  // is kept with the version "waitlist", so it is never counted as a download, and no file or
  // confirmation email goes out.
  if (request.os !== 'windows') {
    try {
      await deps.store.record({
        email: request.email,
        name: request.name,
        updatesOptIn: true,
        os: request.os,
        arch: request.arch ?? null,
        version: WAITLIST_VERSION,
        ipHash,
        userAgent: truncateUserAgent(headers.get('user-agent')),
      });
    } catch {
      log('Could not record a waitlist signup.');
    }
    return {
      status: 200,
      body: { url: deps.releasesUrl, filename: '', version: '', direct: false, comingSoon: true },
    };
  }

  const release = await deps.getRelease();
  const asset =
    release === null
      ? null
      : matchAsset(release.assets, {
          os: request.os,
          arch: request.arch,
          format: request.format,
        });

  let recorded: RecordResult | null = null;
  try {
    recorded = await deps.store.record({
      email: request.email,
      name: request.name,
      updatesOptIn: request.updatesOptIn,
      os: request.os,
      arch: request.arch ?? null,
      version: release?.version ?? 'unreleased',
      ipHash,
      userAgent: truncateUserAgent(headers.get('user-agent')),
    });
  } catch {
    log('Could not record a download.');
  }

  const body: DownloadResponse = {
    url: asset?.url ?? deps.releasesUrl,
    filename: asset?.name ?? '',
    version: release?.version ?? '',
    direct: asset !== null,
  };

  // The email needs the unsubscribe token, so it only goes out when the download was recorded.
  // It is at most one per address per hour, so the form cannot be used to flood someone.
  if (recorded === null || recorded.emailedRecently) {
    return { status: 200, body };
  }
  return {
    status: 200,
    body,
    email: {
      to: request.email,
      name: request.name,
      os: request.os,
      arch: request.arch ?? null,
      updatesOptIn: request.updatesOptIn,
      direct: body.direct,
      filename: body.filename,
      version: body.version,
      url: body.url,
      unsubscribeToken: recorded.unsubscribeToken,
      downloadId: recorded.downloadId,
    },
  };
}
