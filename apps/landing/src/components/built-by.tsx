'use client';

import { Globe } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { siteConfig } from '@/site.config';
import styles from './built-by.module.css';
import { GitHubIcon, InstagramIcon, LinkedInIcon, XIcon } from './social-icons';
import { TooltipLink } from './tooltip';

const ICONS: Record<(typeof siteConfig.socials)[number]['id'], ReactNode> = {
  website: <Globe aria-hidden="true" size={22} strokeWidth={2} />,
  github: <GitHubIcon size={22} />,
  linkedin: <LinkedInIcon size={22} />,
  instagram: <InstagramIcon size={22} />,
  x: <XIcon size={20} />,
};

/**
 * "Built by @handle" where the handle opens a small card with links to the builder's profiles.
 * The card closes on Escape, on a click outside it and when focus leaves it, and Escape returns
 * focus to the handle.
 */
export function BuiltBy() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        root.current !== null &&
        event.target instanceof Node &&
        !root.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (
        root.current !== null &&
        event.target instanceof Node &&
        !root.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  return (
    <span ref={root} className={styles.root}>
      Built by{' '}
      <button
        ref={button}
        type="button"
        className={styles.handle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {siteConfig.author.handle}
      </button>
      <div
        id={panelId}
        className={styles.panel}
        role="group"
        aria-label={`Find ${siteConfig.author.handle} online`}
        hidden={!open}
      >
        <ul className={styles.icons}>
          {siteConfig.socials.map((social) => (
            <li key={social.id}>
              <TooltipLink label={social.name} href={social.href}>
                {ICONS[social.id]}
              </TooltipLink>
            </li>
          ))}
        </ul>
      </div>
    </span>
  );
}
