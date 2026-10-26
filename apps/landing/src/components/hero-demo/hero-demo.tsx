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
  RIPPLE_DURATION_MS,
  STATIC_FRAME_TIME_MS,
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

// The first frame, drawn by the server. The camera shows the whole screen and the cursor sits at
// its starting point, so the page never shows an empty box.
const START = cursorAt(DEMO_LOG.events, 0, DEMO_FRAME);
const ROOT_STYLE = vars({
  '--cx': String(START.x / DEMO_FRAME.width),
  '--cy': String(START.y / DEMO_FRAME.height),
});
const SCENE_STYLE: CSSProperties = {
  transform: poseToTransform(identityPose(DEMO_FRAME), DEMO_FRAME),
};
const RIPPLE_REST = vars({ '--p': '1', '--on': '0' });

/**
 * A live demonstration of auto zoom. A scripted cursor moves over a pretend app and clicks three
 * times. The camera comes from the same `planZoom` and `sampleCamera` the desktop app will use.
 * Each frame writes a transform to the DOM directly, so React does not render 60 times a second.
 */
export function HeroDemo() {
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const ripples = useRef<(HTMLSpanElement | null)[]>([]);
  const player = useRef<DemoPlayer | null>(null);
  const autoZoomRef = useRef(true);

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

    const cursor = cursorAt(DEMO_LOG.events, timeMs, DEMO_FRAME);
    element.style.setProperty('--cx', String(cursor.x / DEMO_FRAME.width));
    element.style.setProperty('--cy', String(cursor.y / DEMO_FRAME.height));

    DEMO_CLICKS.forEach((click, index) => {
      const age = timeMs - click.t;
      const active = age >= 0 && age <= RIPPLE_DURATION_MS;
      const ripple = ripples.current[index];
      ripple?.style.setProperty('--p', active ? String(age / RIPPLE_DURATION_MS) : '1');
      ripple?.style.setProperty('--on', active ? '1' : '0');
    });

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
        aria-label="A demonstration of auto zoom. A cursor moves over a task app and clicks three times. The view zooms in on each click, follows the cursor, then eases back out."
      >
        <div ref={scene} className={styles.scene} style={SCENE_STYLE}>
          <MockWindow />
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
