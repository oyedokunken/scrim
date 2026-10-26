import { ExternalLink } from 'lucide-react';
import { siteConfig } from '@/site.config';
import { DownloadButton } from '../download-button';
import { HeroDemo } from '../hero-demo/hero-demo';
import styles from './hero.module.css';

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className={`container ${styles.hero}`}>
      <div className={styles.copy}>
        <h1 id="hero-title" className={styles.title}>
          {siteConfig.tagline}
        </h1>
        <div className={styles.aside}>
          <p className={styles.lead}>
            Record video or take screenshots on Windows, macOS and Linux. Cursor halo, click ripples
            and auto zoom included. Nothing is uploaded.
          </p>
          <div className={styles.actions}>
            <DownloadButton href="#download" />
            <a className={styles.source} href={siteConfig.repoUrl}>
              View source
              <ExternalLink aria-hidden="true" size={16} />
            </a>
          </div>
        </div>
      </div>
      <HeroDemo />
    </section>
  );
}
