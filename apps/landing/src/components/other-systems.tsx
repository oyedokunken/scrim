'use client';

import { ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { osLabel } from '@/lib/platform';
import { otherSystems } from '@/lib/other-systems';
import { useDownloadLink } from './download/download-provider';
import { OsIcon } from './os-icons';
import styles from './other-systems.module.css';
import tooltip from './tooltip.module.css';
import { usePlatform } from './use-platform';

type SupportedOs = 'windows' | 'macos' | 'linux';

/** A small round download button for one system, with a tooltip that names it. */
function SystemCircle({ os }: { os: SupportedOs }) {
  const link = useDownloadLink(os);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const label = `Download for ${osLabel(os)}`;
  const visible = (hovered || focused) && !dismissed;

  return (
    <a
      {...link}
      className={styles.circle}
      aria-label={label}
      data-os={os}
      aria-describedby={visible ? id : undefined}
      onPointerEnter={() => {
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setDismissed(false);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible) {
          setDismissed(true);
        }
      }}
    >
      <OsIcon os={os} size={22} />
      <span id={id} className={tooltip.tip} data-visible={visible ? 'true' : 'false'}>
        {label}
        <ExternalLink size={14} strokeWidth={2.5} aria-hidden="true" />
      </span>
    </a>
  );
}

/**
 * Round buttons for the two systems the visitor is not on. They open the same download dialog,
 * preselected, so macOS and Linux go through the coming soon and update email flow. The server and
 * the no JavaScript view show Linux and macOS, and the pair is swapped after the system is known.
 * Both circles are always there, so nothing shifts when they change.
 */
export function OtherSystems() {
  const platform = usePlatform();
  const [first, second] = otherSystems(platform?.os ?? null);
  return (
    <span className={styles.group} role="group" aria-label="Other systems">
      <SystemCircle key={first} os={first} />
      <SystemCircle key={second} os={second} />
    </span>
  );
}
