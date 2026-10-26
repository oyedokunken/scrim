import type { ReactNode } from 'react';

/** True for an address on another site, such as https://github.com/... */
export function isExternal(href: string): boolean {
  return /^(https?:)?\/\//i.test(href);
}

interface SiteLinkProps {
  href: string;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * A link that does the right thing for where it goes. An address on another site opens in a new
 * tab, with `noopener noreferrer` so the other site cannot reach back, and says so to screen
 * readers. Anything on this site, or a mail link, behaves as a normal link.
 */
export function SiteLink({ href, className, children }: SiteLinkProps) {
  if (!isExternal(href)) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
