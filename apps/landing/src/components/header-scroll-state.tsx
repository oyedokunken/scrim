'use client';

import { useEffect } from 'react';

/** How far the page scrolls before the header shrinks, in pixels. */
const THRESHOLD = 24;

/**
 * Marks the document as scrolled so the header can shrink. It sets one attribute and renders
 * nothing. CSS does the animating, and without JavaScript the header simply stays full size.
 */
export function HeaderScrollState() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      frame = 0;
      root.dataset.scrolled = window.scrollY > THRESHOLD ? 'true' : 'false';
    };
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      delete root.dataset.scrolled;
    };
  }, []);

  return null;
}
