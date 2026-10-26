import { siteConfig } from '@/site.config';

export default function HomePage() {
  return (
    <section style={{ padding: 'var(--gutter)' }}>
      <h1>{siteConfig.tagline}</h1>
    </section>
  );
}
