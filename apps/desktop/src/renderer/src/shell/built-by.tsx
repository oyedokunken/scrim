import { ExternalLink } from 'lucide-react';
import type { MouseEvent } from 'react';
import './built-by.css';

/** The owner's website. It must stay on the external allowlist in `shared/external-urls.ts`. */
const BUILT_BY_URL = 'https://www.oyedokun.dev/';

/**
 * "Built by @oyedokunken": a plain link to the owner's website. It opens in the person's browser
 * through the safe open-external path, like every other outside link in the app.
 */
export function BuiltBy({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  const go = (event: MouseEvent): void => {
    event.preventDefault();
    onOpenLink(BUILT_BY_URL);
  };
  return (
    <span className="built-by">
      Built by{' '}
      <a
        href={BUILT_BY_URL}
        className="built-by-link"
        aria-label="Built by @oyedokunken, website (opens in your browser)"
        onClick={go}
      >
        @oyedokunken
        <ExternalLink aria-hidden="true" size={13} strokeWidth={2} />
      </a>
    </span>
  );
}
