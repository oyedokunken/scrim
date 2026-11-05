import type { ReactNode } from 'react';
import { BackToTop } from '@/components/back-to-top';
import { DownloadProvider } from '@/components/download/download-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** The header, footer and download dialog wrap every page except the 404, which stands alone. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <DownloadProvider>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter year={new Date().getFullYear()} />
        <BackToTop />
      </DownloadProvider>
    </>
  );
}
