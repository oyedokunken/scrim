import { ArrowUpRight } from 'lucide-react';
import { siteConfig } from '@/site.config';
import { SYSTEMS } from '@/lib/systems';
import { DownloadTrigger } from '../download/download-provider';
import { OsIcon } from '../os-icons';
import styles from './final-cta.module.css';

/** One corner of the viewfinder, the same bracket as in the logo. */
function Bracket({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg
      className={`${styles.bracket} ${styles[corner]}`}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 26V13a10 10 0 0 1 10-10h13"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The last thing before the footer. The panel is framed like a camera viewfinder, ripples spread
 * from the buttons and a cursor taps the first one on a loop. It is all CSS, and it stands still
 * for visitors who prefer reduced motion.
 */
export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className={`container ${styles.wrap}`}>
      <div className={styles.panel}>
        <Bracket corner="tl" />
        <Bracket corner="tr" />
        <Bracket corner="bl" />
        <Bracket corner="br" />

        <span className={styles.rec} aria-hidden="true">
          <span className={styles.recDot} />
          REC
        </span>

        <div className={styles.rings} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className={styles.content}>
          <h2 id="cta-title" className={styles.title}>
            Make your next screen recording count.
          </h2>
          <p className={styles.lead}>
            Scrim is free, open source and private by design. Choose your system and start
            recording.
          </p>

          <div className={styles.actions}>
            {SYSTEMS.map((system) => (
              <DownloadTrigger key={system.os} os={system.os} className={styles.button}>
                <OsIcon os={system.os} size={22} />
                {system.name}
              </DownloadTrigger>
            ))}
            <span className={styles.tap} aria-hidden="true">
              <span className={styles.tapRipple} />
              <svg viewBox="0 0 15 22" className={styles.pointer} focusable="false">
                <path
                  d="M0 0V19L5 14.5L8.5 22L12 20.5L8.5 13H15Z"
                  fill="var(--scrim-black)"
                  stroke="var(--scrim-white)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>

          <a className={styles.source} href={siteConfig.repoUrl}>
            Or read the source
            <ArrowUpRight aria-hidden="true" size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}
