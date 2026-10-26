'use client';

import { ExternalLink } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import styles from './tooltip.module.css';

interface TooltipLinkProps {
  /** The name shown in the tooltip and spoken as the link's name. */
  label: string;
  href: string;
  children: ReactNode;
}

/**
 * An icon link with a tooltip. The tooltip shows on hover and on keyboard focus, stays while the
 * pointer is over it, and goes away on Escape. It names the destination and carries an external
 * link icon, and it is part of the link, so pressing it visits the page. The link has its own
 * accessible name, so screen readers do not read the tooltip twice.
 */
export function TooltipLink({ label, href, children }: TooltipLinkProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const visible = (hovered || focused) && !dismissed;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}
      aria-label={`${label} (opens in a new tab)`}
      onPointerEnter={() => {
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setDismissed(false);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible) {
          setDismissed(true);
        }
      }}
    >
      {children}
      <span
        id={id}
        className={styles.tip}
        data-visible={visible ? 'true' : 'false'}
        aria-hidden="true"
      >
        {label}
        <ExternalLink size={14} strokeWidth={2.5} />
      </span>
    </a>
  );
}
