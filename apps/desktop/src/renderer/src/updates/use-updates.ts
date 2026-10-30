import { useCallback, useEffect, useState } from 'react';
import type { UpdateSnapshot } from '../../../shared/updates-contract';

const START: UpdateSnapshot = { state: { phase: 'idle' }, blocked: null };

export interface UpdatesApi {
  snapshot: UpdateSnapshot;
  check: () => void;
  download: () => void;
  install: () => void;
}

/**
 * The update state from the main process. It reads the state once, then follows the pushed
 * changes. Nothing here starts a check: only the buttons do.
 */
export function useUpdates(): UpdatesApi {
  const [snapshot, setSnapshot] = useState<UpdateSnapshot>(START);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('updates:state').then(
      (value) => {
        if (alive) setSnapshot(value);
      },
      () => undefined,
    );
    const off = window.scrim.on('updates:changed', (value) => {
      if (alive) setSnapshot(value);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const run = useCallback((channel: 'updates:check' | 'updates:download') => {
    void window.scrim.invoke(channel).then(setSnapshot, () => undefined);
  }, []);

  return {
    snapshot,
    check: () => {
      run('updates:check');
    },
    download: () => {
      run('updates:download');
    },
    install: () => {
      void window.scrim.invoke('updates:install').catch(() => undefined);
    },
  };
}

/** True while an update is found, downloading or ready, which is when the rail shows its pill. */
export function hasUpdateToShow(snapshot: UpdateSnapshot): boolean {
  const phase = snapshot.state.phase;
  return phase === 'available' || phase === 'downloading' || phase === 'ready';
}
