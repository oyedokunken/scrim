import { siteConfig } from '@/site.config';
import { BuiltBy } from './built-by';
import { Logo } from './logo';
import { MaltLink } from './malt-link';
import styles from './site-footer.module.css';

interface SiteFooterProps {
  /** The year shown in the copyright line. */
  year: number;
}

export function SiteFooter({ year }: SiteFooterProps) {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Logo markSize={36} />
            <p>
              Scrim records your screen, spotlights your cursor and zooms in on the action. Free,
              open source and entirely on your computer.
            </p>
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

        <div className={styles.legal}>
          <p>&copy; {year} Scrim. All rights reserved.</p>
          <ul>
            <li>
              <BuiltBy />
            </li>
            <li>
              <MaltLink className={styles.malt} />
            </li>
          </ul>
        </div>
      </div>

      {/* Decoration only. Every link and fact above also appears as real text. The whole logo
          rises into view as the page scrolls to it, and shows in full once it has arrived. */}
      <div className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 1000 330" focusable="false">
          <g transform="scale(9.375)">
            <rect width="32" height="32" rx="8" fill="var(--scrim-white)" />
            <path
              d="M9 13v-2a2 2 0 0 1 2-2h2M19 9h2a2 2 0 0 1 2 2v2M23 19v2a2 2 0 0 1-2 2h-2M13 23h-2a2 2 0 0 1-2-2v-2"
              fill="none"
              stroke="var(--scrim-black)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="16" cy="16" r="3.5" fill="var(--scrim-black)" />
          </g>
          <text x="352" y="252" textLength="648" lengthAdjust="spacing" fill="var(--scrim-white)">
            Scrim
          </text>
        </svg>
      </div>
    </footer>
  );
}
