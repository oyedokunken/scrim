import {
  sampleCamera,
  viewRect,
  type CameraKeyframe,
  type CameraPose,
  type ViewRect,
} from '../camera/camera';
import { toMediaTime } from '../clock/media-time';
import type { EditList } from '../edit/edit-list';
import { outputSize, type ResolutionPreset } from '../export/size';
import type { Frame, InputEvent } from '../input/types';
import type { SessionFile } from '../session/schema';
import type { ZoomMoment } from '../zoom/moments';
import { planCamera, planZoomMoments } from '../zoom/plan-zoom';
import { planAudio, type AudioPiece } from './audio';
import {
  BUBBLE_DEFAULTS,
  CURSOR_DEFAULTS,
  DEFAULT_BACKGROUND_ID,
  DEFAULT_FPS,
  ZOOM_DEFAULTS,
  ZOOM_LIMITS,
  type CursorStyle,
} from './constants';
import { cursorStateAt, NO_CURSOR, prepareCursor, type CursorState } from './cursor';
import {
  computeBubble,
  computeLayout,
  type BackgroundStyle,
  type BubbleLayout,
  type BubbleStyle,
  type Layout,
} from './layout';
import { buildTimeline, frameCount, frameTime, outputToSource, type Timeline } from './timeline';

/**
 * Look settings that can be changed after recording. They belong in `edits.json`; until that file
 * carries them, the export service passes them in. Anything left out takes its default.
 */
export interface RenderStyle {
  cursor?: { style?: CursorStyle | undefined } | undefined;
  zoom?:
    | {
        enabled?: boolean | undefined;
        maxZoom?: number | undefined;
        holdMs?: number | undefined;
        easeMs?: number | undefined;
      }
    | undefined;
  background?: BackgroundStyle | undefined;
  bubble?: BubbleStyle | undefined;
}

export interface RenderSettings {
  preset: ResolutionPreset;
  fps?: number | undefined;
  keepAudio?: boolean | undefined;
  style?: RenderStyle | undefined;
}

export interface RenderInput {
  session: SessionFile;
  /** The saved input log, or null when the mouse could not be logged. */
  log: { frame: Frame; events: readonly InputEvent[] } | null;
  /** `zoom` holds the moments the person edited. Without it the moments come from the clicks. */
  edits: Pick<EditList, 'trim' | 'cuts'> & {
    zoom?: { moments: readonly ZoomMoment[] } | undefined;
  };
  settings: RenderSettings;
}

/** Everything a compositor needs to draw one output frame. Coordinates are noted per field. */
export interface FrameDescription {
  outputTimeMs: number;
  /** Time on the recording clock, which the input log and the edit list use. */
  recordingTimeMs: number;
  /** Where to read the screen file, in its own time. Hold the last frame past its end. */
  screenTimeMs: number;
  /** Where to read the camera file, or null before the camera started or when there is none. */
  cameraTimeMs: number | null;
  pose: CameraPose;
  /** The part of the recorded area shown, in frame pixels. Draw it into `layout.content`. */
  view: ViewRect;
  /** Halo and ripples, in frame pixels of the recorded area, so they zoom with the picture. */
  cursor: CursorState;
  bubble: BubbleLayout | null;
}

export interface RenderModel {
  fps: number;
  totalMs: number;
  frameCount: number;
  /** Size of the recorded area in pixels. */
  source: Frame;
  layout: Layout;
  timeline: Timeline;
  keyframes: readonly CameraKeyframe[];
  /**
   * The zoom moments the keyframes were planned from: the edited list when there is one, else the
   * ones found from the clicks. Empty when there is no input log, even if zoom is switched off.
   */
  zoomMoments: readonly ZoomMoment[];
  /** Mic pieces in output order, or an empty list when there is no mic or sound is dropped. */
  audio: readonly AudioPiece[];
  /** Why zoom and cursor effects are off, in plain words, or null when they are on. */
  effectsOffReason: string | null;
  describeAt(outputTimeMs: number): FrameDescription;
  describeFrame(index: number): FrameDescription;
}

/** Recorded length in milliseconds with paused time left out. Never taken from a container. */
export function recordingDuration(session: SessionFile): number {
  const stops = session.tracks.map((track) => track.stoppedAt ?? session.heartbeatElapsedMs);
  const end = stops.length === 0 ? session.heartbeatElapsedMs : Math.max(...stops);
  return toMediaTime(end, 0, session.pauses);
}

