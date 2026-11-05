import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import { loadDownloadSummary } from '@/server/download-stats';
import styles from './downloads.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Downloads',
  description: 'How many times Scrim has been downloaded, by system and version.',
  path: '/downloads',
});

// The counts are read on every visit. A page built ahead of time would bake in "not available"
// whenever the database could not be reached while it was being built or refreshed, and show that
// message for minutes. The query is three small counts, so reading it live is cheap.
export const dynamic = 'force-dynamic';

export default async function DownloadsPage() {
  const summary = await loadDownloadSummary();
  const periods =
    summary === null
      ? []
      : [
          { label: 'Today', count: summary.periods.today },
          { label: 'This week', count: summary.periods.week },
          { label: 'This month', count: summary.periods.month },
          { label: 'Total', count: summary.total },
        ];

  return (
    <article className={`container ${styles.page}`} aria-labelledby="downloads-title">
      <header className={styles.header}>
        <h1 id="downloads-title" className={styles.title}>
          Downloads
        </h1>
        <p className="lead">
          How many times Scrim has been downloaded from this site. These are counts only. Nothing
          about any person is shown here.
        </p>
      </header>

      {summary === null ? (
        <p>The counts are not available right now. Please try again in a few minutes.</p>
      ) : (
        <>
          <section aria-labelledby="period-title">
            <h2 id="period-title" className="visually-hidden">
              Downloads over time
            </h2>
            <ul className={styles.tiles}>
              {periods.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.count.toLocaleString('en-GB')}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="system-title">
            <h2 id="system-title" className="visually-hidden">
              Downloads by system
            </h2>
            <ul className={`${styles.tiles} ${styles.three}`}>
              {summary.bySystem.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.count.toLocaleString('en-GB')}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="version-title">
            <h2 id="version-title">By version</h2>
            {summary.byVersion.length === 0 ? (
              <p>No downloads yet.</p>
            ) : (
              <ul className={styles.list}>
                {summary.byVersion.map((item) => (
                  <li key={item.version}>
                    <span>Version {item.version}</span>
                    <strong>{item.count.toLocaleString('en-GB')}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </article>
  );
}
