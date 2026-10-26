'use client';

import { Download } from 'lucide-react';
import { useDownloadLink } from './download/download-provider';
import { OsIcon } from './os-icons';
import { usePlatform } from './use-platform';

interface HeaderDownloadProps {
  className?: string | undefined;
}

/**
 * A short Download link for the header on narrow screens. It shows the logo of the visitor's
 * system once that is known, and a plain download icon until then.
 */
export function HeaderDownload({ className }: HeaderDownloadProps) {
  const link = useDownloadLink();
  const platform = usePlatform();
  const os = platform !== null && platform.os !== 'unsupported' ? platform.os : null;
  return (
    <a {...link} className={className}>
      {os === null ? (
        <Download aria-hidden="true" size={16} strokeWidth={2.5} />
      ) : (
        <OsIcon os={os} size={16} />
      )}
      <span>Download</span>
    </a>
  );
}