function sourceFrame(input: RenderInput): Frame {
  const { source } = input.session;
  if (source.cropPx) return { width: source.cropPx.width, height: source.cropPx.height };
  if (source.frame) return source.frame;
  return input.log?.frame ?? { width: 1920, height: 1080 };
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, value));
}

/** Builds the pure model for one export. It does no I/O and can run in a worker. */
export function createRenderModel(input: RenderInput): RenderModel {
  const { session, edits, settings } = input;
  const style = settings.style ?? {};
  const fps = settings.fps !== undefined && settings.fps > 0 ? settings.fps : DEFAULT_FPS;
  const pauses = session.pauses;

  const duration = recordingDuration(session);
  const timeline = buildTimeline(duration, edits);
  const source = sourceFrame(input);
  const output = outputSize(source, settings.preset);
  const layout = computeLayout(
    source,
    output,
    style.background ?? { spec: { kind: 'preset', id: DEFAULT_BACKGROUND_ID } },
  );

  const log = session.input.status === 'recorded' ? input.log : null;
  const effectsOffReason =
    log !== null
      ? null
      : session.input.status === 'unavailable'
        ? `Cursor effects and auto zoom are off because the mouse could not be logged (${session.input.reason}).`
        : 'Cursor effects and auto zoom are off because there is no input log.';

  const zoom = style.zoom ?? {};
  const zoomOn = zoom.enabled ?? ZOOM_DEFAULTS.enabled;
  const zoomOptions = {
    maxZoom: clampZoom(zoom.maxZoom ?? ZOOM_DEFAULTS.maxZoom),
    holdMs: zoom.holdMs ?? ZOOM_DEFAULTS.holdMs,
    easeMs: zoom.easeMs ?? ZOOM_DEFAULTS.easeMs,
  };
  const zoomLog = log === null ? null : { frame: log.frame, events: log.events };
  const zoomMoments: readonly ZoomMoment[] =
    zoomLog === null
      ? []
      : (edits.zoom?.moments ?? planZoomMoments(zoomLog, zoomOptions, duration));
  const keyframes = zoomLog !== null && zoomOn ? planCamera(zoomMoments, zoomLog, zoomOptions) : [];

  const cursorStyle = style.cursor?.style ?? CURSOR_DEFAULTS.style;
  const cursorTrack = log === null ? null : prepareCursor(log.events, log.frame);
  const cameraFrame = log?.frame ?? source;

  const offsetOf = (kind: 'screen' | 'camera' | 'mic'): number | null => {
    const track = session.tracks.find((candidate) => candidate.kind === kind);
    return track === undefined ? null : toMediaTime(track.startedAt, 0, pauses);
  };
  const screenOffset = offsetOf('screen') ?? 0;
  const cameraOffset = offsetOf('camera');
  const micOffset = offsetOf('mic');

  const micTrack = session.tracks.find((track) => track.kind === 'mic');
  let audio: AudioPiece[] = [];
  if (micTrack !== undefined && micOffset !== null && settings.keepAudio !== false) {
    const stop = micTrack.stoppedAt ?? session.heartbeatElapsedMs;
    audio = planAudio(timeline, micOffset, toMediaTime(stop, micTrack.startedAt, pauses));
  }

  const bubble =
    cameraOffset === null ? null : computeBubble(layout.content, style.bubble ?? BUBBLE_DEFAULTS);

  const describeAt = (outputTimeMs: number): FrameDescription => {
    const recordingTimeMs = outputToSource(timeline, outputTimeMs);
    const pose = sampleCamera(keyframes, recordingTimeMs, cameraFrame);
    const cameraTime = cameraOffset === null ? null : recordingTimeMs - cameraOffset;
    return {
      outputTimeMs,
      recordingTimeMs,
      screenTimeMs: Math.max(0, recordingTimeMs - screenOffset),
      cameraTimeMs: cameraTime !== null && cameraTime >= 0 && bubble !== null ? cameraTime : null,
      pose,
      view: viewRect(pose, cameraFrame),
      cursor:
        cursorTrack === null ? NO_CURSOR : cursorStateAt(cursorTrack, recordingTimeMs, cursorStyle),
      bubble,
    };
  };

  return {
    fps,
    totalMs: timeline.totalMs,
    frameCount: frameCount(timeline.totalMs, fps),
    source,
    layout,
    timeline,
    keyframes,
    zoomMoments,
    audio,
    effectsOffReason,
    describeAt,
    describeFrame: (index) => describeAt(frameTime(index, fps)),
  };
}
