import { ArrowUp, Lock } from 'lucide-react';
import { siteConfig } from '@/site.config';
import { Logo } from './logo';
import styles from './site-footer.module.css';
import { SuyaLink } from './suya-link';

interface SiteFooterProps {
  /** The latest published version, or null when there is no release yet. */
  version: string | null;
  /** The year shown in the copyright line. */
  year: number;
}

const SYSTEMS = ['Windows', 'macOS', 'Linux'] as const;

export function SiteFooter({ version, year }: SiteFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Logo markSize={36} />
            <p>
              Scrim records your screen, follows your cursor and exports an MP4. Your recordings
              stay on your computer.
            </p>
            <ul className={styles.chips} aria-label="Supported systems">
              {SYSTEMS.map((system) => (
                <li key={system}>{system}</li>
              ))}
            </ul>
            <a className={styles.version} href={siteConfig.releasesUrl}>
              {version === null ? 'Coming soon' : `Latest version ${version}`}
            </a>
          </div>

          <nav aria-label="Footer" className={styles.columns}>
            {Object.entries(siteConfig.footerLinks).map(([title, links]) => (
              <div key={title}>
                <h2 className={styles.columnTitle}>{title}</h2>
                <ul>
                  {links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.trust}>
          <p>
            <Lock aria-hidden="true" size={18} />
            Recordings never leave your computer.
          </p>
          <a href="#top" className={styles.toTop}>
            <ArrowUp aria-hidden="true" size={16} />
            Back to top
          </a>
        </div>

        <div className={styles.legal}>
          <p>&copy; {year} Scrim.</p>
          <ul>
            <li>
              <a href={siteConfig.licenseUrl}>MIT license</a>
            </li>
            <li>
              Built by <a href={siteConfig.author.url}>{siteConfig.author.name}</a>
            </li>
            <li>
              <SuyaLink plain />
            </li>
          </ul>
        </div>
      </div>

      {/* Decoration only. Every link and fact above also appears as real text. */}
      <div className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 1000 400" focusable="false" preserveAspectRatio="xMidYMin meet">
          <text x="0" y="330" textLength="1000" lengthAdjust="spacing" fill="var(--scrim-green)">
            Scrim
          </text>
        </svg>
      </div>
    </footer>
  );
}
