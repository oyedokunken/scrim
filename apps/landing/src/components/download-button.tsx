'use client';

import { Download } from 'lucide-react';
import { osLabel } from '@/lib/platform';
import styles from './download-button.module.css';
import { useDownloadLink } from './download/download-provider';
import { OsIcon } from './os-icons';
import { usePlatform } from './use-platform';

interface DownloadButtonProps {
  /** Extra class for the surrounding context, for example spacing. */
  className?: string | undefined;
}

/** The longest label. It sets the width, so the button never changes size when the label does. */
const WIDEST_LABEL = 'Download for Windows';

/**
 * A button that reads "Download" on the server and in the first paint, then shows the logo and
 * name of the visitor's system once it is known. Its width is reserved, so nothing shifts.
 */
export function DownloadButton({ className }: DownloadButtonProps) {
  const link = useDownloadLink();
  const platform = usePlatform();
  const known = platform !== null && platform.os !== 'unsupported' ? platform.os : null;
  const label = known === 'windows' ? `Download for ${osLabel(known)}` : 'Download';
  const icon =
    known !== 'windows' ? (
      <Download aria-hidden="true" size={20} strokeWidth={2.25} />
    ) : (
      <OsIcon os={known} size={20} />
    );

  return (
    <a {...link} className={`${styles.button} ${className ?? ''}`.trim()}>
      <span className={styles.labels}>
        <span className={styles.label}>
          {icon}
          {label}
        </span>
        <span className={styles.sizer} aria-hidden="true">
          <Download aria-hidden="true" size={20} strokeWidth={2.25} />
          {WIDEST_LABEL}
        </span>
      </span>
    </a>
  );
}
