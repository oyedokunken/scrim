import type { Metadata } from 'next';
import { z } from 'zod';
import styles from './unsubscribe.module.css';
import { UnsubscribeForm } from './unsubscribe-form';

// A page people reach from an email. It has no use in search results.
export const metadata: Metadata = {
  title: 'Unsubscribe',
  description: 'Stop getting release notices from Scrim.',
  robots: { index: false, follow: false },
};

const tokenSchema = z.uuid();

/**
 * Asks for confirmation before it unsubscribes anyone. Opening this page changes nothing, because
 * mail scanners open every link in a message. Only the button does the work.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const parsed = tokenSchema.safeParse(Array.isArray(token) ? token[0] : token);

  return (
    <section className={`container ${styles.page}`} aria-labelledby="unsubscribe-title">
      <h1 id="unsubscribe-title" className={styles.title}>
        Unsubscribe from release notices
      </h1>
      {parsed.success ? (
        <UnsubscribeForm token={parsed.data} />
      ) : (
        <p className="lead">
          That unsubscribe link is not complete. Open the link in your email again, or write to us
          and we will remove you by hand.
        </p>
      )}
    </section>
  );
}
