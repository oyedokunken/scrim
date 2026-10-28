import { useEffect, useRef, type MouseEvent } from 'react';
import { Button } from '../../ui';
import { BrandMark } from '../brand-mark';

export const OWNER_URL = 'https://www.oyedokun.dev/';

export interface WelcomeProps {
  /** Get started on the first launch, Continue after. */
  firstRun: boolean;
  /** From the main process. The pill keeps its place and stays empty until this arrives. */
  version: string | null;
  onContinue: () => void;
  onOpenLink: (url: string) => void;
}

/** Brand and line at the top left, the button at the bottom right. Enter works at once. */
export function Welcome({ firstRun, version, onContinue, onOpenLink }: WelcomeProps) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    button.current?.focus();
  }, []);

  const open = (event: MouseEvent): void => {
    event.preventDefault();
    onOpenLink(OWNER_URL);
  };

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
        Built by{' '}
        <a href={OWNER_URL} onClick={open}>
          @oyedokunken
        </a>
      </p>
      <Button ref={button} variant="primary" className="welcome-button" onClick={onContinue}>
        {firstRun ? 'Get started' : 'Continue'}
      </Button>
    </main>
  );
}
