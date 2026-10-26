import type { MetadataRoute } from 'next';
import { getSiteEnv } from '@/server/env';

export default function sitemap(): MetadataRoute.Sitemap {
  const { SITE_URL } = getSiteEnv();
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
