import type { Metadata } from 'next';
import { siteConfig } from '@/site.config';

interface PageMetadataInput {
  /** The page title, without the site name. */
  title: string;
  description: string;
  /** The path of the page, starting with a slash. */
  path: string;
}

/**
 * Metadata for a page other than the home page. A page's `openGraph` and `twitter` replace the
 * layout's wholesale, so this restates the shared parts. The social image comes from the
 * `opengraph-image` and `twitter-image` files at the root.
 */
export function pageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  const fullTitle = `${title} | ${siteConfig.name}`;
  const alt = `${siteConfig.name}. ${siteConfig.tagline}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: siteConfig.name,
      title: fullTitle,
      description,
      url: path,
      locale: 'en',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [{ url: '/twitter-image', width: 1200, height: 630, alt }],
    },
  };
}
