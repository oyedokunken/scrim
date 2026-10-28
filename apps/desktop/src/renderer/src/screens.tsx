import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../shared/settings';
import { ControlView } from './components/control-view';
import { RecordingView } from './components/recording-view';
import { formatTimer } from './format';
import { AppShell } from './shell/app-shell';
import { AudioPanel } from './panels/audio-panel';
import { AudioPreview } from './panels/audio-preview';
import { BackgroundPanel } from './panels/background-panel';
import { BackgroundPreview } from './panels/background-preview';
import { CameraPanel } from './panels/camera-panel';
import { CameraPreview } from './panels/camera-preview';
import { CursorPanel } from './panels/cursor-panel';
import { CursorPreview } from './panels/cursor-preview';
import { ZoomPanel } from './panels/zoom-panel';
import { ZoomPreview } from './panels/zoom-preview';
import { Placeholder } from './shell/placeholder';
import { RecordPanel } from './shell/record-panel';
import { RecordView } from './shell/record-view';
import { EditorView } from './editor/editor-view';
import { SettingsView } from './settings/settings-view';
import { LibraryView } from './library/library-view';
import type { OpenedItem } from './library/use-library';
import { editorApi } from './shell/editor-bridge';
import { ScreenshotPanel } from './screenshot/screenshot-panel';
import { ScreenshotView, type ShotInfo } from './shell/screenshot-view';
import { showsSavedCard, VIEW_LABELS, type ViewId } from './shell/views';
import { PermissionCheck } from './shell/permission-check';
import { Welcome } from './shell/welcome';
import { Camera } from 'lucide-react';
import { Button } from '../ui';
import {
  useAppVersion,
  useDevices,
  useRecordingOutcome,
  useRecordingSnapshot,
  useScreenshotTaken,
  useScreenshots,
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
  const [shot, setShot] = useState<ShotInfo | null>(null);
  const [editorFolder, setEditorFolder] = useState<string | null>(null);
  const [shotsVersion, setShotsVersion] = useState(0);
  const shots = useScreenshots(shotsVersion, view === 'screenshot');
  const refreshShots = useCallback(() => {
    setShotsVersion((version) => version + 1);
  }, []);
  const [entered, setEntered] = useState(false);
  // Set by Show welcome again in the settings, which shows the welcome screen once even when it is switched off.
  const [welcomeNow, setWelcomeNow] = useState(false);
  const [checking, setChecking] = useState(false);
  const phase = snapshot.phase;

  // A new recording replaces the card of the last one.
  useEffect(() => {
    if (LIVE.has(phase)) dismiss();
  }, [phase, dismiss]);

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

  // A capture from the shortcut opens the result too, whichever view was showing.
  useScreenshotTaken(({ path, width, height }) => {
    setShot({ path, width, height });
    setView('screenshot');
    refreshShots();
  });

  const shoot = useCallback(async () => {
    setShooting(true);
    setShotError(null);
    try {
      const result = await window.scrim.invoke('area:run', {
        mode: 'screenshot',
        camera: deviceChoice(false, null),
        mic: deviceChoice(false, null),
      });
      if (result.ok && result.mode === 'screenshot' && result.result.path !== undefined) {
        const { path, width, height } = result.result;
        setShot({ path, width, height });
        refreshShots();
      } else if (!result.ok && result.reason === 'rejected') {
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
  }, [refreshShots]);

  const openItem = (opened: OpenedItem): void => {
    if (opened.kind === 'editor') {
      setEditorFolder(opened.folder);
      setView('editor');
    } else {
      setShot({ path: opened.path, width: opened.width, height: opened.height });
      setView('screenshot');
    }
  };

  if (settings === null) {
    return (
      <main className="welcome" aria-busy="true">
        <p className="ui-help">Loading</p>
      </main>
    );
  }

  if (checking && !entered) {
    return (
      <PermissionCheck
        onDone={() => {
          update({ firstRunDone: true });
          setEntered(true);
        }}
      />
    );
  }

  if (!entered && (welcomeNow || settings.showWelcome || !settings.firstRunDone)) {
    return (
      <Welcome
        firstRun={!settings.firstRunDone}
        version={version}
        onOpenLink={(url) => {
          void window.scrim.invoke('shell:open-external', { url });
        }}
        onContinue={() => {
          setWelcomeNow(false);
          if (settings.firstRunDone) setEntered(true);
          else setChecking(true);
        }}
      />
    );
  }

  const zoomValue = {
    on: settings.zoomOn,
    level: settings.zoomLevel,
    holdMs: settings.holdAfterClickMs,
    smoothness: settings.smoothness,
  };
  const cameraValue = {
    on: settings.cameraOn,
    size: settings.bubbleSize,
    shape: settings.bubbleShape,
    corner: settings.bubbleCorner,
  };
  const audioValue = { keepSound: settings.keepSound, volume: settings.micVolume };
  const backgroundValue = {
    id: settings.backgroundId,
    padding: settings.backgroundPadding,
    corners: settings.backgroundCorners,
    shadow: settings.backgroundShadow,
  };
  const live = LIVE.has(snapshot.phase);
  const folder =
    view === 'screenshot'
      ? (settings.screenshotFolder ?? 'Pictures\\Scrim')
      : (settings.destinationFolder ?? 'Videos\\Scrim');
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
  } else if (view === 'record') {
    main = (
      <RecordView
        busy={starting}
        error={startError ?? failure}
        onStart={() => void start(settings)}
        saved={
          finished === null || !showsSavedCard(view)
            ? undefined
            : {
                finished,
                onShowInFolder: () => {
                  void window.scrim.invoke('shell:show-in-folder', { path: finished.folder });
                },
                onOpenEditor: () => {
                  openItem({ kind: 'editor', folder: finished.folder });
                },
                onRecordAgain: dismiss,
              }
        }
      />
    );
  } else if (view === 'screenshot') {
    main = (
      <ScreenshotView
        key={shot?.path ?? 'none'}
        busy={shooting}
        error={shotError}
        shot={shot}
        onClearShot={() => {
          setShot(null);
          refreshShots();
        }}
        onShot={(next) => {
          setShot(next);
          refreshShots();
        }}
        onTake={() => void shoot()}
      />
    );
  } else if (view === 'editor' && editorFolder !== null) {
    main = (
      <EditorView key={editorFolder} folder={editorFolder} api={editorApi} settings={settings} />
    );
  } else if (view === 'library') {
    main = (
      <LibraryView
        active
        onOpened={openItem}
        onRecord={() => {
          setView('record');
        }}
      />
    );
  } else if (view === 'settings') {
    main = (
      <SettingsView
        settings={settings}
        update={update}
        chooseFolder={chooseFolder}
        version={version}
        onShowWelcome={() => {
          setWelcomeNow(true);
          setChecking(false);
          setEntered(false);
        }}
        onOpenLink={(url) => {
          void window.scrim.invoke('shell:open-external', { url });
        }}
      />
    );
  } else if (view === 'cursor') {
    main = <CursorPreview value={{ style: settings.cursorStyle, haloColor: settings.haloColor }} />;
  } else if (view === 'zoom') {
    main = <ZoomPreview value={zoomValue} />;
  } else if (view === 'camera') {
    main = (
      <CameraPreview
        value={cameraValue}
        deviceId={settings.cameraDeviceId}
        onCorner={(bubbleCorner) => {
          update({ bubbleCorner });
        }}
      />
    );
  } else if (view === 'audio') {
    main = (
      <AudioPreview value={audioValue} micOn={settings.micOn} deviceId={settings.micDeviceId} />
    );
  } else if (view === 'background') {
    main = <BackgroundPreview value={backgroundValue} />;
  } else {
    main = <Placeholder view={view} />;
  }

  const panel =
    view === 'cursor' ? (
      <div className="panel-body">
        <CursorPanel
          value={{ style: settings.cursorStyle, haloColor: settings.haloColor }}
          onChange={(value) => {
            update({ cursorStyle: value.style, haloColor: value.haloColor });
          }}
        />
      </div>
    ) : view === 'zoom' ? (
      <div className="panel-body">
        <ZoomPanel
          value={zoomValue}
          onChange={(value) => {
            update({
              zoomOn: value.on,
              zoomLevel: value.level,
              holdAfterClickMs: value.holdMs,
              smoothness: value.smoothness,
            });
          }}
        />
      </div>
    ) : view === 'camera' ? (
      <div className="panel-body">
        <CameraPanel
          value={cameraValue}
          onChange={(value) => {
            update({
              cameraOn: value.on,
              bubbleSize: value.size,
              bubbleShape: value.shape,
              bubbleCorner: value.corner,
            });
          }}
        />
      </div>
    ) : view === 'audio' ? (
      <div className="panel-body">
        <AudioPanel
          value={audioValue}
          onChange={(value) => {
            update({ keepSound: value.keepSound, micVolume: value.volume });
          }}
        />
      </div>
    ) : view === 'background' ? (
      <div className="panel-body">
        <BackgroundPanel
          value={backgroundValue}
          onChange={(value) => {
            update({
              backgroundId: value.id,
              backgroundPadding: value.padding,
              backgroundCorners: value.corners,
              backgroundShadow: value.shadow,
            });
          }}
        />
      </div>
    ) : view === 'record' ? (
      <RecordPanel
        settings={settings}
        cameras={devices.cameras}
        mics={devices.mics}
        onChange={update}
        onChooseFolder={() => void chooseFolder('recordings')}
      />
    ) : view === 'screenshot' ? (
      <ScreenshotPanel
        shots={shots}
        openPath={shot?.path ?? null}
        onOpen={(entry) => {
          setShot({ path: entry.path, width: entry.width, height: entry.height });
        }}
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
