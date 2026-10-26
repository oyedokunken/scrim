import { blendOver, palette } from '@scrim/tokens';
import { escapeHtml } from './escape';
import type { RenderedEmail } from './download-email';

export interface OwnerEmailInput {
  /** What the visitor typed. */
  name: string;
  email: string;
  /** "Windows", "macOS" or "Linux". */
  osName: string;
  /** "64 bit Intel", "Apple Silicon" and so on, or an empty string when not chosen. */
  chip: string;
  version: string;
  filename: string;
  /** True when the installer itself was linked. */
  direct: boolean;
  updatesOptIn: boolean;
  /** When the download was asked for, as a readable UTC time. */
  when: string;
  siteUrl: string;
}

const GREEN = palette.green;
const BUTTER = palette.butter;
const BLACK = palette.black;
const WHITE = palette.white;
const SECONDARY = blendOver(BLACK, WHITE, 0.72);
const RULE = blendOver(BLACK, WHITE, 0.12);
const FONT = "-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * The note the owner gets for each download: who, on what system, which version. It is for one
 * person to read, so it is short and plain. Everything the visitor typed is escaped.
 */
export function renderOwnerEmail(input: OwnerEmailInput): RenderedEmail {
  const subject = `New Scrim download for ${input.osName}`;
  const rows: [string, string][] = [
    ['Name', input.name],
    ['Email', input.email],
    ['System', input.chip === '' ? input.osName : `${input.osName}, ${input.chip}`],
    [
      'File',
      input.direct
        ? `${input.filename}${input.version === '' ? '' : ` (version ${input.version})`}`
        : 'No installer yet, sent to the Releases page',
    ],
    ['Release notices', input.updatesOptIn ? 'Wants them' : 'Did not ask for them'],
    ['When', input.when],
  ];

  const text = [
    subject,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Scrim website: ${input.siteUrl}`,
    '',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BUTTER};font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BUTTER};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;">
            <tr>
              <td style="background:${GREEN};border-radius:20px 20px 0 0;padding:20px 28px;font-size:14px;font-weight:800;letter-spacing:0.02em;color:${WHITE};">New download</td>
            </tr>
            <tr>
              <td style="background:${WHITE};border:1px solid ${RULE};border-top:0;border-radius:0 0 20px 20px;padding:24px 28px;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:800;color:${BLACK};">${escapeHtml(subject)}</h1>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${rows
                    .map(
                      ([label, value]) => `<tr>
                    <td style="padding:10px 0;border-top:1px solid ${RULE};width:38%;font-size:14px;color:${SECONDARY};vertical-align:top;">${escapeHtml(label)}</td>
                    <td style="padding:10px 0;border-top:1px solid ${RULE};font-size:15px;font-weight:700;color:${BLACK};vertical-align:top;word-break:break-word;">${escapeHtml(value)}</td>
                  </tr>`,
                    )
                    .join('')}
                </table>
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
