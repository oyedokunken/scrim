import { useEffect } from 'react';
import { Button } from '../../ui';
import { BrandMark } from '../brand-mark';
import { BuiltBy } from './built-by';

export interface WelcomeProps {
  /** Get started on the first launch, Continue after. */
  firstRun: boolean;
  /** From the main process. The pill keeps its place and stays empty until this arrives. */
  version: string | null;
  onContinue: () => void;
  onOpenLink: (url: string) => void;
}

/**
 * Brand and line at the top left, the credit at the bottom left, the button at the bottom right. Enter
 * works at once through a key listener, so the button never takes focus on load and shows no ring.
 */
export function Welcome({ firstRun, version, onContinue, onOpenLink }: WelcomeProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.defaultPrevented) return;
      // A focused link or button handles its own Enter.
      if (event.target instanceof HTMLElement && event.target !== document.body) return;
      onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onContinue]);

  return (
    <main className="welcome">
      <div className="welcome-top">
        <div className="welcome-title">
          <h1 className="welcome-brand">
            <BrandMark />
            Scrim
          </h1>
          <span className="version-pill">{version === null ? '' : `v${version}`}</span>
        </div>
        <p className="welcome-tagline">Record anything on your screen effortlessly</p>
      </div>
      <p className="welcome-credit">
        <BuiltBy onOpenLink={onOpenLink} />
      </p>
      <Button variant="primary" className="welcome-button" onClick={onContinue}>
        {firstRun ? 'Get started' : 'Continue'}
      </Button>
    </main>
  );
}
