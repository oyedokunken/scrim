import { useCallback, useState } from 'react';
import type { Settings } from '../../shared/settings';
import { ControlView } from './components/control-view';
import { EditorPlaceholder } from './components/editor-placeholder';
import { HomeView } from './components/home-view';
import { RecordingView } from './components/recording-view';
import {
  useDevices,
  useRecordingOutcome,
  useRecordingSnapshot,
  useSettings,
  type UserError,
} from './hooks';

const LIVE = new Set(['starting', 'recording', 'paused', 'stopping']);

function deviceChoice(enabled: boolean, deviceId: string | null) {
  return { enabled, ...(deviceId === null ? {} : { deviceId }) };
}

/** Pause, resume and stop, shared by the control bar and the main window while recording. */
function useRecordingControls() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserError | null>(null);

  const run = useCallback(
    async (channel: 'recording:pause' | 'recording:resume' | 'recording:stop') => {
      setBusy(true);
      setError(null);
      try {
        const result = await window.scrim.invoke(channel);
        if (!result.ok) {
          setError({ message: result.error.message, nextStep: result.error.nextStep });
        }
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return {
    busy,
    error,
    pause: () => void run('recording:pause'),
    resume: () => void run('recording:resume'),
    stop: () => void run('recording:stop'),
  };
}

/** The small bar over the screen: the whole content of the control window. */
export function ControlScreen() {
  const snapshot = useRecordingSnapshot();
  const controls = useRecordingControls();
  return (
    <ControlView
      snapshot={snapshot}
      busy={controls.busy}
      onPause={controls.pause}
      onResume={controls.resume}
      onStop={controls.stop}
    />
  );
}

/** The main window: home, the recording in progress, or what was just saved. */
export function MainScreen() {
  const { settings, update, chooseFolder } = useSettings();
  const snapshot = useRecordingSnapshot();
  const { finished, failure, dismiss } = useRecordingOutcome();
  const devices = useDevices();
  const controls = useRecordingControls();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<UserError | null>(null);

  const start = useCallback(async (chosen: Settings) => {
    setStarting(true);
    setStartError(null);
    try {
      const result = await window.scrim.invoke('recording:start', {
        source: { kind: 'display' },
        camera: deviceChoice(chosen.cameraOn, chosen.cameraDeviceId),
        mic: deviceChoice(chosen.micOn, chosen.micDeviceId),
      });
      if (!result.ok) {
        setStartError({ message: result.error.message, nextStep: result.error.nextStep });
      }
    } finally {
      setStarting(false);
    }
  }, []);

  if (settings === null) {
    return (
      <main className="screen" aria-busy="true">
        <p className="hint">Loading</p>
      </main>
    );
  }

  if (LIVE.has(snapshot.phase)) {
    return (
      <RecordingView
        snapshot={snapshot}
        busy={controls.busy}
        error={controls.error}
        onPause={controls.pause}
        onResume={controls.resume}
        onStop={controls.stop}
      />
    );
  }

  if (finished !== null) {
    return (
      <EditorPlaceholder
        finished={finished}
        onShowInFolder={() => {
          void window.scrim.invoke('shell:show-in-folder', { path: finished.folder });
        }}
        onRecordAgain={dismiss}
      />
    );
  }

  return (
    <HomeView
      settings={settings}
      cameras={devices.cameras}
      mics={devices.mics}
      busy={starting}
      error={startError ?? failure}
      onChange={update}
      onChooseFolder={() => void chooseFolder()}
      onStart={() => void start(settings)}
    />
  );
}
