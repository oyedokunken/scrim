import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/emails/escape';
import { LOGO_CID, renderDownloadEmail, type DownloadEmailInput } from '@/emails/download-email';
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
  siteUrl: 'https://scrim.app',
  privacyUrl: 'https://scrim.app/privacy',
  unsubscribeUrl: `https://scrim.app/unsubscribe?token=${TOKEN}`,
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

  it('shows the logo as an inline attachment with a text alternative', () => {
    expect(LOGO_CID).toBe('scrim-logo');
    expect(email.html).toContain('src="cid:scrim-logo"');
    expect(email.html).toContain('alt="Scrim"');
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
      expect(body).toContain('https://scrim.app/privacy');
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
  when: '2026-11-02 09:30 UTC',
  siteUrl: 'https://scrim.app',
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
      '2026-11-02 09:30 UTC',
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
  const logo = new Uint8Array([137, 80, 78, 71]);

  it('sends the HTML and the text with the logo attached inline and an unsubscribe header', async () => {
    const { sent, transport } = fakeTransport();
    await sendEmail(transport, {
      to: 'ada@example.com',
      from: 'Scrim <hello@scrim.app>',
      replyTo: 'oyedokunken@gmail.com',
      email,
      unsubscribeUrl: input.unsubscribeUrl,
      logo,
    });
    const message = sent[0];
    expect(message?.to).toBe('ada@example.com');
    expect(message?.from).toBe('Scrim <hello@scrim.app>');
    expect(message?.replyTo).toBe('oyedokunken@gmail.com');
    expect(message?.subject).toBe('Thank you for downloading Scrim');
    expect(message?.html).toBe(email.html);
    expect(message?.text).toBe(email.text);
    expect(message?.headers).toEqual({ 'List-Unsubscribe': `<${input.unsubscribeUrl}>` });
    expect(message?.attachments).toHaveLength(1);
    expect(message?.attachments?.[0]).toMatchObject({
      cid: 'scrim-logo',
      contentType: 'image/png',
      contentDisposition: 'inline',
    });
  });

  it('adds no header and no attachment when it is given neither', async () => {
    const { sent, transport } = fakeTransport();
    await sendEmail(transport, { to: 'a@b.co', from: 'x@y.co', replyTo: 'x@y.co', email });
    expect(sent[0]?.headers).toBeUndefined();
    expect(sent[0]?.attachments).toEqual([]);
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
};

describe('unsubscribeUrl', () => {
  it('points at the unsubscribe page with the token', () => {
    expect(unsubscribeUrl('https://scrim.app', TOKEN)).toBe(
      `https://scrim.app/unsubscribe?token=${TOKEN}`,
    );
  });

  it('encodes a token that is not safe in a URL', () => {
    expect(unsubscribeUrl('https://scrim.app', 'a b&c')).toBe(
      'https://scrim.app/unsubscribe?token=a%20b%26c',
    );
  });
});

describe('sendDownloadEmailJob', () => {
  it('sends the thank you email and then marks the download as emailed', async () => {
    const { sent, transport } = fakeTransport();
    const marked: string[] = [];
    await sendDownloadEmailJob(job, {
      mail: transport,
      from: 'Scrim <hello@scrim.app>',
      replyTo: 'oyedokunken@gmail.com',
      siteUrl: 'https://scrim.app',
      loadLogo: () => Promise.resolve(new Uint8Array([1, 2, 3])),
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
      'List-Unsubscribe': `<https://scrim.app/unsubscribe?token=${TOKEN}>`,
    });
    expect(marked).toEqual(['download-1']);
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
        siteUrl: 'https://scrim.app',
        loadLogo: () => Promise.resolve(new Uint8Array()),
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
      from: 'Scrim <hello@scrim.app>',
      to: 'oyedokunken@gmail.com',
      siteUrl: 'https://scrim.app',
      now: () => new Date('2026-11-02T09:30:45Z'),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('oyedokunken@gmail.com');
    expect(sent[0]?.replyTo).toBe('ada@example.com');
    expect(sent[0]?.subject).toBe('New Scrim download for Windows');
    expect(textOf(sent[0]?.text)).toContain('When: 2026-11-02 09:30 UTC');
    expect(textOf(sent[0]?.text)).toContain('Windows, 64 bit Intel');
    expect(sent[0]?.headers).toBeUndefined();
    expect(sent[0]?.attachments).toEqual([]);
  });
});
