import { useEffect, useRef } from 'react';
import { BrandMark } from '../brand-mark';
import { Button } from '../../ui';

export interface WelcomeProps {
  /** Get started on the first launch, Continue after. */
  firstRun: boolean;
  onContinue: () => void;
}

/** Nothing else on screen. Enter works at once because the button has focus. */
export function Welcome({ firstRun, onContinue }: WelcomeProps) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    button.current?.focus();
  }, []);

  return (
    <main className="welcome">
      <h1 className="welcome-brand">
        <BrandMark />
        Scrim
      </h1>
      <p className="welcome-tagline">Record anything on your screen effortlessly</p>
      <Button ref={button} variant="primary" className="welcome-button" onClick={onContinue}>
        {firstRun ? 'Get started' : 'Continue'}
      </Button>
      <p className="welcome-note">Nothing leaves your computer.</p>
    </main>
  );
}
