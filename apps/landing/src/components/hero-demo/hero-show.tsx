'use client';

import { RotateCcw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import {
  STAGE_MS,
  splitWords,
  stageAfterDemo,
  stageAfterTimer,
  type Stage,
} from '@/lib/demo/sequence';
import { siteConfig } from '@/site.config';
import { LogoMark } from '../logo';
import { OsIcon } from '../os-icons';
import { HeroDemo } from './hero-demo';
import styles from './hero-show.module.css';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

const WORDS = splitWords(siteConfig.tagline);
const PLATFORMS = ['windows', 'macos', 'linux'] as const;

/**
 * The hero as a short film made of cards: the mark, the tagline, the product demo, the platforms
 * and the address. It starts when the hero is on screen, waits while it is off screen, and ends
 * on a card with a replay button. With reduced motion it shows the final card and no movement.
 * Everything is CSS and SVG, so nothing is downloaded and the strict CSP is untouched.
 */
export function HeroShow() {
  const box = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
  const [chosen, setStage] = useState<Stage>('intro');
  const [visible, setVisible] = useState(false);
  // With reduced motion the final card is the state to show, until someone presses Replay.
  const [replayed, setReplayed] = useState(false);
  const manualAdvanceRef = useRef(false);
  const stage: Stage = reducedMotion && !replayed ? 'address' : chosen;

  useEffect(() => {
    const element = box.current;
    if (element === null) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry?.isIntersecting ?? false);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Timed cards advance on their own, only while the hero is visible. Leaving restarts the card.
  useEffect(() => {
    if (!visible || reducedMotion || manualAdvanceRef.current) {
      return;
    }
    const next = stageAfterTimer(stage);
    if (next === null || stage === 'demo' || stage === 'address') {
      return;
    }
    const timer = window.setTimeout(() => {
      setStage(next);
    }, STAGE_MS[stage]);
    return () => {
      window.clearTimeout(timer);
    };
  }, [stage, visible, reducedMotion]);

  const onEnded = useCallback(() => {
    setStage((current) => stageAfterDemo(current));
  }, []);

  const replay = useCallback(() => {
    setReplayed(true);
    manualAdvanceRef.current = true;
    // With reduced motion there is no film to replay, so it opens the demo on its still frame.
    setStage(reducedMotion ? 'demo' : 'intro');
  }, [reducedMotion]);

  const handleStageRequest = useCallback((requestedStage: Stage) => {
    manualAdvanceRef.current = true;
    setStage(requestedStage);
  }, []);

  const is = (name: Stage) => stage === name;

  const overlay = (
    <div className={styles.cards} data-stage={stage} data-testid="hero-cards">
      <div className={styles.card} data-card="brand" data-on={is('intro')}>
        <div className={styles.brand}>
          <LogoMark size={96} className={styles.mark} />
          <span className={styles.wordmark} aria-hidden="true">
            {siteConfig.name}
          </span>
        </div>
      </div>
      <div className={styles.card} data-card="words" data-on={is('words')}>
        <p className={styles.words}>
          {WORDS.map((word, index) => (
            <span key={`${word}-${String(index)}`} style={{ '--i': index } as CSSProperties}>
              {word}{' '}
            </span>
          ))}
        </p>
      </div>
      <div className={styles.card} data-card="platforms" data-on={is('platforms')}>
        <ul className={styles.logos} aria-hidden="true">
          {PLATFORMS.map((os) => (
            <li key={os}>
              <OsIcon os={os} size={44} />
            </li>
          ))}
        </ul>
        <p className={styles.line}>{siteConfig.heroPlatformLine}</p>
      </div>
      <div className={styles.card} data-card="address" data-on={is('address')}>
        <LogoMark size={56} className={styles.markSmall} />
        <p className={styles.address}>{siteConfig.heroAddress}</p>
        <button
          type="button"
          className={styles.replay}
          onClick={replay}
          tabIndex={is('address') ? 0 : -1}
        >
          <RotateCcw aria-hidden="true" size={18} />
          <span>Replay</span>
        </button>
      </div>
    </div>
  );

  return (
    <div ref={box}>
      <HeroDemo
        gate={is('demo')}
        onEnded={onEnded}
        overlay={overlay}
        stage={stage}
        onStageRequest={handleStageRequest}
      />
    </div>
  );
}
