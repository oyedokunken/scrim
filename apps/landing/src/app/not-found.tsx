import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="notfound-page">
      <Logo markSize={56} className="notfound-logo" />
      <p className="notfound-code">404</p>
      <h1 className="notfound-title">This page does not exist</h1>
      <p className="notfound-text">
        The address may have a typing mistake, or the page may have moved.
      </p>
      <Link href="/" className="notfound-button">
        Go to the home page
      </Link>
    </main>
  );
}
