import { siteConfig } from '@/site.config';
import { DownloadButton } from '../download-button';
import { OtherSystems } from '../other-systems';
import { VersionPill } from '../version-pill';
import { HeroDemo } from '../hero-demo/hero-demo';
import styles from './hero.module.css';

interface HeroProps {
  /** The latest release number, shown as a pill beside the headline. */
  version?: string | null;
}

export function Hero({ version = null }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className={`container ${styles.hero}`}>
      <div className={styles.copy}>
        <div className={styles.titleRow}>
          <h1 id="hero-title" className={styles.title}>
            {siteConfig.tagline}
          </h1>{' '}
          <VersionPill version={version} />
        </div>
        <div className={styles.aside}>
          <p className={styles.lead}>
            With Scrim, you can record your screen, spotlight your cursor, ripple every click, zoom
            in on the action, add your face and export a clean MP4, all on your computer.
          </p>
          <div className={styles.actions}>
            <DownloadButton />
            <OtherSystems />
          </div>
        </div>
      </div>
      <HeroDemo />
    </section>
  );
}
