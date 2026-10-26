'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import styles from './unsubscribe.module.css';

type Status = 'idle' | 'working' | 'done' | 'failed';

/** One button that unsubscribes the person behind the token, and says what happened. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>('idle');

  const unsubscribe = async () => {
    setStatus('working');
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setStatus(response.ok ? 'done' : 'failed');
    } catch {
      setStatus('failed');
    }
  };

  if (status === 'done') {
    return (
      <p className={styles.done} role="status">
        <Check aria-hidden="true" size={22} strokeWidth={3} />
        You are unsubscribed. We will not email you about new versions.
      </p>
    );
  }

  return (
    <div className={styles.form}>
      <p className="lead">
        Press the button to stop getting emails about new versions of Scrim. Nothing else changes.
      </p>
      <button
        type="button"
        className={styles.button}
        disabled={status === 'working'}
        onClick={() => void unsubscribe()}
      >
        {status === 'working' ? 'Unsubscribing...' : 'Unsubscribe'}
      </button>
      {status === 'failed' ? (
        <p className={styles.error} role="alert">
          That did not work. Please try again in a moment.
        </p>
      ) : null}
    </div>
  );
}
