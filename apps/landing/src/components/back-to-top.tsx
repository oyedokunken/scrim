'use client';

import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { scrollProgress } from '@/lib/clock';
import styles from './back-to-top.module.css';

/**
 * A floating record button that takes you back to the top. Scrolling is the recording: the green
 * ring fills with how far you have come. This is written straight to the DOM, so scrolling never
 * renders React. The button only shows once the page has scrolled, and while it is hidden it
 * cannot be tabbed to.
 */
export function BackToTop() {
  const button = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const scrollable = root.scrollHeight - window.innerHeight;
      button.current?.style.setProperty(
        '--p',
        scrollProgress(window.scrollY, scrollable).toFixed(4),
      );
    };
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <nav aria-label="Page controls">
      <a
        ref={button}
        href="#top"
        className={styles.button}
        aria-label="Back to top"
        style={{ '--p': '0' } as CSSProperties}
      >
        <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle className={styles.track} cx="32" cy="32" r="29" pathLength="100" />
          <circle className={styles.progress} cx="32" cy="32" r="29" pathLength="100" />
        </svg>
        <div className={styles.innerCircle} aria-hidden="true"></div>
        <span className={styles.face} aria-hidden="true">
          <ArrowUp size={12} strokeWidth={3} />
        </span>
      </a>
    </nav>
  );
}
