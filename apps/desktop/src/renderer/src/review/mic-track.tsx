import type { RenderModel } from '@scrim/core/render';
import { useEffect, useRef, type RefObject } from 'react';

/** How far the voice may drift from the picture while playing before it is pulled back, in seconds. */
const PLAYING_DRIFT_S = 0.1;
/** The same while starting or still, so a seek or a start lands the voice within about a frame. */
const STILL_DRIFT_S = 0.03;

export interface MicTrackProps {
  /** The microphone file. */
  src: string;
  /** The render model whose audio plan says where in the file each moment sounds, and where it is silent. */
  model: RenderModel;
  /** The video whose clock the voice follows. */
  clock: RefObject<HTMLVideoElement | null>;
  /** True while the player is playing. */
  playing: boolean;
  /** False when another source already carries the sound, so there is never a second one. */
  enabled: boolean;
  /** Zero to one. */
  volume?: number;
  /** True when the person muted the player. */
  muted?: boolean;
}

/**
 * The voice for the live preview, driven by the preview's one clock: the screen video. Each frame
 * it finds the stretch of the audio plan the current moment falls in and plays the microphone file
 * from the matching spot, at the clock's speed. Stretches the plan marks as silence (before the
 * microphone started, after it stopped, or while its button was off) are silent, exactly as the
 * export makes them.
 */
export function MicTrack({
  src,
  model,
  clock,
  playing,
  enabled,
  volume = 1,
  muted = false,
}: MicTrackProps) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audio.current;
    if (element === null) return;
    element.volume = Math.min(1, Math.max(0, volume));
    element.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    const element = audio.current;
    if (element === null) return undefined;
    if (!enabled) {
      element.pause();
      return undefined;
    }
    const sync = (): void => {
      const screen = clock.current;
      if (screen === null) {
        if (!element.paused) element.pause();
        return;
      }
      const at = screen.currentTime * 1000;
      const piece = model.audio.find(
        (item) => at >= item.outStartMs && at < item.outStartMs + item.durationMs,
      );
      if (piece === undefined || piece.micStartMs === null) {
        if (!element.paused) element.pause();
        return;
      }
      const wanted = (piece.micStartMs + (at - piece.outStartMs)) / 1000;
      const tolerance = playing && !element.paused ? PLAYING_DRIFT_S : STILL_DRIFT_S;
      if (Math.abs(element.currentTime - wanted) > tolerance) element.currentTime = wanted;
      if (element.playbackRate !== screen.playbackRate) element.playbackRate = screen.playbackRate;
      if (playing && !screen.paused) {
        if (element.paused) void element.play().catch(() => undefined);
      } else if (!element.paused) {
        element.pause();
      }
    };
    sync();
    let handle = requestAnimationFrame(function tick() {
      sync();
      handle = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(handle);
      element.pause();
    };
  }, [enabled, playing, model, clock]);

  return (
    <audio ref={audio} src={src} preload="auto" hidden aria-label="Voice" data-testid="voice" />
  );
}
