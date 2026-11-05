import type { ReactNode } from 'react';
import { BackToTop } from '@/components/back-to-top';
import { DownloadProvider } from '@/components/download/download-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { fetchLatestRelease } from '@/server/releases';

/** The header, footer and download dialog wrap every page except the 404, which stands alone. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  // Never throws and gives up after a short timeout, so GitHub cannot block a page.
  const release = await fetchLatestRelease();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <DownloadProvider>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter year={new Date().getFullYear()} version={release?.version ?? null} />
        <BackToTop />
      </DownloadProvider>
    </>
  );
}
