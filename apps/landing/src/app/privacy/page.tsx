import type { Metadata } from 'next';
import { formatPrivacyDate, PRIVACY_LAST_UPDATED, RETENTION_STATEMENT } from '@/lib/privacy';
import { pageMetadata } from '@/lib/page-metadata';
import { siteConfig } from '@/site.config';
import styles from './privacy.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy',
  description:
    'What the Scrim website collects when you download the app, why, where it is stored and how to have it deleted.',
  path: '/privacy',
});

const COLLECTED = [
  'Your name and your email address.',
  'The system you chose to download for, and its architecture.',
  'The version of the app you downloaded.',
  'A hashed copy of your IP address. We cannot turn it back into the address.',
  'The first 200 characters of your browser string.',
  'The time of the download.',
] as const;

const NOT_COLLECTED = [
  'No analytics. We do not measure visits.',
  'No cookies, so there is nothing to track you across pages.',
  'No third party scripts. The page loads nothing from anyone else.',
  'Nothing from your recordings. The desktop app does not send them anywhere.',
] as const;

export default function PrivacyPage() {
  return (
    <article className={`container ${styles.page}`} aria-labelledby="privacy-title">
      <header className={styles.header}>
        <h1 id="privacy-title" className={styles.title}>
          Privacy policy
        </h1>
        <p className="lead">
          Scrim keeps your recordings on your computer. This page explains the little the website
          does keep, in plain words.
        </p>
        <p className={styles.updated}>
          Last updated <time dateTime={PRIVACY_LAST_UPDATED}>{formatPrivacyDate()}</time>
        </p>
      </header>

      <section aria-labelledby="collect-title">
        <h2 id="collect-title">What we collect</h2>
        <p>When you use the download form, we store:</p>
        <ul>
          {COLLECTED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="why-title">
        <h2 id="why-title">Why we collect it</h2>
        <ul>
          <li>To count how many times Scrim is downloaded.</li>
          <li>To send you the download email.</li>
          <li>
            To send the site owner a short note that a download happened. It carries your name, your
            email and the system you chose, and nothing else.
          </li>
          <li>To send release notices, only if you ticked the box to get them.</li>
        </ul>
      </section>

      <section aria-labelledby="not-title">
        <h2 id="not-title">What we do not collect</h2>
        <ul>
          {NOT_COLLECTED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="where-title">
        <h2 id="where-title">Where it is stored</h2>
        <p>
          The records sit in a hosted Postgres database. These services handle your data for us:
        </p>
        <ul>
          <li>Supabase hosts the database.</li>
          <li>Vercel hosts the website.</li>
          <li>
            An email provider sends the download email. We will name it here once it is chosen.
          </li>
        </ul>
      </section>

      <section aria-labelledby="keep-title">
        <h2 id="keep-title">How long we keep it</h2>
        <p>{RETENTION_STATEMENT}</p>
      </section>

      <section aria-labelledby="choices-title">
        <h2 id="choices-title">Your choices</h2>
        <ul>
          <li>
            To see what we hold about you, or to have it deleted,{' '}
            <a href={`mailto:${siteConfig.contactInbox}`}>email the site owner</a>.
          </li>
          <li>Every release notice has an unsubscribe link, and unsubscribing takes one step.</li>
          <li>The download form works without ticking the box for release notices.</li>
        </ul>
      </section>

      <section aria-labelledby="contact-title">
        <h2 id="contact-title">Contact</h2>
        <p>
          Questions about this page? Open an issue on <a href={siteConfig.issuesUrl}>GitHub</a>, and
          keep personal details out of it. For anything private, use the email link above.
        </p>
      </section>
    </article>
  );
}
