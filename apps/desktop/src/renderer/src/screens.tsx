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
import { Button, useShowError, type ShownError } from '../ui';
import {
  useAppVersion,
  useDevices,
  useRecordingOutcome,
  useRecordingSnapshot,
  useScreenshotTaken,
  useExportJob,
  useScreenshots,
  useSettings,
} from './hooks';

const LIVE = new Set(['starting', 'recording', 'paused', 'stopping']);

function deviceChoice(enabled: boolean, deviceId: string | null) {
  return { enabled, ...(deviceId === null ? {} : { deviceId }) };
}

/** Pause, resume and stop, shared by the control bar and the main window while recording. */
function useRecordingControls(onError: (error: ShownError) => void) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (channel: 'recording:pause' | 'recording:resume' | 'recording:stop') => {
      setBusy(true);
      try {
        const result = await window.scrim.invoke(channel);
        if (!result.ok) {
          onError({
            title: 'Scrim could not do that to the recording',
            message: result.error.message,
            nextStep: result.error.nextStep,
            code: result.error.code,
            retry: () => {
              void run(channel);
            },
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [onError],
  );

  return {
    busy,
    pause: () => void run('recording:pause'),
    resume: () => void run('recording:resume'),
    stop: () => void run('recording:stop'),
  };
}

/** The small bar over the screen: the whole content of the control window. */
export function ControlScreen() {
  const snapshot = useRecordingSnapshot();
  const controls = useRecordingControls(() => undefined);
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
  const exportJob = useExportJob();
  const devices = useDevices();
  const showError = useShowError();
  const controls = useRecordingControls(showError);
  const version = useAppVersion();
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState<ViewId>('record');
  const [shooting, setShooting] = useState(false);
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

  const start = useCallback(
    async (chosen: Settings): Promise<void> => {
      setStarting(true);
      try {
        // The overlay does the choosing, the countdown and the start. A cancel shows nothing.
        const result = await window.scrim.invoke('area:run', {
          mode: 'record',
          camera: deviceChoice(chosen.cameraOn, chosen.cameraDeviceId),
          mic: deviceChoice(chosen.micOn, chosen.micDeviceId),
        });
        if (!result.ok && result.reason === 'rejected') {
          showError({
            title: 'Scrim could not start the recording',
            message: result.error.message,
            nextStep: result.error.nextStep,
            code: result.error.code,
            retry: () => {
              void start(chosen);
            },
          });
        } else if (!result.ok && result.reason === 'failed') {
          showError({
            title: 'Scrim could not open the area chooser',
            message: 'Try again. If it keeps happening, restart Scrim.',
            code: 'area-failed',
            retry: () => {
              void start(chosen);
            },
          });
        }
      } finally {
        setStarting(false);
      }
    },
    [showError],
  );

  /** A saved capture opens its result. One that was copied but could not be saved says why. */
  const acceptShot = useCallback(
    (taken: {
      path?: string | undefined;
      saveError?: { message: string; nextStep: string } | undefined;
      width: number;
      height: number;
    }): void => {
      if (taken.path !== undefined) {
        setShot({ path: taken.path, width: taken.width, height: taken.height });
      } else if (taken.saveError !== undefined) {
        setShot(null);
        showError({
          title: 'Scrim copied the screenshot but could not save it',
          message: taken.saveError.message,
          nextStep: taken.saveError.nextStep,
          code: 'screenshot-not-saved',
        });
      }
      refreshShots();
    },
    [refreshShots, showError],
  );

  // A capture from the shortcut opens the result too, whichever view was showing.
  useScreenshotTaken((taken) => {
    acceptShot(taken);
    setView('screenshot');
  });

  const shoot = useCallback(async () => {
    setShooting(true);
    try {
      const result = await window.scrim.invoke('area:run', {
        mode: 'screenshot',
        camera: deviceChoice(false, null),
        mic: deviceChoice(false, null),
      });
      if (result.ok && result.mode === 'screenshot') {
        acceptShot(result.result);
      } else if (!result.ok && result.reason === 'rejected') {
        showError({
          title: 'Scrim could not take the screenshot',
          message: result.error.message,
          nextStep: result.error.nextStep,
          code: result.error.code,
          retry: () => {
            void shoot();
          },
        });
      } else if (!result.ok && result.reason === 'failed') {
        showError({
          title: 'Scrim could not open the area chooser',
          message: 'Try again. If it keeps happening, restart Scrim.',
          code: 'area-failed',
          retry: () => {
            void shoot();
          },
        });
      }
    } finally {
      setShooting(false);
    }
  }, [acceptShot, showError]);

  // A failure the engine reports on its own, such as a full disk, shows once.
  useEffect(() => {
    if (failure === null) return;
    showError({
      title: 'Your recording ran into a problem',
      message: failure.message,
      nextStep: failure.nextStep,
      code: failure.code,
    });
  }, [failure, showError]);

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
  const exporting = exportJob?.phase === 'queued' || exportJob?.phase === 'running';
  const state = live
    ? `${snapshot.phase === 'paused' ? 'Paused' : 'Recording'} ${formatTimer(snapshot.elapsedMs)}`
    : exporting
      ? `Making video ${
          exportJob.progress === null
            ? ''
            : `${String(Math.round(exportJob.progress.fraction * 100))}%`
        }`.trim()
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
        onPause={controls.pause}
        onResume={controls.resume}
        onStop={controls.stop}
      />
    );
  } else if (view === 'record') {
    main = (
      <RecordView
        busy={starting}
        onStart={() => void start(settings)}
        saved={
          finished === null || !showsSavedCard(view)
            ? undefined
            : {
                finished,
                job: exportJob,
                onCancelExport: (jobId: string) => {
                  void window.scrim.invoke('export:cancel', { jobId });
                },
                onRetrySafer: (jobId: string) => {
                  void window.scrim.invoke('export:retry-safer', { jobId });
                },
                onReveal: (jobId: string, what: 'output' | 'source') => {
                  void window.scrim.invoke('export:reveal', { jobId, what });
                },
                onExportAgain: () => {
                  void window.scrim.invoke('export:start', { folder: finished.folder });
                },
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
