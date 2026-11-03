import { Maximize, Minimize, Pause, Play, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../ui';
import { formatTimer } from '../format';
import { LivePane, createLiveModel, type LivePreviewSource } from './live-preview';
import { MicTrack } from './mic-track';

export type ReviewMode = 'before' | 'after' | 'compare';

/** Playback speeds the person can pick. One value drives every video on screen. */
export const SPEEDS = [0.5, 1, 1.5, 2] as const;

/** The most the two pictures may drift apart before the second is pulled back, in seconds. */
const DRIFT_S = 0.15;

export interface ReviewPlayerProps {
  mode: ReviewMode;
  before: string;
  /** Null until the working copy exists. */
  after: string | null;
  /**
   * What the finished look is drawn from while the real video does not exist yet. Without it the
   * After view has nothing to show until the file is made.
   */
  live?: LivePreviewSource | undefined;
  /** The text on the live picture. Null leaves it off. */
  liveLabel?: string | null;
  /** One plain video: no Before or After captions. The label becomes its accessible name. */
  plain?: { label: string; autoPlay?: boolean } | undefined;
}

interface PaneProps {
  label: string;
  src: string;
  muted: boolean;
  setRef: (element: HTMLVideoElement | null) => void;
  onTime?: () => void;
  onEnded?: () => void;
  onLoaded?: () => void;
  onLoadedData?: () => void;
  /** Keeps the picture in its place but out of sight, while another one still covers it. */
  covered?: boolean;
  volume: number;
  /** Hides the caption, for a single plain video. */
  plain?: boolean;
}

function Pane({
  label,
  src,
  muted,
  setRef,
  onTime,
  onEnded,
  onLoaded,
  onLoadedData,
  covered = false,
  volume,
  plain = false,
}: PaneProps) {
  const element = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (element.current !== null) element.current.volume = volume;
  }, [volume]);
  return (
    <figure className={covered ? 'review-pane covered' : 'review-pane'}>
      <video
        ref={(node) => {
          element.current = node;
          if (node !== null) node.volume = volume;
          setRef(node);
        }}
        className="review-video"
        src={src}
        muted={muted}
        playsInline
        preload="auto"
        aria-label={label}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onLoadedMetadata={onLoaded}
        onLoadedData={onLoadedData}
      />
      {plain ? null : <figcaption className="review-caption">{label}</figcaption>}
    </figure>
  );
}

interface SliderProps {
  label: string;
  value: number;
  max: number;
  /** How far an arrow key moves the value. */
  step: number;
  valueText: string;
  className: string;
  onChange: (value: number) => void;
}

/** A slider drawn by hand: drag or click to set it, arrow keys step it, Home and End jump. */
function Slider({ label, value, max, step, valueText, className, onChange }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    fill.current?.style.setProperty('--fraction', String(max > 0 ? value / max : 0));
  }, [value, max]);

  const at = (clientX: number): void => {
    const box = track.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || max <= 0) return;
    onChange(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * max);
  };

  return (
    <div
      ref={track}
      className={className}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max * 100) / 100}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-valuetext={valueText}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        at(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging.current) at(event.clientX);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(event) => {
        const move: Record<string, number> = {
          ArrowLeft: -step,
          ArrowDown: -step,
          ArrowRight: step,
          ArrowUp: step,
        };
        const delta = move[event.key];
        if (delta !== undefined) onChange(Math.min(max, Math.max(0, value + delta)));
        else if (event.key === 'Home') onChange(0);
        else if (event.key === 'End') onChange(max);
        else return;
        event.preventDefault();
      }}
    >
      <span ref={fill} className="review-seek-fill" />
    </div>
  );
}

/**
 * Plays the raw recording, the finished look, or both side by side. One set of controls (play,
 * seek and speed) drives every video on screen, so the two halves of Compare stay in step.
 */
