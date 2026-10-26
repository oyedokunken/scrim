import { after } from 'next/server';
import { prismaDownloadStore } from '@/server/download-store';
import { MAX_BODY_BYTES, handleDownloadRequest } from '@/server/downloads';
import { getServerEnv } from '@/server/env';
import { getTransport } from '@/server/mail';
import { loadMailLogo } from '@/server/mail-logo';
import { fetchLatestRelease } from '@/server/releases';
import { sendDownloadEmailJob, sendOwnerNote } from '@/server/send-download-email';
import { siteConfig } from '@/site.config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Records a download and answers with the file to fetch. All the logic is in `server/downloads`. */
export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) {
    return Response.json({ error: 'That request is too large.' }, { status: 413 });
  }

  const env = getServerEnv();
  const store = prismaDownloadStore();
  const result = await handleDownloadRequest(
    { headers: request.headers, bodyText: await request.text() },
    {
      store,
      getRelease: () => fetchLatestRelease(),
      ipSecret: env.IP_HASH_SECRET,
      releasesUrl: siteConfig.releasesUrl,
      siteOrigin: new URL(env.SITE_URL).origin,
      log: (message) => {
        console.warn(message);
      },
    },
  );

  // The email goes out after the response, so the visitor never waits on the mail provider. A
  // failed email is logged without any personal data and never touches the download.
  const job = result.email;
  if (job !== undefined) {
    after(async () => {
      try {
        await sendDownloadEmailJob(job, {
          mail: getTransport(),
          from: env.MAIL_FROM,
          replyTo: siteConfig.contactInbox,
          siteUrl: env.SITE_URL,
          loadLogo: loadMailLogo,
          markSent: (downloadId) => store.markEmailSent(downloadId),
        });
      } catch {
        console.warn('Could not send the download email.');
      }
      try {
        await sendOwnerNote(job, {
          mail: getTransport(),
          from: env.MAIL_FROM,
          to: siteConfig.contactInbox,
          siteUrl: env.SITE_URL,
        });
      } catch {
        console.warn('Could not send the owner note.');
      }
    });
  }

  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
