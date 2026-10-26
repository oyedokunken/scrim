import type { MetadataRoute } from 'next';
import { getSiteEnv } from '@/server/env';

export default function robots(): MetadataRoute.Robots {
  const { SITE_URL } = getSiteEnv();
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/unsubscribe'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
