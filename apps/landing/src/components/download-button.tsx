'use client';

import { Download } from 'lucide-react';
import { osLabel } from '@/lib/platform';
import styles from './download-button.module.css';
import { usePlatform } from './use-platform';

interface DownloadButtonProps {
  href: string;
  /** Extra class for the surrounding context, for example spacing. */
  className?: string | undefined;
}

/** The longest label. It sets the width, so the button never changes size when the label does. */
const WIDEST_LABEL = 'Download for Windows';

/**
 * A button that reads "Download" on the server and in the first paint, then names the visitor's
 * system once it is known. Its width is reserved, so nothing shifts.
 */
export function DownloadButton({ href, className }: DownloadButtonProps) {
  const platform = usePlatform();
  const label =
    platform === null || platform.os === 'unsupported'
      ? 'Download'
      : `Download for ${osLabel(platform.os)}`;

  return (
    <a href={href} className={`${styles.button} ${className ?? ''}`.trim()}>
      <Download aria-hidden="true" size={20} strokeWidth={2.25} />
      <span className={styles.labels}>
        <span className={styles.label}>{label}</span>
        <span className={styles.sizer} aria-hidden="true">
          {WIDEST_LABEL}
        </span>
      </span>
    </a>
  );
}
