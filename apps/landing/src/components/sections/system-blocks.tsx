'use client';

import { SYSTEMS } from '@/lib/systems';
import { DownloadTrigger } from '../download/download-provider';
import { OsIcon } from '../os-icons';
import { usePlatform } from '../use-platform';
import styles from './download.module.css';

/**
 * The three systems. Once the visitor's system is known it moves to the front and is marked, but
 * every block always works, so nobody is locked into a guess.
 */
export function SystemBlocks() {
  const platform = usePlatform();
  const detected = platform !== null && platform.os !== 'unsupported' ? platform.os : null;

  return (
    <div className={styles.systems}>
      {SYSTEMS.map((system) => {
        const yours = system.os === detected;
        return (
          <article
            key={system.os}
            className={styles.system}
            style={{ order: yours ? 0 : 1 }}
            data-yours={yours ? 'true' : undefined}
          >
            <div className={styles.systemHead}>
              <OsIcon os={system.os} size={44} className={styles.systemLogo} />
              {yours ? <span className={styles.yours}>Your machine</span> : null}
            </div>
            <h3>{system.name}</h3>
            <p>{system.summary}</p>
            <DownloadTrigger os={system.os} className={styles.button}>
              <OsIcon os={system.os} size={20} />
              Download for {system.name}
            </DownloadTrigger>
            <details className={styles.help}>
              <summary>Need help?</summary>
              {system.help.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </details>
          </article>
        );
      })}
    </div>
  );
}
