'use client';

import { cursorAt, identityPose, sampleCamera } from '@scrim/core/zoom';
import { Pause, Play, RotateCcw, Zap } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { splitWords } from '@/lib/demo/words';
import {
  DEMO_START_MS,
  MASTER_DURATION_MS,
  SEGMENTS,
  demoTimeAt,
  describePosition,
  formatTime,
  frameVars,
  percentOf,
  segmentAt,
} from '@/lib/demo/master';
import { DemoPlayer, browserClock } from '@/lib/demo/player';
import { poseToTransform } from '@/lib/demo/pose-to-transform';
import {
  DEMO_CLICKS,
  DEMO_FRAME,
  DEMO_KEYFRAMES,
  DEMO_LOG,
  DEMO_ZOOM_SPANS,
  RIPPLE_DURATION_MS,
  SEARCH_WORD,
  formatClock,
  typedCount,
  uiStateAt,
} from '@/lib/demo/script';
import { siteConfig } from '@/site.config';
import { LogoMark } from '../logo';
import { OsIcon } from '../os-icons';
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
const WORDS = splitWords(siteConfig.tagline);
const PLATFORMS = ['windows', 'macos', 'linux'] as const;

// The first frame, drawn by the server: the logo card with the mark alone, and the demo (hidden
// under the card) at its starting point, so the page never shows an empty box.
const START = cursorAt(DEMO_LOG.events, 0, DEMO_FRAME);
const ROOT_STYLE = vars({
  ...frameVars(0),
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
 * The hero video. One clock (a `DemoPlayer` that does not loop) runs a master timeline. Each frame
 * writes the state of every layer straight to the DOM from that one time, so the logo card, the
 * tagline, the product demo, the platform card and the address card stay in step whether the
 * video plays, pauses or is scrubbed. The demo layer uses the real `planZoom` and `sampleCamera`
 * from `@scrim/core`. Everything is CSS and SVG: nothing is downloaded and nothing is injected.
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
  const flag = useRef<HTMLSpanElement>(null);
  const typed = useRef<SVGTextElement | null>(null);
  const player = useRef<DemoPlayer | null>(null);
  const autoZoomRef = useRef(true);
  const spoken = useRef('');

  const reducedMotion = usePrefersReducedMotion();
  // Auto means "play when the hero is on screen, unless the visitor prefers reduced motion".
  const [mode, setMode] = useState<'auto' | 'playing' | 'paused'>('auto');
  const [autoZoom, setAutoZoom] = useState(true);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [ended, setEnded] = useState(false);
  const [settledStill, setSettledStill] = useState(false);
  const stillMode = reducedMotion && mode === 'auto';
  // Adjusted during render, not in an effect: reduced motion ends the video once, and a replay is still possible.
  if (stillMode !== settledStill) {
    setSettledStill(stillMode);
    if (stillMode) setEnded(true);
  }

  const wantsToPlay = mode === 'playing' || (mode === 'auto' && !reducedMotion);
  const running = wantsToPlay && inView && tabVisible && !scrubbing && !ended;
  const showsPause = wantsToPlay && !ended;

  const draw = useCallback((timeMs: number) => {
    const element = root.current;
    const sceneElement = scene.current;
    if (element === null || sceneElement === null) {
      return;
    }
    const style = element.style;
    for (const [name, value] of Object.entries(frameVars(timeMs))) {
      style.setProperty(name, value);
    }

    const demoMs = demoTimeAt(timeMs);
    const pose = autoZoomRef.current
      ? sampleCamera(DEMO_KEYFRAMES, demoMs, DEMO_FRAME)
      : identityPose(DEMO_FRAME);
    sceneElement.style.transform = poseToTransform(pose, DEMO_FRAME);

    const point = (t: number) => cursorAt(DEMO_LOG.events, t, DEMO_FRAME);
    const cursor = point(demoMs);
    style.setProperty('--cx', String(cursor.x / DEMO_FRAME.width));
    style.setProperty('--cy', String(cursor.y / DEMO_FRAME.height));

    trail.current.forEach((dot, index) => {
      const past = point(demoMs - (index + 1) * TRAIL_STEP_MS);
      dot?.style.setProperty('--tx', String(past.x / DEMO_FRAME.width));
      dot?.style.setProperty('--ty', String(past.y / DEMO_FRAME.height));
    });

    DEMO_CLICKS.forEach((click, index) => {
      const age = demoMs - click.t;
      const active = age >= 0 && age <= RIPPLE_DURATION_MS;
      const ripple = ripples.current[index];
      ripple?.style.setProperty('--p', active ? String(age / RIPPLE_DURATION_MS) : '1');
      ripple?.style.setProperty('--on', active ? '1' : '0');
    });

    const ui = uiStateAt(demoMs);
    style.setProperty('--menu', ui.menu.toFixed(3));
    style.setProperty('--checked', ui.checked.toFixed(3));
    style.setProperty('--checkedMore', ui.checkedMore.toFixed(3));
    style.setProperty('--chip', ui.chip.toFixed(3));
    style.setProperty('--search', ui.search.toFixed(3));
    // The word in the search box is typed a letter at a time.
    typed.current ??= element.querySelector<SVGTextElement>('[data-demo="typed"]');
    if (typed.current !== null) {
      typed.current.textContent = SEARCH_WORD.slice(0, typedCount(demoMs));
    }
    style.setProperty('--toast', ui.toast.toFixed(3));

    // The face camera breathes a little and the microphone bars move, as if someone were talking.
    const seconds = demoMs / 1000;
    style.setProperty('--bob', Math.sin(seconds * 2.2).toFixed(3));
    style.setProperty('--m1', (0.45 + 0.4 * Math.abs(Math.sin(seconds * 7.3))).toFixed(3));
    style.setProperty('--m2', (0.35 + 0.55 * Math.abs(Math.sin(seconds * 5.1 + 1))).toFixed(3));
    style.setProperty('--m3', (0.4 + 0.45 * Math.abs(Math.sin(seconds * 9.2 + 2))).toFixed(3));

    if (clock.current !== null) {
      clock.current.textContent = formatClock(demoMs);
    }
    track.current?.style.setProperty('--master', String(timeMs / MASTER_DURATION_MS));
    if (flag.current !== null) {
      flag.current.textContent = formatTime(timeMs);
    }
    if (badge.current !== null) {
      badge.current.textContent = `${pose.scale.toFixed(1)}x`;
    }
    if (slider.current !== null) {
      slider.current.value = String(Math.round(timeMs));
      const text = describePosition(timeMs);
      if (text !== spoken.current) {
        spoken.current = text;
        slider.current.setAttribute('aria-valuetext', text);
      }
    }

    element.dataset.scale = pose.scale.toFixed(2);
    element.dataset.time = String(Math.round(timeMs));
    element.dataset.demoTime = String(Math.round(demoMs));
    element.dataset.stage = segmentAt(timeMs).id;
  }, []);

  useEffect(() => {
    const instance = new DemoPlayer({
      durationMs: MASTER_DURATION_MS,
      clock: browserClock,
      onFrame: draw,
      loop: false,
      onEnd: () => {
        setEnded(true);
      },
    });
    player.current = instance;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry?.isIntersecting ?? false);
      },
      { threshold: 0.4 },
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

  // With reduced motion the video opens on its last frame, the address, and stays still.
  useEffect(() => {
    if (stillMode) {
      player.current?.seek(MASTER_DURATION_MS);
    }
  }, [stillMode]);

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

  const onPlayControl = () => {
    if (ended) {
      // Replay starts over from the logo card.
      player.current?.seek(0);
      setEnded(false);
      setMode('playing');
      return;
    }
    setMode(showsPause ? 'paused' : 'playing');
  };

  const label = ended ? 'Replay' : showsPause ? 'Pause' : 'Play';
  const Icon = ended ? RotateCcw : showsPause ? Pause : Play;

  return (
    <div className={styles.demo}>
      <div
        className={styles.stage}
        ref={root}
        style={ROOT_STYLE}
        data-testid="hero-demo"
        data-playing={running ? 'true' : 'false'}
        data-scale="1.00"
        data-time="0"
        data-demo-time="0"
        data-stage="intro"
      >
        <div
          className={styles.viewport}
          role="img"
          aria-label="A video about Scrim. It opens on the logo and the tagline, then shows auto zoom: a cursor moves over a task app and clicks three times, and the view zooms in on each click, follows the cursor and eases back out, with a face camera and a recording timer. It ends on the platforms and the web address."
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

        {/* The cards are drawn from the same clock as the demo. They hide the demo while they show. */}
        <div className={styles.cards} aria-hidden="true" data-testid="hero-cards">
          <div className={styles.card} data-card="brand" style={{ opacity: 'var(--brand)' }}>
            <div className={styles.lockup}>
              <LogoMark size={96} className={styles.mark} />
              <span className={styles.wordmark}>Scrim</span>
            </div>
            <p className={styles.words}>
              {WORDS.map((word, index) => (
                <span key={`${word}-${String(index)}`} style={vars({ '--i': String(index) })}>
                  {word}
                </span>
              ))}
            </p>
          </div>
          <div
            className={styles.card}
            data-card="platforms"
            style={{ opacity: 'var(--platforms)' }}
          >
            <ul className={styles.logos}>
              {PLATFORMS.map((os, index) => (
                <li key={os} style={vars({ '--i': String(index) })}>
                  <OsIcon os={os} size={44} />
                </li>
              ))}
            </ul>
            <p className={styles.line}>{siteConfig.heroPlatformLine}</p>
          </div>
          <div className={styles.card} data-card="final" style={{ opacity: 'var(--final)' }}>
            <LogoMark size={56} className={styles.markSmall} />
            <p className={styles.address}>{siteConfig.heroAddress}</p>
          </div>
        </div>

        {/* The one play control and the auto zoom switch, over the bottom right of the video. */}
        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={onPlayControl}>
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={autoZoom}
            aria-label="Auto zoom"
            className={styles.control}
            onClick={() => {
              setAutoZoom((current) => !current);
            }}
          >
            <Zap aria-hidden="true" size={18} />
            <span className={styles.controlText}>Auto zoom</span>
            <span className={styles.state} aria-hidden="true">
              {autoZoom ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </div>

      {/* The timeline is the only control outside the video. Every layer is a segment on it. */}
      <div className={styles.timeline}>
        <div ref={track} className={styles.timelineTrack} style={vars({ '--master': '0' })}>
          <span ref={flag} className={styles.flag} aria-hidden="true">
            0:00
          </span>
          {SEGMENTS.map((segment) => (
            <span
              key={segment.id}
              className={styles.segment}
              data-segment={segment.id}
              aria-hidden="true"
              style={{
                left: `${String(percentOf(segment.start))}%`,
                width: `${String(percentOf(segment.end) - percentOf(segment.start))}%`,
              }}
            >
              <span className={styles.segmentName}>{segment.label}</span>
            </span>
          ))}
          {DEMO_ZOOM_SPANS.map((span) => (
            <span
              key={span.start}
              className={styles.zoomSpan}
              style={{
                left: `${String(percentOf(DEMO_START_MS + span.start))}%`,
                width: `${String(percentOf(span.end) - percentOf(span.start))}%`,
              }}
            />
          ))}
          {DEMO_CLICKS.map((click) => (
            <span
              key={click.t}
              className={styles.clickMark}
              style={{ left: `${String(percentOf(DEMO_START_MS + click.t))}%` }}
            />
          ))}
          <span className={styles.playhead} aria-hidden="true" />
          <input
            ref={slider}
            type="range"
            min={0}
            max={MASTER_DURATION_MS}
            step={10}
            defaultValue={0}
            className={styles.scrubber}
            aria-label="Video timeline"
            aria-valuetext={describePosition(0)}
            onPointerDown={() => {
              setScrubbing(true);
            }}
            onPointerUp={() => {
              setScrubbing(false);
            }}
            onPointerCancel={() => {
              setScrubbing(false);
            }}
            onBlur={() => {
              setScrubbing(false);
            }}
            onKeyDown={(event) => {
              // A native range moves one step per key, which is far too small here. Arrow keys move
              // one second and Page Up and Page Down five.
              const jump =
                event.key === 'ArrowRight' || event.key === 'ArrowUp'
                  ? 1000
                  : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                    ? -1000
                    : event.key === 'PageUp'
                      ? 5000
                      : event.key === 'PageDown'
                        ? -5000
                        : 0;
              if (jump === 0) {
                return;
              }
              event.preventDefault();
              const next = Math.min(
                MASTER_DURATION_MS,
                Math.max(0, Number(event.currentTarget.value) + jump),
              );
              player.current?.seek(next);
              setEnded(next >= MASTER_DURATION_MS);
            }}
            onInput={(event) => {
              const next = Number(event.currentTarget.value);
              player.current?.seek(next);
              // Moving off the end makes the control say Pause or Play again.
              setEnded(next >= MASTER_DURATION_MS);
            }}
          />
        </div>
        <div className={styles.ruler} aria-hidden="true">
          {Array.from({ length: Math.floor(MASTER_DURATION_MS / 5000) + 1 }, (_, step) => (
            <span
              key={step}
              className={styles.tick}
              style={{ left: `${String(percentOf(step * 5000))}%` }}
            >
              {formatTime(step * 5000)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
