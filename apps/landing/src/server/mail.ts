import 'server-only';
import { createTransport, type Transporter } from 'nodemailer';
import { LOGO_CID, type RenderedEmail } from '@/emails/download-email';
import { getServerEnv } from './env';

/** The one piece of Nodemailer the sender needs, so tests can pass a stand in. */
export type MailTransport = Pick<Transporter, 'sendMail'>;

let transport: Transporter | undefined;

/**
 * One SMTP connection setup per process, built the first time it is needed from the environment.
 * Any SMTP provider works. For Gmail use smtp.gmail.com on port 465 with `SMTP_SECURE=true`, your
 * address as the user and an app password as the password.
 */
export function getTransport(): Transporter {
  if (transport === undefined) {
    const env = getServerEnv();
    transport = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER === '' ? undefined : { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transport;
}

export interface SendEmailInput {
  to: string;
  from: string;
  /** Where replies go. */
  replyTo: string;
  email: RenderedEmail;
  /** Adds a List-Unsubscribe header. Leave it out for mail that is not a notice. */
  unsubscribeUrl?: string | undefined;
  /** The logo as a PNG, attached so the HTML can show it inline. */
  logo?: Uint8Array | undefined;
}

/**
 * Sends one email. It carries an unsubscribe link in its headers, a reply address and the logo as
 * an inline attachment. It throws when the provider refuses the message, and the caller decides
 * what that means, because a failed email must never stop a download.
 */
export async function sendEmail(mail: MailTransport, input: SendEmailInput): Promise<void> {
  await mail.sendMail({
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.email.subject,
    text: input.email.text,
    html: input.email.html,
    ...(input.unsubscribeUrl === undefined
      ? {}
      : { headers: { 'List-Unsubscribe': `<${input.unsubscribeUrl}>` } }),
    attachments:
      input.logo === undefined
        ? []
        : [
            {
              filename: 'scrim.png',
              content: Buffer.from(input.logo),
              cid: LOGO_CID,
              contentType: 'image/png',
              contentDisposition: 'inline',
            },
          ],
  });
}
