import { formatReleaseDate, type ReleaseSummary } from '@/lib/release-date';
import { siteConfig } from '@/site.config';
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
          {release === null ? (
            <p className={styles.status}>
              We could not load the latest release from GitHub. Get the installers from the{' '}
              <SiteLink href={siteConfig.releasesUrl}>Releases page</SiteLink>.
            </p>
          ) : (
            <p className={styles.status}>
              Version {release.version}
              {date === null ? '' : `, published on ${date}`}. Choose your system below.{' '}
              <SiteLink href={release.url}>Read the release notes</SiteLink>
            </p>
          )}
        </header>
        <SystemBlocks />
      </div>
    </section>
  );
}
