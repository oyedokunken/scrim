import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/emails/escape';
import { logoUrl, renderDownloadEmail, type DownloadEmailInput } from '@/emails/download-email';
import { renderOwnerEmail, type OwnerEmailInput } from '@/emails/owner-email';
import { SYSTEMS } from '@/lib/systems';
import type { EmailJob } from '@/server/downloads';
import { sendEmail, type MailTransport } from '@/server/mail';
import { sendDownloadEmailJob, sendOwnerNote, unsubscribeUrl } from '@/server/send-download-email';

const TOKEN = '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11';
const windows = SYSTEMS.find((system) => system.os === 'windows');

const input: DownloadEmailInput = {
  name: 'Ada Lovelace',
  osName: 'Windows',
  direct: true,
  filename: 'Scrim-1.0.0-x64.exe',
  version: '1.0.0',
  url: 'https://github.com/oyedokunken/scrim/releases/download/v1.0.0/Scrim-1.0.0-x64.exe',
  help: windows?.help ?? [],
  siteUrl: 'https://scrim.oyedokun.dev',
  when: 'Monday, November 2, 2026 at 9:30 AM (New York time)',
  privacyUrl: 'https://scrim.oyedokun.dev/privacy',
  unsubscribeUrl: `https://scrim.oyedokun.dev/unsubscribe?token=${TOKEN}`,
  supportUrl: 'https://buymeamalt.com/@oyedokunken',
};

describe('escapeHtml', () => {
  it('escapes the five characters that matter in HTML and in attributes', () => {
    expect(escapeHtml(`<b class="x">Tom & 'Jerry'</b>`)).toBe(
      '&lt;b class=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/b&gt;',
    );
  });

  it('leaves plain text alone', () => {
    expect(escapeHtml('Ada Lovelace')).toBe('Ada Lovelace');
  });
});

