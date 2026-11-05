import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/logo';
import styles from './not-found.module.css';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className={styles.page}>
      <LogoMark size={56} />
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>This page does not exist</h1>
      <p className={styles.text}>
        The address may have a typing mistake, or the page may have moved.
      </p>
      <Link href="/" className={styles.button}>
        Go to the home page
      </Link>
    </main>
  );
}
