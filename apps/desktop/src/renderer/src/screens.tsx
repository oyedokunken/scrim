import { useCallback, useState } from 'react';
import type { Settings } from '../../shared/settings';
import { ControlView } from './components/control-view';
import { EditorPlaceholder } from './components/editor-placeholder';
import { RecordingView } from './components/recording-view';
import { formatTimer } from './format';
import { AppShell } from './shell/app-shell';
import { Placeholder } from './shell/placeholder';
import { RecordPanel } from './shell/record-panel';
import { RecordView } from './shell/record-view';
import { ScreenshotView } from './shell/screenshot-view';
import { VIEW_LABELS, type ViewId } from './shell/views';
import { Welcome } from './shell/welcome';
import { Camera } from 'lucide-react';
import { Button } from '../ui';
import {
  useAppVersion,
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

/** The main window: the welcome screen, then the app shell around whichever view is open. */
export function MainScreen() {
  const { settings, update, chooseFolder } = useSettings();
  const snapshot = useRecordingSnapshot();
  const { finished, failure, dismiss } = useRecordingOutcome();
  const devices = useDevices();
  const controls = useRecordingControls();
  const version = useAppVersion();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<UserError | null>(null);
  const [view, setView] = useState<ViewId>('record');
  const [shooting, setShooting] = useState(false);
  const [shotError, setShotError] = useState<UserError | null>(null);
  const [entered, setEntered] = useState(false);

  const start = useCallback(async (chosen: Settings) => {
    setStarting(true);
    setStartError(null);
    try {
      // The overlay does the choosing, the countdown and the start. A cancel shows nothing.
      const result = await window.scrim.invoke('area:run', {
        mode: 'record',
        camera: deviceChoice(chosen.cameraOn, chosen.cameraDeviceId),
        mic: deviceChoice(chosen.micOn, chosen.micDeviceId),
      });
      if (!result.ok && result.reason === 'rejected') {
        setStartError({ message: result.error.message, nextStep: result.error.nextStep });
      } else if (!result.ok && result.reason === 'failed') {
        setStartError({
          message: 'Scrim could not open the area chooser.',
          nextStep: 'Try again. If it keeps happening, restart Scrim.',
        });
      }
    } finally {
      setStarting(false);
    }
  }, []);

  const shoot = useCallback(async () => {
    setShooting(true);
    setShotError(null);
    try {
      const result = await window.scrim.invoke('area:run', {
        mode: 'screenshot',
        camera: deviceChoice(false, null),
        mic: deviceChoice(false, null),
      });
      if (!result.ok && result.reason === 'rejected') {
        setShotError({ message: result.error.message, nextStep: result.error.nextStep });
      } else if (!result.ok && result.reason === 'failed') {
        setShotError({
          message: 'Scrim could not open the area chooser.',
          nextStep: 'Try again. If it keeps happening, restart Scrim.',
        });
      }
    } finally {
      setShooting(false);
    }
  }, []);

  if (settings === null) {
    return (
      <main className="welcome" aria-busy="true">
        <p className="ui-help">Loading</p>
      </main>
    );
  }

  if (!entered && (settings.showWelcome || !settings.firstRunDone)) {
    return (
      <Welcome
        firstRun={!settings.firstRunDone}
        version={version}
        onOpenLink={(url) => {
          void window.scrim.invoke('shell:open-external', { url });
        }}
        onContinue={() => {
          if (!settings.firstRunDone) update({ firstRunDone: true });
          setEntered(true);
        }}
      />
    );
  }

  const live = LIVE.has(snapshot.phase);
  const folder = settings.destinationFolder ?? 'Videos\\Scrim';
  const state = live
    ? `${snapshot.phase === 'paused' ? 'Paused' : 'Recording'} ${formatTimer(snapshot.elapsedMs)}`
    : 'Ready';

  const startButton = (
    <Button
      variant="primary"
      disabled={starting || live}
      onClick={() => {
        setView('record');
        void start(settings);
      }}
    >
      <span className="record-dot" aria-hidden="true" />
      Start recording
    </Button>
  );

  const shotButton = (
    <Button
      variant="primary"
      icon={<Camera size={16} strokeWidth={2} />}
      disabled={shooting || live}
      onClick={() => {
        void shoot();
      }}
    >
      Take screenshot
    </Button>
  );

  let main;
  if (live) {
    main = (
      <RecordingView
        snapshot={snapshot}
        busy={controls.busy}
        error={controls.error}
        onPause={controls.pause}
        onResume={controls.resume}
        onStop={controls.stop}
      />
    );
  } else if (finished !== null) {
    main = (
      <EditorPlaceholder
        finished={finished}
        onShowInFolder={() => {
          void window.scrim.invoke('shell:show-in-folder', { path: finished.folder });
        }}
        onRecordAgain={dismiss}
      />
    );
  } else if (view === 'record') {
    main = (
      <RecordView
        busy={starting}
        error={startError ?? failure}
        onStart={() => void start(settings)}
      />
    );
  } else if (view === 'screenshot') {
    main = <ScreenshotView busy={shooting} error={shotError} onTake={() => void shoot()} />;
  } else {
    main = <Placeholder view={view} />;
  }

  const panel =
    view === 'record' ? (
      <RecordPanel
        settings={settings}
        cameras={devices.cameras}
        mics={devices.mics}
        onChange={update}
        onChooseFolder={() => void chooseFolder()}
      />
    ) : (
      <Placeholder view={view} inPanel />
    );

  return (
    <AppShell
      view={view}
      onView={setView}
      title={VIEW_LABELS[view]}
      primary={view === 'record' ? startButton : view === 'screenshot' ? shotButton : undefined}
      status={{ state, folder }}
      panel={panel}
    >
      {main}
    </AppShell>
  );
}
