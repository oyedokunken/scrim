import { renderBrandCard } from '@/og/brand-card';
import { siteConfig } from '@/site.config';

export const alt = `${siteConfig.name}. ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return renderBrandCard();
}