export function ReviewPlayer({ mode, before, after, live, liveLabel, plain }: ReviewPlayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(1);
  const [silenced, setSilenced] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const beforeEl = useRef<HTMLVideoElement | null>(null);
  const afterEl = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  // The real file takes over from the live picture once it has shown its first frame.
  const [loadedAfter, setLoadedAfter] = useState<string | null>(null);
  const afterShown = after !== null && loadedAfter === after;
  // Only a person who saw the wait gets the hand over. Opening a finished recording shows the file.
  const [sawWait, setSawWait] = useState(after === null);
  if (after === null && !sawWait) setSawWait(true);
  const showLive =
    live !== undefined && mode === 'after' && (after === null || (sawWait && !afterShown));
  const showBefore = !showLive && (mode === 'before' || mode === 'compare' || after === null);
  const showAfter = after !== null && (mode === 'after' || mode === 'compare');
  // The voice comes from the microphone file whenever the real video is not the one carrying the
  // sound, so exactly one source is audible: the real After, or the voice, never both.
  const liveModel = useMemo(() => (live === undefined ? null : createLiveModel(live)), [live]);
  const micUrl = live?.project.media.mic;
  const voiceOn = liveModel !== null && micUrl !== undefined && !(showAfter && !showLive);
  const playingNow = useRef(false);
  useEffect(() => {
    playingNow.current = playing;
  }, [playing]);
  const active = (): HTMLVideoElement[] =>
    [showBefore || showLive ? beforeEl.current : null, showAfter ? afterEl.current : null].filter(
      (element): element is HTMLVideoElement => element !== null,
    );
  // The first picture on screen is the clock for the controls.
  const lead = (): HTMLVideoElement | null => active()[0] ?? null;

  const pauseAll = useCallback((): void => {
    for (const element of [beforeEl.current, afterEl.current]) element?.pause();
    setPlaying(false);
  }, []);

  // Changing the view stops playback, and starts again from the same moment on the videos now shown.
  const viewKey = `${mode}:${after === null && live === undefined ? 'no' : 'yes'}`;
  const [seenKey, setSeenKey] = useState(viewKey);
  if (seenKey !== viewKey) {
    setSeenKey(viewKey);
    setPlaying(false);
  }
  const timeNow = useRef(0);
  useEffect(() => {
    timeNow.current = time;
  }, [time]);
  useEffect(() => {
    for (const element of [beforeEl.current, afterEl.current]) {
      if (element === null) continue;
      element.pause();
      element.currentTime = timeNow.current;
    }
  }, [viewKey]);

  useEffect(() => {
    for (const element of [beforeEl.current, afterEl.current]) {
      if (element !== null) element.playbackRate = speed;
    }
  }, [speed, mode]);

  const autoStarted = useRef(false);
  const toggleFullscreen = useCallback((): void => {
    const element = root.current;
    if (element === null) return;
    if (document.fullscreenElement !== null) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void element.requestFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onChange = (): void => {
      setFullscreen(document.fullscreenElement === root.current && root.current !== null);
    };
    // F toggles fullscreen from anywhere on the page, except while someone types.
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      // Chromium leaves fullscreen on a real Escape before the page sees it. This covers the
      // keyboard events that reach the page instead, and keeps the page behind from reacting.
      if (
        event.key === 'Escape' &&
        root.current !== null &&
        document.fullscreenElement === root.current
      ) {
        event.preventDefault();
        void document.exitFullscreen().catch(() => undefined);
        return;
      }
      if (event.key !== 'f' && event.key !== 'F') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (document.querySelector('dialog[open]') !== null) return;
      event.preventDefault();
      toggleFullscreen();
    };
    const node = root.current;
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('keydown', onKey);
      if (node !== null && document.fullscreenElement === node) void document.exitFullscreen();
    };
  }, [toggleFullscreen]);

  const toggle = (): void => {
    if (playing) {
      pauseAll();
      return;
    }
    const videos = active();
    const first = videos[0];
    if (first === undefined) return;
    if (first.ended || (length > 0 && first.currentTime >= length - 0.05)) {
      for (const element of videos) element.currentTime = 0;
    }
    for (const element of videos) element.playbackRate = speed;
    void Promise.all(videos.map((element) => element.play())).then(
      () => {
        setPlaying(true);
      },
      () => {
        pauseAll();
      },
    );
  };

  const moveTo = (seconds: number): void => {
    for (const element of active()) element.currentTime = seconds;
    setTime(seconds);
  };

  const onTime = (): void => {
    const first = lead();
    if (first === null) return;
    setTime(first.currentTime);
    const second = active()[1];
    if (second !== undefined && Math.abs(second.currentTime - first.currentTime) > DRIFT_S) {
      second.currentTime = first.currentTime;
    }
  };

  // The finished file has its first frame. It starts where the live picture is and goes on playing
  // if it was playing, and only then does it cover the live picture, so nothing jumps.
  const onAfterReady = (): void => {
    const real = afterEl.current;
    if (real === null || after === null || !showLive) return;
    const wanted = beforeEl.current?.currentTime ?? timeNow.current;
    real.playbackRate = speed;
    const reveal = (): void => {
      setLoadedAfter(after);
      if (playingNow.current) void real.play().catch(() => undefined);
    };
    if (Math.abs(real.currentTime - wanted) < 0.05) {
      reveal();
      return;
    }
    real.addEventListener('seeked', reveal, { once: true });
    real.currentTime = wanted;
  };

  const onLoaded = (): void => {
    const first = lead();
    if (first !== null && Number.isFinite(first.duration)) setLength(first.duration);
    // A video opened from its play badge starts by itself, once, through the same play path.
    if (plain?.autoPlay === true && !autoStarted.current) {
      autoStarted.current = true;
      toggle();
    }
  };

  return (
    <div ref={root} className="review-player" data-fullscreen={fullscreen ? 'true' : 'false'}>
      <div
        onDoubleClick={toggleFullscreen}
        className={
          mode === 'compare' && showAfter
            ? 'review-panes two'
            : showLive
              ? 'review-panes stacked'
              : 'review-panes'
        }
      >
        {live !== undefined && showLive ? (
          <LivePane
            source={live}
            screenUrl={before}
            setScreenRef={(element) => {
              beforeEl.current = element;
            }}
            onTime={onTime}
            onEnded={pauseAll}
            onLoaded={onLoaded}
            playing={playing}
            {...(liveLabel === undefined ? {} : { label: liveLabel })}
          />
        ) : null}
        {showBefore ? (
          <Pane
            label={plain?.label ?? 'Before'}
            src={before}
            muted={mode === 'compare' || voiceOn || silenced}
            volume={volume}
            plain={plain !== undefined}
            setRef={(element) => {
              beforeEl.current = element;
            }}
            onTime={onTime}
            onEnded={pauseAll}
            onLoaded={onLoaded}
          />
        ) : null}
        {showAfter ? (
          <Pane
            label="After"
            src={after}
            muted={showLive || silenced}
            volume={volume}
            covered={showLive}
            setRef={(element) => {
              afterEl.current = element;
            }}
            onLoadedData={onAfterReady}
            {...(showBefore || showLive ? {} : { onTime, onEnded: pauseAll, onLoaded })}
          />
        ) : null}
      </div>
      {liveModel !== null && micUrl !== undefined ? (
        <MicTrack
          src={micUrl}
          model={liveModel}
          clock={beforeEl}
          playing={playing}
          enabled={voiceOn}
          volume={volume}
          muted={silenced}
        />
      ) : null}
      <div className="review-controls">
        <Button
          variant="primary"
          aria-label={playing ? 'Pause' : 'Play'}
          icon={playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} />}
          onClick={toggle}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Slider
          label="Seek"
          value={time}
          max={length}
          step={1}
          valueText={formatTimer(time * 1000)}
          className="review-seek"
          onChange={moveTo}
        />
        <span className="review-time" aria-live="off">
          {formatTimer(time * 1000)} / {formatTimer(length * 1000)}
        </span>
        <div className="review-speed" role="group" aria-label="Speed">
          {SPEEDS.map((value) => (
            <Button
              key={value}
              variant={value === speed ? 'primary' : 'secondary'}
              aria-pressed={value === speed}
              onClick={() => {
                setSpeed(value);
              }}
            >
              {`${String(value)}x`}
            </Button>
          ))}
        </div>
        <div className="review-volume">
          <Button
            variant="secondary"
            aria-label={silenced || volume === 0 ? 'Unmute' : 'Mute'}
            icon={
              silenced || volume === 0 ? (
                <VolumeX size={16} strokeWidth={2} />
              ) : volume < 0.5 ? (
                <Volume1 size={16} strokeWidth={2} />
              ) : (
                <Volume2 size={16} strokeWidth={2} />
              )
            }
            onClick={() => {
              if (volume === 0) setVolume(1);
              setSilenced(!(silenced || volume === 0));
            }}
          />
          <Slider
            label="Volume"
            value={silenced ? 0 : volume}
            max={1}
            step={0.05}
            valueText={`${String(Math.round((silenced ? 0 : volume) * 100))} percent`}
            className="review-seek review-volume-slider"
            onChange={(next) => {
              setVolume(next);
              setSilenced(false);
            }}
          />
        </div>
        <Button
          variant="secondary"
          aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-keyshortcuts="F"
          icon={
            fullscreen ? (
              <Minimize size={16} strokeWidth={2} />
            ) : (
              <Maximize size={16} strokeWidth={2} />
            )
          }
          onClick={toggleFullscreen}
        />
      </div>
    </div>
  );
}
