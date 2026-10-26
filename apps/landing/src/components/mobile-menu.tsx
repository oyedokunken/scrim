'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './site-header.module.css';

interface MobileMenuProps {
  items: readonly { label: string; href: string }[];
  /** An extra last item, set apart from the links. */
  children?: ReactNode;
}

/**
 * The navigation below 960px, as a native disclosure. It works without JavaScript. The script
 * only adds closing on Escape, on an outside tap and after following a link.
 */
export function MobileMenu({ items, children }: MobileMenuProps) {
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = details.current;
    if (element === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && element.open) {
        element.open = false;
        element.querySelector('summary')?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (element.open && event.target instanceof Node && !element.contains(event.target)) {
        element.open = false;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <details ref={details} className={styles.menu}>
      <summary className={styles.menuButton}>
        <Menu className={styles.iconOpen} aria-hidden="true" size={20} />
        <X className={styles.iconClose} aria-hidden="true" size={20} />
        <span className="visually-hidden">Menu</span>
      </summary>
      <nav aria-label="Mobile" className={styles.menuPanel}>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={`/${item.href}`}
                onClick={() => {
                  if (details.current !== null) {
                    details.current.open = false;
                  }
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
          {children === undefined ? null : <li className={styles.menuExtra}>{children}</li>}
        </ul>
      </nav>
    </details>
  );
}
