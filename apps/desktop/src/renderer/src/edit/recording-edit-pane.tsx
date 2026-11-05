import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ConfirmDialog, Segmented, useShowError, useToast } from '../../ui';
import { BackBar } from '../editor/back-bar';
import { RerenderChoice } from '../shell/rerender-choice';
import type { Look, Settings } from '../../../shared/settings';
import { editorApi } from '../shell/editor-bridge';
import { useExportJob } from '../hooks';
import { BackgroundPanel, type BackgroundValue } from '../panels/background-panel';
import { CursorPanel, type CursorValue } from '../panels/cursor-panel';
import { ZoomPanel, type ZoomValue } from '../panels/zoom-panel';
import { ExportProgress } from '../review/export-progress';
import type { LivePreviewSource } from '../review/live-preview';
import { ReviewPlayer } from '../review/review-player';
import { saveEditedRecording, type SaveMode } from './save-recording';

type Section = 'background' | 'cursor' | 'zoom';

/** Every part of the look, all present. */
export type FullLook = Pick<Settings, keyof Look>;

/** The three things a recording can be edited with. Nothing else is offered. */
export const EDIT_SECTIONS = [
  { value: 'background', label: 'Background' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'zoom', label: 'Zoom' },
] as const satisfies readonly { value: Section; label: string }[];

/** The look a recording starts from: the one saved in Settings. */
export function lookOf(settings: Settings): FullLook {
  return {
    cursorStyle: settings.cursorStyle,
    haloColor: settings.haloColor,
    zoomOn: settings.zoomOn,
    zoomLevel: settings.zoomLevel,
    holdAfterClickMs: settings.holdAfterClickMs,
    smoothness: settings.smoothness,
    backgroundId: settings.backgroundId,
    backgroundPadding: settings.backgroundPadding,
    backgroundCorners: settings.backgroundCorners,
    backgroundShadow: settings.backgroundShadow,
  };
}

function sameLook(a: FullLook, b: FullLook): boolean {
  return (Object.keys(a) as (keyof Look)[]).every((key) => a[key] === b[key]);
}

export interface RecordingEditPaneProps {
  /** The recording's working folder, one that Scrim offered. */
  folder: string;
  /** The name shown at the top. */
  name: string;
  /** Leaves the pane without saving. */
  onClose: () => void;
  /** Called after the new video is made. */
  onSaved: (mode: SaveMode) => void;
}

/**
 * Edits a finished recording: its background, its cursor and its zoom, and nothing else. The preview
 * is drawn live from the raw tracks, so every change shows at once. Saving renders the one MP4 again,
 * either over the current video or as a new one. The recording itself is never changed.
 */
