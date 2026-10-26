import { HandHeart, Heart } from 'lucide-react';
import { siteConfig } from '@/site.config';

interface MaltLinkProps {
  className?: string | undefined;
  /** The words on the button. */
  label?: string;
  /** A heart for the warmer places, a hand holding a heart for the menu. */
  icon?: 'heart' | 'hand';
}

/**
 * The outbound Support link, to the owner's page where people can buy them a malt. It is a plain
 * link that opens in a new tab. The site loads no third party widget or script.
 */
export function MaltLink({ className, label = 'Support', icon = 'hand' }: MaltLinkProps) {
  const Icon = icon === 'heart' ? Heart : HandHeart;
  return (
    <a href={siteConfig.maltUrl} target="_blank" rel="noopener noreferrer" className={className}>
      <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
      <span>{label}</span>
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}
