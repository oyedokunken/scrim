import 'server-only';
import { renderDownloadEmail } from '@/emails/download-email';
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
