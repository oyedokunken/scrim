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
import { FolderChip } from './shell/folder-chip';
import { usePlatformInfo } from './platform';
import { defaultFolderLabel, displayPath } from '../../shared/platform-info';
import { RecordPanel } from './shell/record-panel';
import { RecordView } from './shell/record-view';
import { EditorView } from './editor/editor-view';
import { SettingsView } from './settings/settings-view';
import { UpdateModal } from './updates/update-modal';
import { hasUpdateToShow, useUpdates } from './updates/use-updates';
import { LibraryView } from './library/library-view';
import type { OpenedItem } from './library/use-library';
import { editorApi, takeEdited } from './shell/editor-bridge';
import { RerenderChoice } from './shell/rerender-choice';
import { etaWords } from './review/review-screen';
import { ScreenshotView, type ShotInfo } from './shell/screenshot-view';
import { railView, showsSavedCard, VIEW_LABELS, type ViewId } from './shell/views';
import { PermissionCheck } from './shell/permission-check';
import { Welcome } from './shell/welcome';
import { Camera } from 'lucide-react';
import { Button, ConfirmDialog, useShowError, useToast, type ShownError } from '../ui';
import {
  useAppVersion,
  useDevices,
  usePendingRenders,
  useRecordingOutcome,
  useRecordingSnapshot,
  useScreenshotTaken,
  useExportJob,
  useExportStatus,
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
  const toast = useToast();
  const renders = usePendingRenders();
  const platform = usePlatformInfo();

  // A video that finishes or fails is told about wherever the person is in the app.
  useExportStatus((job) => {
    if (job.preview) return;
    if (job.phase === 'done' && job.result !== null) {
      const { fellBack, savedIn } = job.result;
      toast(fellBack ? "Saved in Scrim's own folder" : `Saved to ${savedIn}`, {
        label: 'Show in folder',
        run: () => {
          void window.scrim.invoke('export:reveal', { jobId: job.id, what: 'output' });
        },
      });
    } else if (job.phase === 'failed' && job.error !== null) {
      showError({
        title: 'Scrim could not make your video',
        message: job.error.message,
        nextStep: job.error.nextStep,
        code: job.error.code,
        details: job.error.stderrTail,
        retry: () => {
          void window.scrim.invoke('export:retry', { jobId: job.id });
        },
      });
    }
  });
  const controls = useRecordingControls(showError);
  const version = useAppVersion();
  const [starting, setStarting] = useState(false);
  const [view, setView] = useState<ViewId>('record');
  const [shooting, setShooting] = useState(false);
  const [shot, setShot] = useState<ShotInfo | null>(null);
  const [editorFolder, setEditorFolder] = useState<string | null>(null);
  /** The page an editor was opened from, so Back returns there. Null when it was not opened from a page. */
  const [openedFrom, setOpenedFrom] = useState<ViewId | null>(null);
  /** The Library detail page that was open, so coming back from an editor lands on the same item. */
  const [libraryDetail, setLibraryDetail] = useState<string | null>(null);
  /** Moves to another page. A screenshot lives in the main view only while the Screenshot page is open. */
  const changeView = useCallback((next: ViewId) => {
    if (next !== 'screenshot') setShot(null);
    if (next === 'library') setLibraryDetail(null);
    setOpenedFrom(null);
    setView(next);
  }, []);
  /** Goes back from an editor to where it was opened from, or to the Library when nowhere is known. */
  /** The recording whose saved edits wait for the choice between Replace and Save as new. */
  const [asking, setAsking] = useState<string | null>(null);
  const leaveEditor = useCallback(() => {
    const target = openedFrom ?? 'library';
    // Saved edits make the video again. The page of the recording that was just made replaces its video
    // at once. A recording from the Library asks first, because its video may be one the person shared.
    if (editorFolder !== null && takeEdited(editorFolder)) {
      if (finished?.folder === editorFolder) {
        void window.scrim.invoke('export:rerender', { folder: editorFolder, mode: 'replace' });
      } else {
        setAsking(editorFolder);
      }
    }
    setShot(null);
    setOpenedFrom(null);
    if (target !== 'library') setLibraryDetail(null);
    setView(target);
  }, [openedFrom, editorFolder, finished]);
  const [entered, setEntered] = useState(false);
  // Set by Show welcome again in the settings, which shows the welcome screen once even when it is switched off.
  const [welcomeNow, setWelcomeNow] = useState(false);
  const [checking, setChecking] = useState(false);
  const phase = snapshot.phase;
  const updates = useUpdates();
  const [updateOpen, setUpdateOpen] = useState(false);

  // An update must not start while the editor is open, so the main process is told when it is.
  const editing = view === 'editor';
  useEffect(() => {
    void window.scrim.invoke('app:activity', { editing }).catch(() => undefined);
  }, [editing]);

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
            code: result.step === undefined ? 'area-failed' : `area-failed:${result.step}`,
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

  /** What the person can do when Windows blocks a folder: open the setting, or pick another folder. */
  const blockedFolderActions = useCallback(
    (kind: 'recordings' | 'screenshots') => [
      {
        label: 'Open Windows Security',
        run: () => {
          void window.scrim.invoke('security:open');
        },
      },
      {
        label: 'Choose another folder',
        run: () => {
          void chooseFolder(kind);
        },
      },
    ],
    [chooseFolder],
  );

  /** A saved capture opens its result. One that was copied but could not be saved says why. */
  const acceptShot = useCallback(
    (taken: {
      path?: string | undefined;
      saveError?: { code?: string | undefined; message: string; nextStep: string } | undefined;
      width: number;
      height: number;
    }): void => {
      if (taken.path !== undefined) {
        setShot({ path: taken.path, width: taken.width, height: taken.height });
      } else {
        setShot(null);
      }
      if (taken.saveError !== undefined) {
        // Either the picture went to Scrim's own folder, or it was only copied. Both are said plainly.
        const kept = taken.path !== undefined;
        showError({
          title: kept
            ? "The screenshot was saved in Scrim's own folder"
            : 'Scrim copied the screenshot but could not save it',
          message: taken.saveError.message,
          nextStep: taken.saveError.nextStep,
          code: taken.saveError.code ?? 'screenshot-not-saved',
          actions: blockedFolderActions('screenshots'),
        });
      }
    },
    [showError, blockedFolderActions],
  );

  // A capture from the shortcut opens the result too, whichever view was showing.
  useScreenshotTaken((taken) => {
    acceptShot(taken);
    setOpenedFrom(null);
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
          code: result.step === undefined ? 'area-failed' : `area-failed:${result.step}`,
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
    // Back from the editor returns to the page that opened it. The Library stays selected in the rail.
    setOpenedFrom(view);
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
      ? displayPath(settings.screenshotFolder ?? defaultFolderLabel('Pictures', platform), platform)
      : displayPath(settings.destinationFolder ?? defaultFolderLabel('Videos', platform), platform);
  const exporting = exportJob?.phase === 'queued' || exportJob?.phase === 'running';
  const state = live
    ? `${snapshot.phase === 'paused' ? 'Paused' : 'Recording'} ${formatTimer(snapshot.elapsedMs)}`
    : exporting
      ? `Making video${
          exportJob.progress === null
            ? ''
            : ` ${String(Math.round(exportJob.progress.fraction * 100))}%${etaWords(exportJob.progress.etaMs)}`
        }`
      : 'Ready';

  const startButton = (
    <Button
      variant="primary"
      disabled={starting || live}
      disabledReason={
        live ? 'A recording is already running.' : 'Scrim is already starting a recording.'
      }
      onClick={() => {
        changeView('record');
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
      disabledReason={
        live
          ? 'Stop the recording before taking a screenshot.'
          : 'Scrim is already taking a screenshot.'
      }
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
        options={
          <RecordPanel
            settings={settings}
            cameras={devices.cameras}
            mics={devices.mics}
            onChange={update}
          />
        }
        busy={starting}
        onStart={() => void start(settings)}
        review={
          finished === null || !showsSavedCard(view)
            ? undefined
            : {
                finished,
                job: exportJob,
                onCancelJob: (jobId: string) => {
                  void window.scrim.invoke('export:cancel', { jobId });
                },
                onRetryJob: (jobId: string) => {
                  void window.scrim.invoke('export:retry', { jobId });
                },
                onRetrySafer: (jobId: string) => {
                  void window.scrim.invoke('export:retry-safer', { jobId });
                },
                onShowInFolder: () => {
                  void window.scrim.invoke('shell:show-in-folder', { path: finished.folder });
                },
                onRecordAgain: dismiss,
                onDiscarded: dismiss,
                onProblem: (message: string, nextStep: string) => {
                  showError({ title: 'Scrim could not discard this recording', message, nextStep });
                },
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
        }}
        onShot={(next) => {
          setShot(next);
        }}
        onTake={() => void shoot()}
        startEditing={openedFrom !== null}
        onLeaveEditor={openedFrom === null ? undefined : leaveEditor}
      />
    );
  } else if (view === 'editor' && editorFolder !== null) {
    main = (
      <EditorView
        key={editorFolder}
        folder={editorFolder}
        api={editorApi}
        settings={settings}
        onBack={leaveEditor}
      />
    );
  } else if (view === 'library') {
    main = (
      <LibraryView
        active
        initialDetailId={libraryDetail}
        onDetail={setLibraryDetail}
        onOpened={openItem}
        onRecord={() => {
          changeView('record');
        }}
      />
    );
  } else if (view === 'settings') {
    main = (
      <SettingsView
        settings={settings}
        update={update}
        chooseFolder={chooseFolder}
        updates={updates}
        onShowUpdate={() => {
          setUpdateOpen(true);
        }}
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
    ) : (
      <Placeholder view={view} inPanel />
    );

  return (
    <>
      <AppShell
        view={view}
        railSelected={railView(view, openedFrom)}
        onView={changeView}
        updatePill={hasUpdateToShow(updates.snapshot)}
        onUpdatePill={() => {
          setUpdateOpen(true);
        }}
        title={VIEW_LABELS[view]}
        titleAction={
          view === 'record' ? (
            <FolderChip
              path={displayPath(
                settings.destinationFolder ?? defaultFolderLabel('Videos', platform),
                platform,
              )}
              onChoose={() => void chooseFolder('recordings')}
            />
          ) : view === 'screenshot' ? (
            <FolderChip
              path={displayPath(
                settings.screenshotFolder ?? defaultFolderLabel('Pictures', platform),
                platform,
              )}
              onChoose={() => void chooseFolder('screenshots')}
            />
          ) : undefined
        }
        primary={view === 'record' ? startButton : view === 'screenshot' ? shotButton : undefined}
        status={{ state, folder }}
        panel={panel}
      >
        {main}
      </AppShell>
      <ConfirmDialog
        open={!live && renders.pending.length > 0}
        title="Finish your video?"
        confirmLabel="Finish now"
        cancelLabel="Not now"
        onCancel={() => {
          for (const item of renders.pending) {
            void window.scrim.invoke('export:dismiss-pending', { folder: item.folder });
          }
          renders.settle();
        }}
        onConfirm={() => {
          for (const item of renders.pending) {
            void window.scrim.invoke('export:resume-pending', { folder: item.folder });
          }
          renders.settle();
        }}
      >
        {renders.pending.length === 1
          ? `Scrim closed before the video for ${renders.pending[0]?.name ?? 'your recording'} was finished. Your recording is safe. Finish the video now?`
          : `Scrim closed before ${String(renders.pending.length)} videos were finished. Your recordings are safe. Finish them now?`}
      </ConfirmDialog>
      <RerenderChoice
        open={asking !== null}
        name={asking === null ? '' : (asking.split(/[\\/]/).pop() ?? '').replace(/\.scrim$/i, '')}
        onKeep={() => {
          setAsking(null);
        }}
        onReplace={() => {
          if (asking !== null) {
            void window.scrim.invoke('export:rerender', { folder: asking, mode: 'replace' });
          }
          setAsking(null);
        }}
        onSaveNew={() => {
          if (asking !== null) {
            void window.scrim.invoke('export:rerender', { folder: asking, mode: 'new' });
          }
          setAsking(null);
        }}
      />
      <UpdateModal
        open={updateOpen}
        snapshot={updates.snapshot}
        onClose={() => {
          setUpdateOpen(false);
        }}
        onDownload={updates.download}
        onInstall={updates.install}
      />
    </>
  );
}
