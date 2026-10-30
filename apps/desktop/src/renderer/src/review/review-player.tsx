import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../ui';
import { formatTimer } from '../format';

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
}

interface PaneProps {
  label: string;
  src: string;
  muted: boolean;
  setRef: (element: HTMLVideoElement | null) => void;
  onTime?: () => void;
  onEnded?: () => void;
  onLoaded?: () => void;
}

function Pane({ label, src, muted, setRef, onTime, onEnded, onLoaded }: PaneProps) {
  return (
    <figure className="review-pane">
      <video
        ref={setRef}
        className="review-video"
        src={src}
        muted={muted}
        playsInline
        preload="auto"
        aria-label={label}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onLoadedMetadata={onLoaded}
      />
      <figcaption className="review-caption">{label}</figcaption>
    </figure>
  );
}

interface SeekBarProps {
  seconds: number;
  length: number;
  onSeek: (seconds: number) => void;
}

/** A slider drawn by hand: drag or click to seek, arrow keys move one second, Home and End jump. */
function SeekBar({ seconds, length, onSeek }: SeekBarProps) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    fill.current?.style.setProperty('--fraction', String(length > 0 ? seconds / length : 0));
  }, [seconds, length]);

  const at = (clientX: number): void => {
    const box = track.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || length <= 0) return;
    onSeek(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * length);
  };

  return (
    <div
      ref={track}
      className="review-seek"
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(length)}
      aria-valuenow={Math.round(seconds)}
      aria-valuetext={formatTimer(seconds * 1000)}
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
        const step: Record<string, number> = {
          ArrowLeft: -1,
          ArrowDown: -1,
          ArrowRight: 1,
          ArrowUp: 1,
        };
        const delta = step[event.key];
        if (delta !== undefined) onSeek(Math.min(length, Math.max(0, seconds + delta)));
        else if (event.key === 'Home') onSeek(0);
        else if (event.key === 'End') onSeek(length);
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
export function ReviewPlayer({ mode, before, after }: ReviewPlayerProps) {
  const beforeEl = useRef<HTMLVideoElement | null>(null);
  const afterEl = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  const showBefore = mode === 'before' || mode === 'compare' || after === null;
  const showAfter = after !== null && (mode === 'after' || mode === 'compare');
  const active = (): HTMLVideoElement[] =>
    [showBefore ? beforeEl.current : null, showAfter ? afterEl.current : null].filter(
      (element): element is HTMLVideoElement => element !== null,
    );
  // The first picture on screen is the clock for the controls.
  const lead = (): HTMLVideoElement | null => active()[0] ?? null;

  const pauseAll = useCallback((): void => {
    for (const element of [beforeEl.current, afterEl.current]) element?.pause();
    setPlaying(false);
  }, []);

  // Changing the view stops playback, and starts again from the same moment on the videos now shown.
  const viewKey = `${mode}:${after === null ? 'no' : 'yes'}`;
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

  const onLoaded = (): void => {
    const first = lead();
    if (first !== null && Number.isFinite(first.duration)) setLength(first.duration);
  };

  return (
    <div className="review-player">
      <div className={mode === 'compare' && showAfter ? 'review-panes two' : 'review-panes'}>
        {showBefore ? (
          <Pane
            label="Before"
            src={before}
            muted={mode === 'compare'}
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
            muted={false}
            setRef={(element) => {
              afterEl.current = element;
            }}
            {...(showBefore ? {} : { onTime, onEnded: pauseAll, onLoaded })}
          />
        ) : null}
      </div>
      <div className="review-controls">
        <Button
          variant="primary"
          aria-label={playing ? 'Pause' : 'Play'}
          icon={playing ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} />}
          onClick={toggle}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <SeekBar seconds={time} length={length} onSeek={moveTo} />
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
      </div>
    </div>
  );
}
