import { Heart } from 'lucide-react';
import { siteConfig } from '@/site.config';

interface SuyaLinkProps {
  className?: string | undefined;
  /** Hide the heart, for the plain text link in the footer. */
  plain?: boolean;
}

/**
 * The outbound Buy me suya link. It is a plain link that opens in a new tab. The site loads no
 * third party widget or script.
 */
export function SuyaLink({ className, plain = false }: SuyaLinkProps) {
  return (
    <a href={siteConfig.suyaUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {plain ? null : <Heart aria-hidden="true" size={16} strokeWidth={2.5} />}
      <span>Buy me suya</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
