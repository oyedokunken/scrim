'use client';

import { SYSTEMS } from '@/lib/systems';
import { siteConfig } from '@/site.config';
import { SiteLink } from '../site-link';
import { DownloadTrigger } from '../download/download-provider';
import { OsIcon } from '../os-icons';
import { usePlatform } from '../use-platform';
import styles from './download.module.css';
import { LinuxAppImageSteps, LinuxVerify } from './linux-help';

const ISSUE_PHRASE = 'open an issue';

/** Turns the words "open an issue" into a link to the issue tracker, with one outside arrow. */
function withIssueLink(paragraph: string) {
  const at = paragraph.indexOf(ISSUE_PHRASE);
  if (at === -1) {
    return paragraph;
  }
  return (
    <>
      {paragraph.slice(0, at)}
      <SiteLink href={siteConfig.issuesUrl}>{ISSUE_PHRASE}</SiteLink>
      {paragraph.slice(at + ISSUE_PHRASE.length)}
    </>
  );
}

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
                <p key={paragraph}>{withIssueLink(paragraph)}</p>
              ))}
              {system.os === 'linux' ? <LinuxAppImageSteps /> : null}
            </details>
            {system.os === 'linux' ? <LinuxVerify /> : null}
          </article>
        );
      })}
    </div>
  );
}
