import styles from './download.module.css';
import { SystemBlocks } from './system-blocks';

export function DownloadSection() {
  return (
    <section id="download" aria-labelledby="download-title" className={`deferred ${styles.band}`}>
      <div className={`container ${styles.inner}`}>
        <header className={styles.intro}>
          <h2 id="download-title" className="section-title">
            Download Scrim
          </h2>
          <p className={styles.status}>
            Choose your operating system below and download Scrim. It is free, with no account and
            no watermark.
          </p>
        </header>
        <SystemBlocks />
      </div>
    </section>
  );
}
