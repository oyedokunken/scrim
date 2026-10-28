'use client';

import dynamic from 'next/dynamic';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { SystemValue } from '@/lib/download-request';
import { siteConfig } from '@/site.config';

// The form and its validation load the first time someone opens the dialog, so they are not part
// of the JavaScript every visitor downloads.
const DownloadModal = dynamic(
  () => import('./download-modal').then((module) => module.DownloadModal),
  {
    ssr: false,
  },
);

interface OpenOptions {
  /** Preselect this system, for a button that already names one. */
  os?: SystemValue | undefined;
  /** The element to give focus back to when the dialog closes. */
  trigger?: HTMLElement | null | undefined;
}

interface DownloadApi {
  open: (options?: OpenOptions) => void;
}

const DownloadContext = createContext<DownloadApi>({ open: () => undefined });

function useDownloadModal(): DownloadApi {
  return useContext(DownloadContext);
}

interface ModalState {
  /** How many times the dialog has opened. A new count mounts a fresh dialog. */
  count: number;
  loaded: boolean;
  open: boolean;
  os: SystemValue | undefined;
}

/** Holds the one download dialog for the whole site. */
export function DownloadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState>({
    count: 0,
    loaded: false,
    open: false,
    os: undefined,
  });
  const trigger = useRef<HTMLElement | null>(null);

  const open = useCallback((options?: OpenOptions) => {
    const active = document.activeElement;
    trigger.current = options?.trigger ?? (active instanceof HTMLElement ? active : null);
    setState((current) => ({
      count: current.count + 1,
      loaded: true,
      open: true,
      os: options?.os,
    }));
  }, []);

  const close = useCallback(() => {
    setState((current) => ({ ...current, open: false }));
    trigger.current?.focus();
  }, []);

  const api = useMemo(() => ({ open }), [open]);

  return (
    <DownloadContext value={api}>
      {children}
      {state.loaded ? (
        <DownloadModal key={state.count} open={state.open} initialOs={state.os} onClose={close} />
      ) : null}
    </DownloadContext>
  );
}

/**
 * Props that turn a link into a download button. The link points at the Releases page, so it works
 * without JavaScript, and with JavaScript a plain click opens the dialog instead. A click with a
 * modifier key still opens the link the usual way.
 */
export function useDownloadLink(os?: SystemValue) {
  const { open } = useDownloadModal();
  return {
    href: siteConfig.releasesUrl,
    // Without JavaScript this is a plain link to another site, so it follows the same rule as every
    // other one: a new tab, with no way back to this page.
    target: '_blank',
    rel: 'noopener noreferrer',
    'data-download-trigger': '',
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      open({ os, trigger: event.currentTarget });
    },
  };
}

interface DownloadTriggerProps {
  className?: string | undefined;
  os?: SystemValue | undefined;
  children: ReactNode;
}

/** A link that opens the download dialog. */
export function DownloadTrigger({ className, os, children }: DownloadTriggerProps) {
  return (
    <a {...useDownloadLink(os)} className={className}>
      {children}
    </a>
  );
}
