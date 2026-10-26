import { HandHeart } from 'lucide-react';
import { siteConfig } from '@/site.config';

interface MaltLinkProps {
  className?: string | undefined;
}

/**
 * The outbound Support link, to the owner's page where people can buy them a malt. It is a plain
 * link that opens in a new tab. The site loads no third party widget or script.
 */
export function MaltLink({ className }: MaltLinkProps) {
  return (
    <a href={siteConfig.maltUrl} target="_blank" rel="noopener noreferrer" className={className}>
      <HandHeart aria-hidden="true" size={18} strokeWidth={2.25} />
      <span>Support</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
