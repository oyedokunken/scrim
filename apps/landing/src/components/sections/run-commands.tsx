'use client';

import { useRef } from 'react';
import { CopyButton } from './copy-button';
import styles from './contribute.module.css';

/** The commands to run the desktop app locally, as one block of text. */
export const RUN_COMMANDS = [
  'git clone https://github.com/oyedokunken/scrim.git',
  'cd scrim',
  'pnpm install',
  'pnpm dev',
].join('\n');

export function RunCommands() {
  const code = useRef<HTMLElement>(null);
  return (
    <div className={styles.run}>
      <pre className={styles.code} aria-label="Commands to run the Scrim app locally">
        <code ref={code}>{RUN_COMMANDS}</code>
      </pre>
      <CopyButton text={RUN_COMMANDS} target={code} />
    </div>
  );
}
