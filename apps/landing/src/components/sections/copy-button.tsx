'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { copyMessage, copyText, type CopyResult } from '@/lib/copy-text';
import styles from './contribute.module.css';

interface CopyButtonProps {
  text: string;
  /** The element that shows the text, which is selected when the clipboard is blocked. */
  target: RefObject<HTMLElement | null>;
}

/** How long "Copied" stays on screen, in milliseconds. */
const MESSAGE_MS = 2500;

function selectContents(element: HTMLElement | null): boolean {
  const selection = window.getSelection();
  if (element === null || selection === null) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * A real button with visible text. The result is announced through a live region. If the
 * clipboard is blocked it selects the commands instead, so keyboard users can still copy them.
 */
export function CopyButton({ text, target }: CopyButtonProps) {
  const [result, setResult] = useState<CopyResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const onClick = () => {
    void copyText(
      text,
      navigator.clipboard as { writeText(text: string): Promise<void> } | undefined,
      () => selectContents(target.current),
    ).then((outcome) => {
      setResult(outcome);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setResult(null);
      }, MESSAGE_MS);
    });
  };

  return (
    <div className={styles.copy}>
      <button type="button" className={styles.copyButton} onClick={onClick}>
        {result === 'copied' ? (
          <Check aria-hidden="true" size={18} />
        ) : (
          <Copy aria-hidden="true" size={18} />
        )}
        <span>Copy commands</span>
      </button>
      <span className={styles.copyMessage} role="status" aria-live="polite">
        {copyMessage(result)}
      </span>
    </div>
  );
}
