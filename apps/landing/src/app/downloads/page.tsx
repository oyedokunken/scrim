import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/page-metadata';
import { loadDownloadSummary } from '@/server/download-stats';
import styles from './downloads.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Downloads',
  description: 'How many times Scrim has been downloaded, by system and version.',
  path: '/downloads',
});

// Counts change slowly, so the page regenerates every 5 minutes instead of on every visit.
export const revalidate = 300;

export default async function DownloadsPage() {
  const summary = await loadDownloadSummary();

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
          <section aria-labelledby="total-title">
            <h2 id="total-title">In total</h2>
            <p className={styles.total}>{summary.total.toLocaleString('en-GB')}</p>
          </section>

          <section aria-labelledby="system-title">
            <h2 id="system-title">By system</h2>
            <ul className={styles.list}>
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
