import { createRenderModel } from '@scrim/core/render';
import type { RenderModel } from '@scrim/core/render';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { cursorPaintCss, renderStyleFromSettings } from '../../../shared/render-style';
import type { Settings } from '../../../shared/settings';
import { paintFrame } from '../editor/draw-frame';
import type { EditorProject } from '../editor/editor-api';
import { useBackgroundElement } from '../panels/use-backgrounds';

/** How far the camera may drift from the screen before it is pulled back, in seconds. */
const DRIFT_S = 0.12;
/** The widest the canvas is drawn, in pixels, so a 4K recording does not cost a 4K canvas. */
const MAX_CANVAS_WIDTH = 1280;

/** What the live preview is made from: the same session, log and look the export reads. */
export interface LivePreviewSource {
  project: EditorProject;
  settings: Settings;
}

/**
 * The model the export would build for this recording at the recorded size, with the cuts and
 * the trim left out so the picture follows the raw file frame for frame while it plays.
 */
export function createLiveModel({ project, settings }: LivePreviewSource): RenderModel {
  return createRenderModel({
    session: project.session,
    log: project.log,
    edits: { trim: null, cuts: [], zoom: project.edits.zoom },
    settings: {
      preset: 'source',
      fps: 30,
      keepAudio: settings.keepSound,
      // The page names the person's own picture by its id and draws it itself, so the id stands in for a path.
      style: renderStyleFromSettings(settings, (id) => id),
    },
  });
}

export interface LivePaneProps {
  source: LivePreviewSource;
  /** Where the raw screen video plays from. */
  screenUrl: string;
  /** Receives the screen video, which is the clock the player controls drive. */
  setScreenRef: (element: HTMLVideoElement | null) => void;
  onTime: () => void;
  onEnded: () => void;
  onLoaded: () => void;
  /** True while the player is playing, so the camera follows. The voice is played by the player. */
  playing: boolean;
  /** The text on the picture. Null leaves it off. */
  label?: string | null;
}

/**
 * The finished look drawn live from the raw tracks while the real video is still being made: the
 * screen with the camera bubble over it, through the same render model and the same drawing code
 * the editor uses. It is replaced by the real file as soon as that exists.
 */
export function LivePane({
  source,
  screenUrl,
  setScreenRef,
  onTime,
  onEnded,
  onLoaded,
  playing,
  label = 'Preview. Your video is being made.',
}: LivePaneProps) {
  const model = useMemo(() => createLiveModel(source), [source]);
  const paint = useMemo(() => cursorPaintCss(source.settings.haloColor), [source.settings]);
  const screenEl = useRef<HTMLVideoElement | null>(null);
  const cameraEl = useRef<HTMLVideoElement | null>(null);
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const cameraUrl = source.project.media.camera;
  const backgroundImage = useBackgroundElement(source.settings.backgroundId);

  const { output } = model.layout;
  const canvasWidth = Math.min(output.width, MAX_CANVAS_WIDTH);
  const canvasHeight = Math.max(1, Math.round((canvasWidth * output.height) / output.width));

  const draw = useCallback(() => {
    const canvas = canvasEl.current;
    const screen = screenEl.current;
    const ctx = canvas?.getContext('2d');
    if (canvas === null || screen === null || !ctx) return;
    const frame = model.describeAt(screen.currentTime * 1000);
    const camera = cameraUrl === undefined ? null : cameraEl.current;
    if (camera !== null && frame.cameraTimeMs !== null) {
      const wanted = frame.cameraTimeMs / 1000;
      if (Math.abs(camera.currentTime - wanted) > DRIFT_S) camera.currentTime = wanted;
    }
    const k = canvas.width / output.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    paintFrame(
      ctx,
      'after',
      0.5,
      model,
      frame,
      { screen, camera, background: backgroundImage },
      paint,
    );
    const shown =
      frame.bubble !== null &&
      frame.cameraTimeMs !== null &&
      camera !== null &&
      camera.videoWidth > 0;
    canvas.dataset['bubble'] = shown ? 'true' : 'false';
  }, [model, paint, cameraUrl, output.width, backgroundImage]);

  // Draw on every frame while playing, and again whenever the picture changes while paused.
  useEffect(() => {
    const screen = screenEl.current;
    const camera = cameraEl.current;
    if (screen === null) return undefined;
    screen.addEventListener('seeked', draw);
    screen.addEventListener('loadeddata', draw);
    camera?.addEventListener('loadeddata', draw);
    camera?.addEventListener('seeked', draw);
    draw();
    let handle = 0;
    const tick = (): void => {
      draw();
      handle = requestAnimationFrame(tick);
    };
    if (playing) handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
      screen.removeEventListener('seeked', draw);
      screen.removeEventListener('loadeddata', draw);
      camera?.removeEventListener('loadeddata', draw);
      camera?.removeEventListener('seeked', draw);
    };
  }, [draw, playing]);

  // The camera plays and pauses with the screen.
  useEffect(() => {
    const camera = cameraEl.current;
    if (camera === null) return;
    if (playing) void camera.play().catch(() => undefined);
    else camera.pause();
  }, [playing]);

  return (
    <figure className="review-pane">
      <div className="review-live">
        <canvas
          ref={canvasEl}
          className="review-video"
          data-testid="live-preview"
          data-bubble="false"
          width={canvasWidth}
          height={canvasHeight}
          aria-label="Preview of the finished video"
        />
        {label === null ? null : (
          <p className="review-live-label" data-testid="live-preview-label">
            {label}
          </p>
        )}
      </div>
      <video
        ref={(element) => {
          screenEl.current = element;
          setScreenRef(element);
        }}
        src={screenUrl}
        muted
        playsInline
        preload="auto"
        hidden
        aria-label="Screen"
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onLoadedMetadata={onLoaded}
      />
      {cameraUrl === undefined ? null : (
        <video ref={cameraEl} src={cameraUrl} muted playsInline preload="auto" hidden />
      )}
      <figcaption className="review-caption">After</figcaption>
    </figure>
  );
}
