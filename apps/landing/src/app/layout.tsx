import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@scrim/tokens/tokens.css';
import './globals.css';
import { BackToTop } from '@/components/back-to-top';
import { DownloadProvider } from '@/components/download/download-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getSiteEnv } from '@/server/env';
import { siteConfig } from '@/site.config';
import { urbanist } from './fonts';

export function generateMetadata(): Metadata {
  const { SITE_URL } = getSiteEnv();
  const title = `${siteConfig.name} | ${siteConfig.tagline}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${siteConfig.name}` },
    description: siteConfig.description,
    applicationName: siteConfig.name,
    authors: [{ name: siteConfig.author.name, url: siteConfig.author.url }],
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: siteConfig.name,
      title,
      description: siteConfig.description,
      url: '/',
      locale: 'en',
    },
    twitter: { card: 'summary_large_image', title, description: siteConfig.description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: '#FBF8F4',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <DownloadProvider>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter year={new Date().getFullYear()} />
          <BackToTop />
        </DownloadProvider>
      </body>
    </html>
  );
}
