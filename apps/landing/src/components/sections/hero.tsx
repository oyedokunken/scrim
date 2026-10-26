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
          {siteConfig.heroHeadline}
        </h1>
        <div className={styles.aside}>
          <p className={styles.lead}>
            With Scrim, you can record your screen, spotlight your cursor, ripple every click, zoom
            in on the action, add your face and export a clean MP4, all on your computer.
          </p>
          <div className={styles.actions}>
            <DownloadButton />
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
