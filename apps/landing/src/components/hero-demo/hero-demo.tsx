'use client';

import { cursorAt, identityPose, sampleCamera } from '@scrim/core/zoom';
import { Pause, Play } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { DemoPlayer, browserClock } from '@/lib/demo/player';
import { poseToTransform } from '@/lib/demo/pose-to-transform';
import {
  DEMO_CLICKS,
  DEMO_DURATION_MS,
  DEMO_FRAME,
  DEMO_KEYFRAMES,
  DEMO_LOG,
  DEMO_ZOOM_SPANS,
  RIPPLE_DURATION_MS,
  STATIC_FRAME_TIME_MS,
  formatClock,
  SEARCH_WORD,
  typedCount,
  uiStateAt,
} from '@/lib/demo/script';
import styles from './hero-demo.module.css';
import { MockWindow } from './mock-window';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

type Vars = Record<`--${string}`, string>;
const vars = (values: Vars) => values as CSSProperties;

/** How many fading dots follow the cursor, and how far apart in time they are. */
const TRAIL_LENGTH = 5;
const TRAIL_STEP_MS = 55;

// The first frame, drawn by the server. The camera shows the whole screen and the cursor sits at
// its starting point, so the page never shows an empty box.
const START = cursorAt(DEMO_LOG.events, 0, DEMO_FRAME);
const ROOT_STYLE = vars({
  '--cx': String(START.x / DEMO_FRAME.width),
  '--cy': String(START.y / DEMO_FRAME.height),
  '--menu': '0',
  '--checked': '0',
  '--checkedMore': '0',
  '--chip': '0',
  '--search': '0',
  '--toast': '0',
  '--m1': '0.4',
  '--m2': '0.7',
  '--m3': '0.5',
  '--bob': '0',
});
const SCENE_STYLE: CSSProperties = {
  transform: poseToTransform(identityPose(DEMO_FRAME), DEMO_FRAME),
};
const RIPPLE_REST = vars({ '--p': '1', '--on': '0' });
const TRAIL_REST = (index: number) =>
  vars({
    '--tx': String(START.x / DEMO_FRAME.width),
    '--ty': String(START.y / DEMO_FRAME.height),
    '--i': String(index),
  });

/**
 * A live demonstration of auto zoom. A scripted cursor moves over a pretend app and clicks three
 * times, and the app answers each click. The camera comes from the same `planZoom` and
 * `sampleCamera` the desktop app will use. Each frame writes to the DOM directly, so React does
 * not render 60 times a second. The recording overlays (timer, zoom badge, face camera) sit
 * outside the zoomed scene, as they would in an exported video.
 */