export function RecordingEditPane({ folder, name, onClose, onSaved }: RecordingEditPaneProps) {
  const toast = useToast();
  const showError = useShowError();
  const job = useExportJob();
  const [loaded, setLoaded] = useState<{
    project: LivePreviewSource['project'];
    settings: Settings;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<FullLook | null>(null);
  const [look, setLook] = useState<FullLook | null>(null);
  const [section, setSection] = useState<Section>('background');
  const [choosing, setChoosing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState<{ jobId: string | null; mode: SaveMode } | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([editorApi.open(folder), window.scrim.invoke('settings:get')]).then(
      ([opened, settings]) => {
        if (!alive) return;
        if (!opened.ok) {
          setLoadError(opened.message);
          return;
        }
        setLoaded({ project: opened.project, settings });
        const start = lookOf(settings);
        setInitial(start);
        setLook(start);
      },
      () => {
        if (alive) setLoadError('Scrim could not open this recording. Try again.');
      },
    );
    return () => {
      alive = false;
    };
  }, [folder]);

  const source = useMemo<LivePreviewSource | null>(
    () =>
      loaded === null || look === null
        ? null
        : { project: loaded.project, settings: { ...loaded.settings, ...look } },
    [loaded, look],
  );

  // The render this pane started: follow it until it ends.
  const mine = saving?.jobId != null && job !== null && job.id === saving.jobId ? job : null;
  const working =
    saving !== null &&
    (saving.jobId === null || mine === null || mine.phase === 'queued' || mine.phase === 'running');
  useEffect(() => {
    if (saving === null || mine === null || handled.current === mine.id) return;
    if (mine.phase === 'done') {
      handled.current = mine.id;
      toast('Video saved', {
        text:
          saving.mode === 'replace' ? 'The video was replaced.' : 'It was saved as a new video.',
      });
      onSaved(saving.mode);
    } else if (mine.phase === 'failed' || mine.phase === 'cancelled') {
      handled.current = mine.id;
      if (mine.phase === 'failed') {
        showError({
          title: 'Scrim could not make the video',
          message: mine.error?.message ?? 'Something went wrong while making the video.',
          ...(mine.error?.nextStep === undefined ? {} : { nextStep: mine.error.nextStep }),
          code: 'edit-render-failed',
        });
      }
    }
  }, [saving, mine, toast, onSaved, showError]);

  const dirty = look !== null && initial !== null && !sameLook(look, initial);

  const save = (mode: SaveMode): void => {
    if (look === null) return;
    setChoosing(false);
    setSaving({ jobId: null, mode });
    void saveEditedRecording(folder, look, mode).then((started) => {
      if (started.ok) {
        setSaving({ jobId: started.jobId, mode });
      } else {
        setSaving(null);
        showError({
          title: 'Scrim could not make the video',
          message: started.message,
          code: 'edit-render-start',
        });
      }
    });
  };

  const leave = (): void => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  if (loadError !== null) {
    return (
      <section className="edit-pane" aria-label={`Edit ${name}`}>
        <p className="panel-error" role="alert">
          {loadError}
        </p>
        <div className="edit-actions">
          <Button onClick={onClose}>Back</Button>
        </div>
      </section>
    );
  }

  if (source === null || look === null) {
    return (
      <section className="edit-pane" aria-label={`Edit ${name}`} aria-busy="true">
        <p className="ui-help">Opening the recording</p>
      </section>
    );
  }

  const background: BackgroundValue = {
    id: look.backgroundId,
    padding: look.backgroundPadding,
    corners: look.backgroundCorners,
    shadow: look.backgroundShadow,
  };
  const cursor: CursorValue = { style: look.cursorStyle, haloColor: look.haloColor };
  const zoom: ZoomValue = {
    on: look.zoomOn,
    level: look.zoomLevel,
    holdMs: look.holdAfterClickMs,
    smoothness: look.smoothness,
  };
  const fraction = mine?.progress?.fraction ?? null;

  return (
    <section className="edit-pane" aria-label={`Edit ${name}`}>
      <BackBar onBack={leave} />
      <header className="edit-head">
        <h2 className="review-title">Edit {name}</h2>
      </header>
      <div className="edit-body">
        <div className="edit-preview">
          <ReviewPlayer
            mode="after"
            before={source.project.media.screen}
            after={null}
            live={source}
            liveLabel={null}
          />
        </div>
        <div className="edit-side">
          <Segmented
            label="What to edit"
            options={EDIT_SECTIONS}
            value={section}
            onChange={setSection}
          />
          <div className="edit-panel">
            {section === 'background' ? (
              <BackgroundPanel
                value={background}
                onChange={(value) => {
                  setLook({
                    ...look,
                    backgroundId: value.id,
                    backgroundPadding: value.padding,
                    backgroundCorners: value.corners,
                    backgroundShadow: value.shadow,
                  });
                }}
              />
            ) : section === 'cursor' ? (
              <CursorPanel
                value={cursor}
                onChange={(value) => {
                  setLook({ ...look, cursorStyle: value.style, haloColor: value.haloColor });
                }}
              />
            ) : (
              <ZoomPanel
                value={zoom}
                onChange={(value) => {
                  setLook({
                    ...look,
                    zoomOn: value.on,
                    zoomLevel: value.level,
                    holdAfterClickMs: value.holdMs,
                    smoothness: value.smoothness,
                  });
                }}
              />
            )}
          </div>
        </div>
      </div>
      {working ? (
        <div className="saved-export-row" role="status">
          <div className="saved-export-main">
            <p className="saved-export-line">
              {`Making your video${fraction === null ? '' : `, ${String(Math.round(fraction * 100))}%`}`}
            </p>
            <ExportProgress fraction={fraction} label="Making your video" />
          </div>
          {mine === null ? null : (
            <Button
              variant="danger"
              className="saved-export-cancel"
              onClick={() => {
                void window.scrim.invoke('export:cancel', { jobId: mine.id });
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      ) : null}
      <div className="edit-actions" role="group" aria-label="Save your changes">
        <Button
          disabled={working}
          disabledReason="Scrim is making the video. Cancel the export above, or wait for it to finish."
          onClick={leave}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={working || !dirty}
          disabledReason={
            working
              ? 'Scrim is making the video. Wait for it to finish.'
              : 'Change something first. There is nothing to save yet.'
          }
          onClick={() => {
            setChoosing(true);
          }}
        >
          Save
        </Button>
      </div>

      <RerenderChoice
        open={choosing}
        name={name}
        onKeep={() => {
          setChoosing(false);
        }}
        onReplace={() => {
          save('replace');
        }}
        onSaveNew={() => {
          save('new');
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => {
          setConfirmDiscard(false);
        }}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      >
        <p>The changes you made are lost. Your video and your recording are not changed.</p>
      </ConfirmDialog>
    </section>
  );
}
