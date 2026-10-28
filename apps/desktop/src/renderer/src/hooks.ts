import { useCallback, useEffect, useRef, useState } from 'react';
import { listDevices, type DeviceOption } from './devices';
import type { Settings, SettingsPatch } from '../../shared/settings';
import type { EventPayload, OutputOf } from '../../shared/ipc-contract';

export type Snapshot = OutputOf<'recording:snapshot'>;
export type Finished = EventPayload<'recording:finished'>;
export type UserError = { message: string; nextStep: string };

export type FolderKind = 'recordings' | 'screenshots';

const SAVE_DELAY_MS = 150;

/**
 * The saved settings, kept in step with the main process. A change shows at once and is sent after
 * a short pause, so dragging a slider sends one request, not one for every pixel.
 */
export function useSettings(): {
  settings: Settings | null;
  update: (patch: SettingsPatch) => void;
  chooseFolder: (kind: FolderKind) => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const pending = useRef<SettingsPatch>({});
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('settings:get').then((loaded) => {
      if (alive) setSettings(loaded);
    });
    const off = window.scrim.on('settings:changed', (changed) => {
      if (alive) setSettings(changed);
    });
    return () => {
      alive = false;
      off();
      window.clearTimeout(timer.current);
    };
  }, []);

  const update = useCallback((patch: SettingsPatch) => {
    setSettings((current) => (current === null ? current : { ...current, ...definedOnly(patch) }));
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const send = pending.current;
      pending.current = {};
      void window.scrim.invoke('settings:set', send);
    }, SAVE_DELAY_MS);
  }, []);

  const chooseFolder = useCallback(async (kind: FolderKind) => {
    // The main process records the folder itself. The event brings the new settings back.
    await window.scrim.invoke('folder:choose', { kind });
  }, []);

  return { settings, update, chooseFolder };
}

function definedOnly(patch: SettingsPatch): Partial<Settings> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

const IDLE: Snapshot = {
  phase: 'idle',
  elapsedMs: 0,
  bytesWritten: 0,
  tracks: [],
  warnings: [],
};

/** The state of the recording engine: its phase and the time recorded so far. */
export function useRecordingSnapshot(): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>(IDLE);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('recording:snapshot').then((current) => {
      if (alive) setSnapshot(current);
    });
    const off = window.scrim.on('recording:state', (next) => {
      if (alive) setSnapshot(next);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return snapshot;
}

/** Results and failures that arrive while the window is open. */
export function useRecordingOutcome(): {
  finished: Finished | null;
  failure: UserError | null;
  dismiss: () => void;
} {
  const [finished, setFinished] = useState<Finished | null>(null);
  const [failure, setFailure] = useState<UserError | null>(null);

  useEffect(() => {
    const offFinished = window.scrim.on('recording:finished', (result) => {
      setFinished(result);
      setFailure(null);
    });
    const offError = window.scrim.on('recording:error', (error) => {
      setFailure({ message: error.message, nextStep: error.nextStep });
    });
    return () => {
      offFinished();
      offError();
    };
  }, []);

  const dismiss = useCallback(() => {
    setFinished(null);
    setFailure(null);
  }, []);

  return { finished, failure, dismiss };
}

/** The cameras and microphones on this computer. Names appear once the person has allowed access. */
export function useDevices(): { cameras: DeviceOption[]; mics: DeviceOption[] } {
  const [devices, setDevices] = useState<{ cameras: DeviceOption[]; mics: DeviceOption[] }>({
    cameras: [],
    mics: [],
  });

  useEffect(() => {
    let alive = true;
    const read = async (): Promise<void> => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!alive) return;
        const named = (kind: MediaDeviceKind, fallback: string): DeviceOption[] =>
          listDevices(
            all.filter((device) => device.kind === kind),
            fallback,
          );
        setDevices({
          cameras: named('videoinput', 'Camera'),
          mics: named('audioinput', 'Microphone'),
        });
      } catch {
        // No device list is not an error: the home screen simply offers none.
      }
    };
    void read();
    const onChange = (): void => {
      void read();
    };
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, []);

  return devices;
}

/** The app version from the main process, or null until it arrives. */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    window.scrim
      .invoke('app:version')
      .then((value) => {
        if (alive) setVersion(value);
      })
      .catch(() => {
        // The pill simply stays empty.
      });
    return () => {
      alive = false;
    };
  }, []);
  return version;
}

export type { DeviceOption };

export type ScreenshotTaken = EventPayload<'screenshot:taken'>;

/** Calls back after every capture, including one made with the shortcut while another app has focus. */
export function useScreenshotTaken(onTaken: (shot: ScreenshotTaken) => void): void {
  const latest = useRef(onTaken);
  useEffect(() => {
    latest.current = onTaken;
  });
  useEffect(
    () =>
      window.scrim.on('screenshot:taken', (shot) => {
        latest.current(shot);
      }),
    [],
  );
}

export type ShotListEntry = OutputOf<'image:list'>[number];

/**
 * The screenshots in the screenshots folder, newest first. It reads again whenever `refreshKey`
 * changes or the Screenshot view opens, which the screen bumps after every capture, edit and delete, and when the window regains focus.
 */
export function useScreenshots(
  refreshKey: number,
  active: boolean,
): readonly ShotListEntry[] | null {
  const [shots, setShots] = useState<readonly ShotListEntry[] | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    const onFocus = (): void => {
      setFocusKey((key) => key + 1);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    window.scrim
      .invoke('image:list')
      .then((list) => {
        if (alive) setShots(list);
      })
      .catch(() => {
        if (alive) setShots((current) => current ?? []);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey, focusKey, active]);

  return shots;
}
