import { ArrowUpRight } from 'lucide-react';
import { formatReleaseDate, type ReleaseSummary } from '@/lib/release-date';
import { SiteLink } from '../site-link';
import styles from './download.module.css';
import { SystemBlocks } from './system-blocks';

interface DownloadSectionProps {
  /** The latest published release, or null when there is none yet. */
  release: ReleaseSummary | null;
}

export function DownloadSection({ release }: DownloadSectionProps) {
  const date = formatReleaseDate(release?.publishedAt ?? null);

  return (
    <section id="download" aria-labelledby="download-title" className={`deferred ${styles.band}`}>
      <div className={`container ${styles.inner}`}>
        <header className={styles.intro}>
          <h2 id="download-title" className="section-title">
            Download Scrim
          </h2>
          {release === null ? null : (
            <p className={styles.status}>
              Version {release.version}
              {date === null ? '' : `, published on ${date}`}. Choose your system below.{' '}
              <SiteLink href={release.url}>
                Read the release notes
                <ArrowUpRight aria-hidden="true" size={18} />
              </SiteLink>
            </p>
          )}
        </header>
        <SystemBlocks />
      </div>
    </section>
  );
}
