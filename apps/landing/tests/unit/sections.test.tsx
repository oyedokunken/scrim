import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Contact } from '@/components/sections/contact';
import { Contribute } from '@/components/sections/contribute';
import { DownloadSection } from '@/components/sections/download-section';
import { Faq } from '@/components/sections/faq';
import { Features } from '@/components/sections/features';
import { FinalCta } from '@/components/sections/final-cta';
import { Hero } from '@/components/sections/hero';
import { RUN_COMMANDS } from '@/components/sections/run-commands';
import { UseCases } from '@/components/sections/use-cases';
import PrivacyPage from '@/app/privacy/page';
import { siteConfig } from '@/site.config';

const page = () =>
  [
    <Hero key="hero" />,
    <Features key="features" />,
    <UseCases key="use-cases" />,
    <DownloadSection key="download" release={null} />,
    <Faq key="faq" />,
    <Contribute key="contribute" />,
    <Contact key="contact" />,
    <FinalCta key="cta" />,
  ]
    .map((element) => renderToStaticMarkup(element))
    .join('');

describe('the home page sections', () => {
  const html = page();

  it('gives every nav link a real section to land on', () => {
    for (const item of siteConfig.nav) {
      const id = item.href.slice(1);
      expect(html, `section ${id}`).toContain(`id="${id}"`);
    }
  });

  it('gives the contact section an id too, because the footer links to it', () => {
    expect(html).toContain('id="contact"');
  });

  it('has exactly one h1', () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('labels every section with its own h2', () => {
    const sections = [...html.matchAll(/<section[^>]*aria-labelledby="([^"]+)"/g)];
    expect(sections.length).toBe(8);
    for (const [, labelId] of sections) {
      expect(html, `heading ${labelId ?? ''}`).toContain(`id="${labelId ?? ''}"`);
    }
  });

  it('never states a maximum resolution', () => {
    expect(html).not.toMatch(/\b(4k|8k|2160p?|3840|1440p|1080p|720p)\b/i);
  });

  it('never invents statistics, testimonials or user counts', () => {
    expect(html).not.toMatch(/\b\d[\d,]*\+?\s*(users|downloads|customers|stars|reviews)\b/i);
    expect(html).not.toMatch(/testimonial|trusted by|as seen on/i);
  });

  it('uses the new headline and the new supporting line in the hero', () => {
    expect(html).toContain('Record anything on your screen effortlessly');
    expect(siteConfig.tagline).toBe('Record anything on your screen effortlessly');
    expect(html).toContain('With Scrim, you can record your screen');
    expect(html).toContain('all on your computer.');
    expect(html).not.toContain('Screen capture that stays on your computer');
    expect(html).not.toContain('The desktop app is in development');
    expect(html).not.toContain('Project status');
    expect(html).not.toContain('Screen recorders should not make you sign in');
  });
});

describe('the sections in detail', () => {
  it('Features names the eight features and carries no status line', () => {
    const html = renderToStaticMarkup(<Features />);
    for (const name of [
      'Auto zoom',
      'One screen',
      'Cursor',
      'Face camera',
      'Backgrounds',
      'Trim and cut',
      'Export',
      'Shortcuts',
    ]) {
      expect(html).toContain(`<h3>${name}</h3>`);
    }
    expect(html).not.toContain('in development');
  });

  it('Use cases lists the six cases in the README wording', () => {
    const html = renderToStaticMarkup(<UseCases />);
    for (const text of [
      'Tutorials',
      'Show each step, with the clicks people need to copy.',
      'Product demos',
      'Walk customers through a feature with your face on screen.',
      'Teaching',
      'Record lessons students can pause and follow.',
      'Bug reports',
      'Show exactly what went wrong instead of describing it.',
      'Sales and support',
      'Answer questions with a quick, personal video.',
      'Personal',
      'Help family with their PC, or save a moment from your screen.',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('Who it');
  });

  it('Download shows no status line when no release can be read', () => {
    const html = renderToStaticMarkup(<DownloadSection release={null} />);
    expect(html).not.toContain('Every build of Scrim');
    expect(html).not.toContain('Open the Releases page');
    expect(html).not.toContain('not out yet');
    expect(html).toContain('Download Scrim');
  });

  it('Download shows the version and the date when a release exists', () => {
    const html = renderToStaticMarkup(
      <DownloadSection
        release={{
          version: '1.2.3',
          url: 'https://github.com/oyedokunken/scrim/releases/tag/v1.2.3',
          publishedAt: '2026-11-02T09:30:00Z',
        }}
      />,
    );
    expect(html).toContain('Version 1.2.3');
    expect(html).toContain('2 November 2026');
    expect(html).not.toContain('Every build of Scrim');
  });

  it('Download has three system blocks, with Windows downloadable and the others coming soon', () => {
    const html = renderToStaticMarkup(<DownloadSection release={null} />);
    for (const name of ['Windows', 'macOS', 'Linux']) {
      expect(html).toContain(`<h3>${name}</h3>`);
    }
    expect(html).toContain('Download for Windows');
    expect(html).not.toContain('Download for macOS');
    expect(html).not.toContain('Download for Linux');
    expect(html.match(/Coming soon/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html.match(/Email me when it is ready/g)).toHaveLength(2);
    expect(html.match(/<details/g)).toHaveLength(3);
    expect(html.match(/Need help\?/g)).toHaveLength(3);
    expect(html).not.toContain('First run help');
    expect(html.match(/<svg/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it('Faq renders twelve questions in two columns of six, in order', () => {
    const html = renderToStaticMarkup(<Faq />);
    expect(html.match(/<details/g)).toHaveLength(12);
    // The container plus two columns, each holding six questions.
    expect(html.match(/class="[^"]*column[^"]*"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(html.indexOf('Is Scrim free?')).toBeLessThan(
      html.indexOf('Where are my recordings saved?'),
    );
  });

  it('Contribute has the links and the commands to run the app, and no status table', () => {
    const html = renderToStaticMarkup(<Contribute />);
    for (const href of [
      siteConfig.repoUrl,
      siteConfig.contributingUrl,
      siteConfig.issuesUrl,
      siteConfig.goodFirstIssuesUrl,
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain('pnpm install');
    expect(html).toContain('pnpm dev');
    expect(html).not.toContain('pnpm dev:landing');
    expect(html).not.toContain('pnpm db:up');
    expect(html).not.toContain('landing');
    expect(html).toContain('Copy commands');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('In progress');
    expect(html).toContain('Run the app on your own computer');
    expect(RUN_COMMANDS.split('\n')).toEqual([
      'git clone https://github.com/oyedokunken/scrim.git',
      'cd scrim',
      'pnpm install',
      'pnpm dev',
    ]);
  });

  it('Contact offers the issues and the security policy, no email and no form', () => {
    const html = renderToStaticMarkup(<Contact />);
    expect(html).not.toContain('hello@scrim.app');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('gmail.com');
    expect(html).toContain(`href="${siteConfig.issuesUrl}"`);
    expect(html).toContain(`href="${siteConfig.securityUrl}"`);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toMatch(/within \d+|24 hours|business days/i);
  });

  it('the final call to action is decoration plus real links with logos, and all CSS', () => {
    const html = renderToStaticMarkup(<FinalCta />);
    expect(html).toContain('Make your next screen recording count.');
    for (const name of ['Windows', 'macOS', 'Linux']) {
      expect(html).toContain(`</svg>${name}</a>`);
    }
    expect(html).not.toContain('<script');
    expect(html.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThan(6);
  });
});

describe('the privacy page', () => {
  const html = renderToStaticMarkup(<PrivacyPage />);

  it('is one article with one h1 and a last updated date', () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain('Last updated');
    expect(html).toContain('<time dateTime="2026-10-28">28 October 2026</time>');
  });

  it('lists everything the download form stores, and nothing else', () => {
    for (const item of [
      'Your name and your email address.',
      'The system you chose to download for, and its architecture.',
      'The version of the app you downloaded.',
      'A hashed copy of your IP address.',
      'The first 200 characters of your browser string.',
      'The time of the download.',
    ]) {
      expect(html).toContain(item);
    }
  });

  it('says what it does not collect', () => {
    expect(html).toContain('No analytics');
    expect(html).toContain('No cookies');
    expect(html).toContain('No third party scripts');
    expect(html).toContain('Nothing from your recordings');
  });

  it('names the processors and uses the neutral retention sentence', () => {
    expect(html).toContain('Supabase hosts the database.');
    expect(html).toContain('Vercel hosts the website.');
    expect(html).toContain('We will name it here once it is chosen.');
    expect(html).toContain(
      'We keep download records only as long as we need them to count downloads and send release notices. You can ask us to delete yours at any time.',
    );
  });

  it('says how to ask for access or deletion and how to unsubscribe', () => {
    expect(html).toContain('href="mailto:oyedokunken@gmail.com"');
    expect(html).toContain('unsubscribe link');
    expect(html).not.toContain('hello@scrim.app');
  });

  it('mentions the note sent to the site owner', () => {
    expect(html).toContain('a short note that a download happened');
  });

  it('cites no laws and makes no legal claims', () => {
    expect(html).not.toMatch(/GDPR|NDPR|NDPA|CCPA|HIPAA|legal(ly)? (bound|compliant)/i);
  });
});
