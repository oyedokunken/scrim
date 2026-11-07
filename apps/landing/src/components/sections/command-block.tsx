'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText, type CopyResult } from '@/lib/copy-text';
import styles from './download.module.css';

/** How long "Copied text" stays on screen, in milliseconds. */
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
 * Commands to run, wrapped inside the card, with a small Copy button under them. The text wraps
 * instead of scrolling, so there is no scrollbar. If the clipboard is blocked the commands are
 * selected, so the visitor can still copy them with the keyboard.
 */
export function CommandBlock({ lines }: { lines: readonly string[] }) {
  const [result, setResult] = useState<CopyResult | null>(null);
  const code = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const onClick = () => {
    void copyText(
      lines.join('\n'),
      navigator.clipboard as { writeText(text: string): Promise<void> } | undefined,
      () => selectContents(code.current),
    ).then((outcome) => {
      setResult(outcome);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setResult(null);
      }, MESSAGE_MS);
    });
  };

  const label =
    result === 'copied'
      ? 'Copied text'
      : result === 'selected'
        ? 'Selected, press Ctrl+C'
        : result === 'failed'
          ? 'Could not copy'
          : 'Copy';

  return (
    <div className={styles.commandBlock}>
      <pre className={styles.commands}>
        <code ref={code}>{lines.join('\n')}</code>
      </pre>
      <button type="button" className={styles.copyCommand} onClick={onClick}>
        {result === 'copied' ? (
          <Check aria-hidden="true" size={16} />
        ) : (
          <Copy aria-hidden="true" size={16} />
        )}
        <span aria-live="polite">{label}</span>
      </button>
    </div>
  );
}
