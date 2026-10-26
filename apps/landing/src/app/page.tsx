import { Contact } from '@/components/sections/contact';
import { Contribute } from '@/components/sections/contribute';
import { DownloadSection } from '@/components/sections/download-section';
import { Faq } from '@/components/sections/faq';
import { Features } from '@/components/sections/features';
import { FinalCta } from '@/components/sections/final-cta';
import { Hero } from '@/components/sections/hero';
import { UseCases } from '@/components/sections/use-cases';
import { serializeJsonLd, softwareApplicationJsonLd } from '@/lib/json-ld';
import { getSiteEnv } from '@/server/env';
import { fetchLatestRelease } from '@/server/releases';
import { siteConfig } from '@/site.config';

// The download section shows the latest release, so the page regenerates every 5 minutes and
// updates after a release without a redeploy. Segment config must be a literal. A test keeps
// this equal to RELEASE_REVALIDATE_SECONDS.
export const revalidate = 300;

export default async function HomePage() {
  // Never throws and gives up after a short timeout, so GitHub cannot block the page.
  const release = await fetchLatestRelease();
  const { SITE_URL } = getSiteEnv();
  const structuredData = softwareApplicationJsonLd({
    name: siteConfig.name,
    description: siteConfig.description,
    siteUrl: SITE_URL,
    licenseUrl: siteConfig.licenseUrl,
    author: siteConfig.author,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Hero />
      <Features />
      <UseCases />
      <DownloadSection release={release} />
      <Faq />
      <Contribute />
      <Contact />
      <FinalCta />
    </>
  );
}