export function HeroDemo() {
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const ripples = useRef<(HTMLSpanElement | null)[]>([]);
  const trail = useRef<(HTMLSpanElement | null)[]>([]);
  const clock = useRef<HTMLSpanElement>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const flag = useRef<HTMLSpanElement>(null);
  const typed = useRef<SVGTextElement | null>(null);
  const player = useRef<DemoPlayer | null>(null);
  const autoZoomRef = useRef(true);
  const scrubbing = useRef(false);

  const reducedMotion = usePrefersReducedMotion();
  // Auto means "play unless the visitor prefers reduced motion". A click makes it explicit.
  const [mode, setMode] = useState<'auto' | 'playing' | 'paused'>('auto');
  const [autoZoom, setAutoZoom] = useState(true);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  const playing = mode === 'playing' || (mode === 'auto' && !reducedMotion);
  const running = playing && inView && tabVisible;

  const draw = useCallback((timeMs: number) => {
    const element = root.current;
    const sceneElement = scene.current;
    if (element === null || sceneElement === null) {
      return;
    }
    const pose = autoZoomRef.current
      ? sampleCamera(DEMO_KEYFRAMES, timeMs, DEMO_FRAME)
      : identityPose(DEMO_FRAME);
    sceneElement.style.transform = poseToTransform(pose, DEMO_FRAME);

    const point = (t: number) => cursorAt(DEMO_LOG.events, t, DEMO_FRAME);
    const cursor = point(timeMs);
    element.style.setProperty('--cx', String(cursor.x / DEMO_FRAME.width));
    element.style.setProperty('--cy', String(cursor.y / DEMO_FRAME.height));

    trail.current.forEach((dot, index) => {
      const past = point(timeMs - (index + 1) * TRAIL_STEP_MS);
      dot?.style.setProperty('--tx', String(past.x / DEMO_FRAME.width));
      dot?.style.setProperty('--ty', String(past.y / DEMO_FRAME.height));
    });

    DEMO_CLICKS.forEach((click, index) => {
      const age = timeMs - click.t;
      const active = age >= 0 && age <= RIPPLE_DURATION_MS;
      const ripple = ripples.current[index];
      ripple?.style.setProperty('--p', active ? String(age / RIPPLE_DURATION_MS) : '1');
      ripple?.style.setProperty('--on', active ? '1' : '0');
    });

    const ui = uiStateAt(timeMs);
    element.style.setProperty('--menu', ui.menu.toFixed(3));
    element.style.setProperty('--checked', ui.checked.toFixed(3));
    element.style.setProperty('--checkedMore', ui.checkedMore.toFixed(3));
    element.style.setProperty('--chip', ui.chip.toFixed(3));
    element.style.setProperty('--search', ui.search.toFixed(3));
    // The word in the search box is typed a letter at a time.
    typed.current ??= element.querySelector<SVGTextElement>('[data-demo="typed"]');
    if (typed.current !== null) {
      typed.current.textContent = SEARCH_WORD.slice(0, typedCount(timeMs));
    }
    element.style.setProperty('--toast', ui.toast.toFixed(3));

    // The face camera breathes a little and the microphone bars move, as if someone were talking.
    const seconds = timeMs / 1000;
    element.style.setProperty('--bob', Math.sin(seconds * 2.2).toFixed(3));
    element.style.setProperty('--m1', (0.45 + 0.4 * Math.abs(Math.sin(seconds * 7.3))).toFixed(3));
    element.style.setProperty(
      '--m2',
      (0.35 + 0.55 * Math.abs(Math.sin(seconds * 5.1 + 1))).toFixed(3),
    );
    element.style.setProperty(
      '--m3',
      (0.4 + 0.45 * Math.abs(Math.sin(seconds * 9.2 + 2))).toFixed(3),
    );

    element.style.setProperty('--t', String(timeMs / DEMO_DURATION_MS));
    if (clock.current !== null) {
      clock.current.textContent = formatClock(timeMs);
    }
    const now = formatClock(timeMs);
    if (readout.current !== null) {
      readout.current.textContent = now;
    }
    if (flag.current !== null) {
      flag.current.textContent = now;
    }
    track.current?.style.setProperty('--t', String(timeMs / DEMO_DURATION_MS));
    if (badge.current !== null) {
      badge.current.textContent = `${pose.scale.toFixed(1)}x`;
    }
    if (slider.current !== null && !scrubbing.current) {
      slider.current.value = String(Math.round(timeMs));
    }

    element.dataset.scale = pose.scale.toFixed(2);
    element.dataset.time = String(Math.round(timeMs));
  }, []);

  useEffect(() => {
    const instance = new DemoPlayer({
      durationMs: DEMO_DURATION_MS,
      clock: browserClock,
      onFrame: draw,
    });
    player.current = instance;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry?.isIntersecting ?? false);
      },
      { threshold: 0.25 },
    );
    if (root.current !== null) {
      observer.observe(root.current);
    }
    const onVisibility = () => {
      setTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      instance.dispose();
      player.current = null;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [draw]);

  // With reduced motion the demo starts on a still frame that is already zoomed in.
  useEffect(() => {
    if (reducedMotion && mode === 'auto') {
      player.current?.seek(STATIC_FRAME_TIME_MS);
    }
  }, [reducedMotion, mode]);

  useEffect(() => {
    if (running) {
      player.current?.play();
    } else {
      player.current?.pause();
    }
  }, [running]);

  useEffect(() => {
    autoZoomRef.current = autoZoom;
    player.current?.refresh();
  }, [autoZoom]);

  return (
    <div className={styles.demo}>
      <div
        ref={root}
        className={styles.viewport}
        style={ROOT_STYLE}
        data-testid="hero-demo"
        data-playing={running ? 'true' : 'false'}
        data-scale="1.00"
        data-time="0"
        role="img"
        aria-label="A demonstration of auto zoom. A cursor moves over a task app and clicks three times. The view zooms in on each click, follows the cursor, then eases back out. A face camera sits in the corner and a timer counts the recording."
      >
        <div ref={scene} className={styles.scene} style={SCENE_STYLE}>
          <MockWindow />
          {Array.from({ length: TRAIL_LENGTH }, (_, index) => (
            <span
              key={index}
              ref={(element) => {
                trail.current[index] = element;
              }}
              className={styles.trail}
              style={TRAIL_REST(index)}
            />
          ))}
          {DEMO_CLICKS.map((click, index) => (
            <span
              key={click.t}
              ref={(element) => {
                ripples.current[index] = element;
              }}
              className={styles.ripple}
              style={{
                ...RIPPLE_REST,
                left: `${String((click.x / DEMO_FRAME.width) * 100)}%`,
                top: `${String((click.y / DEMO_FRAME.height) * 100)}%`,
              }}
            />
          ))}
          <div className={styles.cursor}>
            <span className={styles.halo} />
            <svg className={styles.pointer} viewBox="0 0 15 22" focusable="false">
              <path
                d="M0 0V19L5 14.5L8.5 22L12 20.5L8.5 13H15Z"
                fill="var(--scrim-black)"
                stroke="var(--scrim-white)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Recording overlays. They stay put while the scene zooms. */}
        <span className={styles.rec}>
          <span className={styles.recDot} />
          <span className={styles.recLabel}>REC</span>
          <span ref={clock} className={styles.recTime}>
            00:00
          </span>
        </span>
        <span className={styles.zoomBadge}>
          Zoom <span ref={badge}>1.0x</span>
        </span>
        <div className={styles.face}>
          <svg viewBox="0 0 100 100" focusable="false" className={styles.faceArt}>
            <circle cx="50" cy="50" r="50" fill="var(--scrim-green)" />
            <path d="M14 100a36 30 0 0 1 72 0Z" fill="var(--scrim-butter)" />
            <circle cx="50" cy="42" r="19" fill="var(--scrim-butter)" />
            <circle cx="43" cy="40" r="2.4" fill="var(--scrim-black)" />
            <circle cx="57" cy="40" r="2.4" fill="var(--scrim-black)" />
            <path
              d="M43 49q7 6 14 0"
              fill="none"
              stroke="var(--scrim-black)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          <span className={styles.mic}>
            <span className={styles.micBar} style={{ transform: 'scaleY(var(--m1))' }} />
            <span className={styles.micBar} style={{ transform: 'scaleY(var(--m2))' }} />
            <span className={styles.micBar} style={{ transform: 'scaleY(var(--m3))' }} />
          </span>
        </div>
      </div>

      <div className={styles.timeline}>
        <div className={styles.timelineHead}>
          <span className={styles.timelineLabel}>Timeline</span>
          <span className={styles.timelineClock}>
            <span ref={readout}>00:00</span> / {formatClock(DEMO_DURATION_MS)}
          </span>
        </div>
        <div ref={track} className={styles.timelineTrack} style={vars({ '--t': '0' })}>
          <span ref={flag} className={styles.flag} aria-hidden="true">
            00:00
          </span>
          {DEMO_ZOOM_SPANS.map((span) => (
            <span
              key={span.start}
              className={styles.zoomSpan}
              style={{
                left: `${String((span.start / DEMO_DURATION_MS) * 100)}%`,
                width: `${String(((span.end - span.start) / DEMO_DURATION_MS) * 100)}%`,
              }}
            />
          ))}
          {DEMO_CLICKS.map((click) => (
            <span
              key={click.t}
              className={styles.clickMark}
              style={{ left: `${String((click.t / DEMO_DURATION_MS) * 100)}%` }}
            />
          ))}
          <input
            ref={slider}
            type="range"
            min={0}
            max={DEMO_DURATION_MS - 1}
            step={50}
            defaultValue={0}
            className={styles.scrubber}
            aria-label="Demo position"
            aria-valuetext="Drag to move through the recording"
            onPointerDown={() => {
              scrubbing.current = true;
            }}
            onPointerUp={() => {
              scrubbing.current = false;
            }}
            onBlur={() => {
              scrubbing.current = false;
            }}
            onInput={(event) => {
              player.current?.seek(Number(event.currentTarget.value));
            }}
          />
        </div>
        <div className={styles.ruler} aria-hidden="true">
          {Array.from({ length: DEMO_DURATION_MS / 1000 + 1 }, (_, second) => (
            <span
              key={second}
              className={second % 3 === 0 ? styles.tickMajor : styles.tickMinor}
              style={{ left: `${String(((second * 1000) / DEMO_DURATION_MS) * 100)}%` }}
            >
              {second % 3 === 0 ? formatClock(second * 1000) : null}
            </span>
          ))}
        </div>
        <span className={styles.legend}>
          <span className={styles.legendSpan} aria-hidden="true" />
          Zoom, planned from your clicks
        </span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={playing}
          onClick={() => {
            setMode(playing ? 'paused' : 'playing');
          }}
        >
          {playing ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
          <span>Play demo</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={autoZoom}
          className={styles.switch}
          onClick={() => {
            setAutoZoom((current) => !current);
          }}
        >
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
          <span>Auto zoom</span>
          <span className={styles.state} aria-hidden="true">
            {autoZoom ? 'On' : 'Off'}
          </span>
        </button>

        <p className={styles.caption} aria-live="polite">
          {autoZoom
            ? 'Auto zoom is on. The camera zooms in on each click and follows the cursor.'
            : 'Auto zoom is off. This is the full screen, as recorded.'}
        </p>
      </div>
    </div>
  );
}