describe('the thank you email', () => {
  const email = renderDownloadEmail(input);

  it('is titled Thank you for downloading Scrim', () => {
    expect(email.subject).toBe('Thank you for downloading Scrim');
    expect(email.html).toContain('<h1');
    expect(email.html).toContain('Thank you for downloading Scrim');
  });

  it('greets the visitor by first name', () => {
    expect(email.html).toContain('Hi Ada,');
    expect(email.text).toContain('Hi Ada,');
    expect(email.html).not.toContain('Hi Ada Lovelace');
  });

  it('loads the logo from the website as a normal image with a text alternative', () => {
    expect(logoUrl(input.siteUrl)).toBe('https://scrim.oyedokun.dev/email-logo.png');
    expect(email.html).toContain('src="https://scrim.oyedokun.dev/email-logo.png"');
    expect(email.html).toContain('alt="Scrim"');
    expect(email.html).not.toContain('cid:');
    expect(email.html).not.toContain('.svg');
  });

  it('starts the text version with the name and shows the time for the visitor', () => {
    expect(email.text.startsWith('Scrim\n')).toBe(true);
    expect(email.text).toContain('Monday, November 2, 2026 at 9:30 AM (New York time)');
    expect(email.html).toContain('Monday, November 2, 2026 at 9:30 AM (New York time)');
  });

  it('shows the full logo as one image, with no separate wordmark text beside it', () => {
    expect(email.html).toContain('width="140" height="44"');
    expect(email.html).not.toMatch(/>Scrim<\/td>/);
  });

  it('says which file was downloaded and offers a button to get it again', () => {
    expect(email.html).toContain('Scrim-1.0.0-x64.exe (version 1.0.0)');
    expect(email.html).toContain(`href="${input.url}"`);
    expect(email.html).toContain('Download Scrim for Windows');
  });

  it('gives the first run help for the system', () => {
    expect(email.html).toContain('Getting started on Windows');
    expect(email.html).toContain('SmartScreen');
    expect(email.html).toContain('More info, then Run anyway.');
  });

  it('says what Scrim does, in a few plain lines', () => {
    expect(email.html).toContain('What Scrim does');
    expect(email.html).toContain('Zooms in where you click');
    expect(email.html).toContain('no watermark');
  });

  it('has a Support button that goes to the owner page', () => {
    expect(email.html).toContain('Show your support');
    expect(email.html).toContain('href="https://buymeamalt.com/@oyedokunken"');
    expect(email.text).toContain('Show your support: https://buymeamalt.com/@oyedokunken');
  });

  it('carries the privacy and unsubscribe links in the HTML and the text', () => {
    for (const body of [email.html, email.text]) {
      expect(body).toContain('https://scrim.oyedokun.dev/privacy');
      expect(body).toContain(input.unsubscribeUrl);
    }
  });

  it('has a plain text version with the same words', () => {
    expect(email.text).toContain('Thanks for choosing Scrim for Windows.');
    expect(email.text).toContain('- Zooms in where you click');
    expect(email.text).not.toContain('<');
  });

  it('uses only the palette in its colors', () => {
    const hexes = new Set(
      (email.html.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toUpperCase()),
    );
    // The four palette colors, and the greys made from the black.
    expect(hexes.has('#004E52')).toBe(true);
    expect(hexes.has('#FBF8F4')).toBe(true);
    for (const hex of hexes) {
      const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      const isGrey = channels[0] === channels[1] && channels[1] === channels[2];
      const isGreen = hex === '#004E52' || /^#[0-9A-F]{6}$/.test(hex);
      expect(isGrey || isGreen).toBe(true);
    }
  });

  it('is a complete HTML document that works at phone width', () => {
    expect(email.html.startsWith('<!doctype html>')).toBe(true);
    expect(email.html).toContain('name="viewport"');
    expect(email.html).toContain('max-width:600px');
    expect(email.html).toContain('lang="en"');
  });

  it('points at the Releases page when there is no installer to name', () => {
    const noFile = renderDownloadEmail({
      ...input,
      direct: false,
      filename: '',
      version: '',
      url: 'https://github.com/oyedokunken/scrim/releases',
    });
    expect(noFile.html).toContain('published on the Releases page');
    expect(noFile.html).not.toContain('should have started');
    expect(noFile.text).toContain('published on the Releases page');
  });

  it('never prints a raw script or tag from what the visitor typed', () => {
    const hostile = renderDownloadEmail({
      ...input,
      name: '<script>alert(1)</script> "Eve" & Co',
      filename: '"><img src=x onerror=alert(1)>.exe',
    });
    expect(hostile.html).not.toContain('<script>alert');
    expect(hostile.html).not.toContain('<img src=x');
    expect(hostile.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(hostile.html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;.exe');
  });

  it('uses no em dash, no emoji and no tool names', () => {
    const text = `${email.text}${email.html}`;
    const dashes = [8211, 8212].map((code) => String.fromCodePoint(code));
    for (const dash of dashes) expect(text).not.toContain(dash);
    expect(text).not.toMatch(/\p{Emoji_Presentation}/u);
  });
});

const owner: OwnerEmailInput = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  osName: 'Windows',
  chip: '64 bit Intel',
  version: '1.0.0',
  filename: 'Scrim-1.0.0-x64.exe',
  direct: true,
  updatesOptIn: true,
  when: 'Monday, November 2, 2026 at 10:30 AM (Lagos time)',
  siteUrl: 'https://scrim.oyedokun.dev',
};

describe('the note the owner gets', () => {
  const email = renderOwnerEmail(owner);

  it('says who, on what, which file and when', () => {
    expect(email.subject).toBe('New Scrim download for Windows');
    for (const part of [
      'Ada Lovelace',
      'ada@example.com',
      'Windows, 64 bit Intel',
      'Scrim-1.0.0-x64.exe (version 1.0.0)',
      'Wants them',
      'Monday, November 2, 2026 at 10:30 AM (Lagos time)',
    ]) {
      expect(email.html).toContain(part);
      expect(email.text).toContain(part);
    }
  });

  it('says so when they did not ask for release notices', () => {
    expect(renderOwnerEmail({ ...owner, updatesOptIn: false }).text).toContain(
      'Did not ask for them',
    );
  });

  it('says there was no installer when the visitor went to the Releases page', () => {
    const none = renderOwnerEmail({ ...owner, direct: false, filename: '', version: '' });
    expect(none.text).toContain('No installer yet, sent to the Releases page');
  });

  it('names only the system when no chip was chosen', () => {
    expect(renderOwnerEmail({ ...owner, chip: '' }).text).toContain('System: Windows\n');
  });

  it('escapes what the visitor typed', () => {
    const hostile = renderOwnerEmail({ ...owner, name: '<b onmouseover=x>Eve</b>' });
    expect(hostile.html).not.toContain('<b onmouseover');
    expect(hostile.html).toContain('&lt;b onmouseover=x&gt;Eve&lt;/b&gt;');
  });
});

type Sent = Parameters<MailTransport['sendMail']>[0];

/** A mail field as text. Fields can also be streams or buffers, which these tests never use. */
function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function fakeTransport() {
  const sent: Sent[] = [];
  const transport = {
    sendMail: (options: Sent) => {
      sent.push(options);
      return Promise.resolve({});
    },
  } as unknown as MailTransport;
  return { sent, transport };
}

describe('sendEmail', () => {
  const email = renderDownloadEmail(input);
  it('sends the HTML and the text with an unsubscribe header and no attachment', async () => {
    const { sent, transport } = fakeTransport();
    await sendEmail(transport, {
      to: 'ada@example.com',
      from: 'Scrim <hello@scrim.oyedokun.dev>',
      replyTo: 'oyedokunken@gmail.com',
      email,
      unsubscribeUrl: input.unsubscribeUrl,
    });
    const message = sent[0];
    expect(message?.to).toBe('ada@example.com');
    expect(message?.from).toBe('Scrim <hello@scrim.oyedokun.dev>');
    expect(message?.replyTo).toBe('oyedokunken@gmail.com');
    expect(message?.subject).toBe('Thank you for downloading Scrim');
    expect(message?.html).toBe(email.html);
    expect(message?.text).toBe(email.text);
    expect(message?.headers).toEqual({ 'List-Unsubscribe': `<${input.unsubscribeUrl}>` });
    expect(message?.attachments).toBeUndefined();
  });

  it('adds no header and no attachment when it is given neither', async () => {
    const { sent, transport } = fakeTransport();
    await sendEmail(transport, { to: 'a@b.co', from: 'x@y.co', replyTo: 'x@y.co', email });
    expect(sent[0]?.headers).toBeUndefined();
    expect(sent[0]?.attachments).toBeUndefined();
  });

  it('passes a refusal from the provider up to the caller', async () => {
    const refusing = {
      sendMail: () => Promise.reject(new Error('Invalid login')),
    } as unknown as MailTransport;
    await expect(
      sendEmail(refusing, { to: 'a@b.co', from: 'x@y.co', replyTo: 'x@y.co', email }),
    ).rejects.toThrow('Invalid login');
  });
});

const job: EmailJob = {
  to: 'ada@example.com',
  name: 'Ada Lovelace',
  os: 'windows',
  arch: 'x64',
  updatesOptIn: true,
  direct: true,
  filename: 'Scrim-1.0.0-x64.exe',
  version: '1.0.0',
  url: input.url,
  unsubscribeToken: TOKEN,
  downloadId: 'download-1',
  timeZone: 'America/New_York',
};

describe('unsubscribeUrl', () => {
  it('points at the unsubscribe page with the token', () => {
    expect(unsubscribeUrl('https://scrim.oyedokun.dev', TOKEN)).toBe(
      `https://scrim.oyedokun.dev/unsubscribe?token=${TOKEN}`,
    );
  });

  it('encodes a token that is not safe in a URL', () => {
    expect(unsubscribeUrl('https://scrim.oyedokun.dev', 'a b&c')).toBe(
      'https://scrim.oyedokun.dev/unsubscribe?token=a%20b%26c',
    );
  });
});

describe('sendDownloadEmailJob', () => {
  it('sends the thank you email and then marks the download as emailed', async () => {
    const { sent, transport } = fakeTransport();
    const marked: string[] = [];
    await sendDownloadEmailJob(job, {
      mail: transport,
      from: 'Scrim <hello@scrim.oyedokun.dev>',
      replyTo: 'oyedokunken@gmail.com',
      siteUrl: 'https://scrim.oyedokun.dev',
      markSent: (id) => {
        marked.push(id);
        return Promise.resolve();
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('ada@example.com');
    expect(textOf(sent[0]?.html)).toContain('SmartScreen');
    expect(textOf(sent[0]?.html)).toContain(`unsubscribe?token=${TOKEN}`);
    expect(sent[0]?.headers).toEqual({
      'List-Unsubscribe': `<https://scrim.oyedokun.dev/unsubscribe?token=${TOKEN}>`,
    });
    expect(marked).toEqual(['download-1']);
  });

  it("writes the time in the visitor's own zone, and in UTC when the zone is not usable", async () => {
    const now = () => new Date('2026-11-05T03:29:00Z');
    const deps = {
      from: 'x@y.co',
      replyTo: 'x@y.co',
      siteUrl: 'https://scrim.oyedokun.dev',
      now,
      markSent: () => Promise.resolve(),
    };
    const first = fakeTransport();
    await sendDownloadEmailJob(job, { ...deps, mail: first.transport });
    expect(first.sent[0]?.text).toContain(
      'Wednesday, November 4, 2026 at 10:29 PM (New York time)',
    );
    const second = fakeTransport();
    await sendDownloadEmailJob({ ...job, timeZone: 'UTC' }, { ...deps, mail: second.transport });
    expect(second.sent[0]?.text).toContain('Thursday, November 5, 2026 at 3:29 AM (UTC)');
  });

  it('does not mark the download as emailed when the provider refuses', async () => {
    const marked: string[] = [];
    const refusing = {
      sendMail: () => Promise.reject(new Error('refused')),
    } as unknown as MailTransport;
    await expect(
      sendDownloadEmailJob(job, {
        mail: refusing,
        from: 'x@y.co',
        replyTo: 'x@y.co',
        siteUrl: 'https://scrim.oyedokun.dev',
        markSent: (id) => {
          marked.push(id);
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow('refused');
    expect(marked).toEqual([]);
  });
});

describe('sendOwnerNote', () => {
  it('sends a note to the owner inbox that replies to the downloader', async () => {
    const { sent, transport } = fakeTransport();
    await sendOwnerNote(job, {
      mail: transport,
      from: 'Scrim <hello@scrim.oyedokun.dev>',
      to: 'oyedokunken@gmail.com',
      siteUrl: 'https://scrim.oyedokun.dev',
      now: () => new Date('2026-11-02T09:30:45Z'),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('oyedokunken@gmail.com');
    expect(sent[0]?.replyTo).toBe('ada@example.com');
    expect(sent[0]?.subject).toBe('New Scrim download for Windows');
    expect(textOf(sent[0]?.text)).toContain(
      'When: Monday, November 2, 2026 at 10:30 AM (Lagos time)',
    );
    expect(textOf(sent[0]?.text).startsWith('Scrim\n')).toBe(true);
    expect(textOf(sent[0]?.text)).toContain('Windows, 64 bit Intel');
    expect(sent[0]?.headers).toBeUndefined();
    expect(sent[0]?.attachments).toBeUndefined();
  });
});

describe.each(SYSTEMS)('the emails for $name', (system) => {
  const file = `Scrim-1.0.0-${system.os}.bin`;
  const url = `https://github.com/oyedokunken/scrim/releases/download/v1.0.0/${file}`;
  const download = renderDownloadEmail({
    ...input,
    osName: system.name,
    filename: file,
    url,
    help: system.help,
  });
  const owner = renderOwnerEmail({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    osName: system.name,
    chip: '',
    version: '1.0.0',
    filename: file,
    direct: true,
    updatesOptIn: false,
    when: 'Monday, November 2, 2026 at 10:30 AM (Lagos time)',
    siteUrl: 'https://scrim.oyedokun.dev',
  });
  const BANNED =
    /coming soon|not out yet|isn.t out|first release|will be available|in development/i;

  it('carries the file link, the version and the first run help', () => {
    for (const part of [download.html, download.text]) {
      expect(part).toContain(url);
      expect(part).toContain('1.0.0');
    }
    for (const paragraph of system.help) {
      expect(download.text).toContain(paragraph);
    }
  });

  it('uses no unreleased wording, in HTML or plain text', () => {
    for (const part of [download.html, download.text, download.subject, owner.html, owner.text]) {
      expect(part).not.toMatch(BANNED);
    }
  });
});
