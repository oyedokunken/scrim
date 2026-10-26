import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from '@playwright/test';
import { LOGO_CID, renderDownloadEmail } from '@/emails/download-email';
import { renderOwnerEmail } from '@/emails/owner-email';
import { MarkSvg } from '@/lib/mark-svg';
import { SYSTEMS } from '@/lib/systems';

// Renders the real email templates in a browser and saves pictures of them, so they can be
// reviewed without sending anything. Run on demand:
//   SCREENSHOTS=1 pnpm exec playwright test emails --project=desktop
// Images go to test-results/screenshots. In a real email the logo is an inline attachment. Here
// it is swapped for the same mark as an inline image, because there is no mail client.
test.skip(process.env.SCREENSHOTS !== '1', 'Set SCREENSHOTS=1 to render the emails.');

const logo = `data:image/svg+xml;base64,${Buffer.from(
  renderToStaticMarkup(createElement(MarkSvg, { size: 44 })),
).toString('base64')}`;

const withLogo = (html: string) => html.replace(`cid:${LOGO_CID}`, logo);

const windows = SYSTEMS.find((system) => system.os === 'windows');

test('the email a downloader gets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One width is enough.');
  const email = renderDownloadEmail({
    name: 'Ada Lovelace',
    osName: 'Windows',
    direct: true,
    filename: 'Scrim-1.0.0-x64.exe',
    version: '1.0.0',
    url: 'https://github.com/oyedokunken/scrim/releases/download/v1.0.0/Scrim-1.0.0-x64.exe',
    help: windows?.help ?? [],
    siteUrl: 'https://scrim.app',
    privacyUrl: 'https://scrim.app/privacy',
    unsubscribeUrl: 'https://scrim.app/unsubscribe?token=3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11',
    supportUrl: 'https://buymeamalt.com/@oyedokunken',
  });
  await page.setViewportSize({ width: 700, height: 900 });
  await page.setContent(withLogo(email.html));
  await page.screenshot({ path: 'test-results/screenshots/email-downloader.png', fullPage: true });
});

test('the note the owner gets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One width is enough.');
  const email = renderOwnerEmail({
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
  });
  await page.setViewportSize({ width: 620, height: 700 });
  await page.setContent(email.html);
  await page.screenshot({ path: 'test-results/screenshots/email-owner.png', fullPage: true });
});
