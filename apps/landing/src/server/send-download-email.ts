import 'server-only';
import { renderDownloadEmail } from '@/emails/download-email';
import { renderOwnerEmail } from '@/emails/owner-email';
import { siteConfig } from '@/site.config';
import { SYSTEMS } from '@/lib/systems';
import type { EmailJob } from './downloads';
import type { MailTransport } from './mail';
import { sendEmail } from './mail';

export interface SendJobDeps {
  mail: MailTransport;
  from: string;
  replyTo: string;
  /** The site's public origin, for the privacy and unsubscribe links. */
  siteUrl: string;
  loadLogo: () => Promise<Uint8Array>;
  /** Called after the message is accepted, so the hourly limit can see it. */
  markSent: (downloadId: string) => Promise<void>;
}

/** The link in every email that unsubscribes a person from release notices. */
export function unsubscribeUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Builds and sends the thank you email for one download. It throws if the provider refuses the
 * message, and the caller turns that into a log line without personal data.
 */
export async function sendDownloadEmailJob(job: EmailJob, deps: SendJobDeps): Promise<void> {
  const system = SYSTEMS.find((candidate) => candidate.os === job.os);
  const link = unsubscribeUrl(deps.siteUrl, job.unsubscribeToken);

  const email = renderDownloadEmail({
    name: job.name,
    osName: system?.name ?? job.os,
    direct: job.direct,
    filename: job.filename,
    version: job.version,
    url: job.url,
    help: system?.help ?? [],
    siteUrl: deps.siteUrl,
    privacyUrl: `${deps.siteUrl}/privacy`,
    unsubscribeUrl: link,
    supportUrl: siteConfig.maltUrl,
  });

  await sendEmail(deps.mail, {
    to: job.to,
    from: deps.from,
    replyTo: deps.replyTo,
    email,
    unsubscribeUrl: link,
    logo: await deps.loadLogo(),
  });
  await deps.markSent(job.downloadId);
}

export interface OwnerNoteDeps {
  mail: MailTransport;
  from: string;
  /** The inbox that gets the note. */
  to: string;
  siteUrl: string;
  now?: () => Date;
}

const CHIPS = { x64: '64 bit Intel', arm64: 'Apple Silicon or Arm' } as const;

/** Tells the owner someone downloaded Scrim. It has no logo and no unsubscribe link. */
export async function sendOwnerNote(job: EmailJob, deps: OwnerNoteDeps): Promise<void> {
  const system = SYSTEMS.find((candidate) => candidate.os === job.os);
  const when = (deps.now?.() ?? new Date()).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const email = renderOwnerEmail({
    name: job.name,
    email: job.to,
    osName: system?.name ?? job.os,
    chip: job.arch === null ? '' : CHIPS[job.arch],
    version: job.version,
    filename: job.filename,
    direct: job.direct,
    updatesOptIn: job.updatesOptIn,
    when,
    siteUrl: deps.siteUrl,
  });
  await sendEmail(deps.mail, { to: deps.to, from: deps.from, replyTo: job.to, email });
}
