import { blendOver, palette } from '@scrim/tokens';
import { escapeHtml } from './escape';

/** The content id the logo is attached under, so the HTML can show it inline. */
export const LOGO_CID = 'scrim-logo';

export interface DownloadEmailInput {
  /** The name the visitor gave. */
  name: string;
  /** "Windows", "macOS" or "Linux". */
  osName: string;
  /** True when the installer itself was linked, false when it is on the Releases page. */
  direct: boolean;
  filename: string;
  version: string;
  /** Where the button goes. */
  url: string;
  /** Short help for the first run on this system. */
  help: readonly string[];
  siteUrl: string;
  privacyUrl: string;
  unsubscribeUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// Email cannot use CSS variables, so the palette is spelled out. The greys are the black mixed
// into white and butter, as on the website.
const GREEN = palette.green;
const BUTTER = palette.butter;
const BLACK = palette.black;
const WHITE = palette.white;
const SECONDARY = blendOver(BLACK, WHITE, 0.72);
const RULE = blendOver(BLACK, WHITE, 0.12);
const TINT = blendOver(GREEN, BUTTER, 0.1);

const FONT = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const FEATURES = [
  'Zooms in where you click, follows your cursor, then eases back out.',
  'Puts a halo on your cursor and a ripple on every click.',
  'Puts your face in a bubble you can drag, resize and snap to a corner.',
  'Exports a clean MP4 with no watermark. Your recordings never leave your computer.',
] as const;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function opening(input: DownloadEmailInput): string {
  return input.direct
    ? `Your download of ${input.filename}${input.version === '' ? '' : ` (version ${input.version})`} should have started. If it did not, use the button below.`
    : `The installer for ${input.osName} is published on the Releases page. Use the button below to open it.`;
}

/**
 * The thank you email for someone who downloaded Scrim. It comes as HTML and as plain text with
 * the same words. Everything the visitor typed is escaped before it goes into the HTML.
 */
export function renderDownloadEmail(input: DownloadEmailInput): RenderedEmail {
  const subject = 'Thank you for downloading Scrim';
  const first = firstName(input.name);
  const intro = `Thanks for choosing Scrim for ${input.osName}. We made it so a clear screen recording is simple, and so it stays on your computer.`;
  const button = `Download Scrim for ${input.osName}`;
  const gettingStarted = `Getting started on ${input.osName}`;
  const questions =
    'Reply to this email with a question, a bug or an idea. It reaches the person who builds Scrim.';
  const why =
    'You are getting this email because you downloaded Scrim from our website. We keep your name, your email and a few details about the download only to count downloads, as the privacy policy explains.';

  const text = [
    subject,
    '',
    `Hi ${first},`,
    '',
    intro,
    '',
    opening(input),
    `${button}: ${input.url}`,
    '',
    gettingStarted,
    ...input.help.map((line) => `- ${line}`),
    '',
    'What Scrim does',
    ...FEATURES.map((line) => `- ${line}`),
    '',
    questions,
    '',
    '--',
    why,
    `Privacy policy: ${input.privacyUrl}`,
    `Unsubscribe from release notices: ${input.unsubscribeUrl}`,
    'Scrim is free and open source.',
    '',
  ].join('\n');

  const paragraph = (content: string, extra = '') =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BLACK};${extra}">${content}</p>`;
  const heading = (content: string) =>
    `<h2 style="margin:32px 0 12px;font-size:18px;line-height:1.3;font-weight:800;color:${BLACK};">${escapeHtml(content)}</h2>`;
  const bullets = (items: readonly string[]) =>
    `<ul style="margin:0 0 8px;padding:0 0 0 20px;color:${BLACK};">${items
      .map(
        (item) =>
          `<li style="margin:0 0 8px;font-size:16px;line-height:1.5;color:${BLACK};">${escapeHtml(item)}</li>`,
      )
      .join('')}</ul>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BUTTER};font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BUTTER};">
      ${escapeHtml(opening(input))}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BUTTER};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
            <tr>
              <td style="padding:0 0 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <img src="cid:${LOGO_CID}" width="44" height="44" alt="Scrim" style="display:block;border:0;border-radius:11px;" />
                    </td>
                    <td style="vertical-align:middle;font-size:26px;font-weight:800;letter-spacing:-0.04em;color:${BLACK};">Scrim</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:${WHITE};border:1px solid ${RULE};border-radius:20px;padding:36px 32px;">
                <h1 style="margin:0 0 20px;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:${BLACK};">${escapeHtml(subject)}</h1>
                ${paragraph(`Hi ${escapeHtml(first)},`)}
                ${paragraph(escapeHtml(intro))}
                ${paragraph(escapeHtml(opening(input)))}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;">
                  <tr>
                    <td style="background:${GREEN};border-radius:999px;">
                      <a href="${escapeHtml(input.url)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:800;line-height:1.2;color:${WHITE};text-decoration:none;">${escapeHtml(button)}</a>
                    </td>
                  </tr>
                </table>
                ${heading(gettingStarted)}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:${TINT};border-left:4px solid ${GREEN};padding:14px 18px;">
                      ${input.help
                        .map(
                          (line, index) =>
                            `<p style="margin:0${index === input.help.length - 1 ? '' : ' 0 10px'};font-size:15px;line-height:1.55;color:${BLACK};">${escapeHtml(line)}</p>`,
                        )
                        .join('')}
                    </td>
                  </tr>
                </table>
                ${heading('What Scrim does')}
                ${bullets(FEATURES)}
                ${heading('Questions?')}
                ${paragraph(escapeHtml(questions))}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 0;">
                <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${SECONDARY};">${escapeHtml(why)}</p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${SECONDARY};">
                  <a href="${escapeHtml(input.privacyUrl)}" style="color:${GREEN};">Privacy policy</a>
                  &nbsp;&middot;&nbsp;
                  <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${GREEN};">Unsubscribe from release notices</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:${SECONDARY};">Scrim is free and open source.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  return { subject, text, html };
}
