import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { sourceToOutput } from '@scrim/core/render';
import type { RenderModel } from '@scrim/core/render';

export interface PlaybackElements {
  screen: RefObject<HTMLVideoElement | null>;
  camera: RefObject<HTMLVideoElement | null>;
  mic: RefObject<HTMLAudioElement | null>;
}

export interface Playback {
  playing: boolean;
  /** Position on the finished video, in milliseconds. */
  outputMs: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (outputMs: number) => void;
}

/** How far a side track may drift from the screen before it is moved, in seconds. */
const DRIFT = 0.12;

/**
 * Plays the recording through the model's timeline. The screen video is the clock. Stretches that
 * were cut or trimmed are skipped by jumping to the next kept one, and playback stops at the end.
 * The camera and the microphone follow the screen. `onFrame` runs for every frame shown.
 */
export function usePlayback(
  model: RenderModel,
  elements: PlaybackElements,
  onFrame: (outputMs: number) => void,
  micOffsetMs: number,
): Playback {
  const [playing, setPlaying] = useState(false);
  const [outputMs, setOutputMs] = useState(0);
  const modelRef = useRef(model);
  modelRef.current = model;
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  const outRef = useRef(0);

  const syncTracks = useCallback(
    (recordingMs: number, force: boolean) => {
      const m = modelRef.current;
      const desc = m.describeAt(outRef.current);
      const camera = elements.camera.current;
      if (camera !== null && desc.cameraTimeMs !== null) {
        const wanted = desc.cameraTimeMs / 1000;
        if (force || Math.abs(camera.currentTime - wanted) > DRIFT) camera.currentTime = wanted;
      }
      const mic = elements.mic.current;
      if (mic !== null) {
        const wanted = Math.max(0, (recordingMs - micOffsetMs) / 1000);
        if (force || Math.abs(mic.currentTime - wanted) > DRIFT) mic.currentTime = wanted;
      }
    },
    [elements, micOffsetMs],
  );

  const seek = useCallback(
    (ms: number) => {
      const m = modelRef.current;
      const clamped = Math.min(Math.max(0, ms), m.totalMs);
      outRef.current = clamped;
      setOutputMs(clamped);
      const desc = m.describeAt(clamped);
      const screen = elements.screen.current;
      if (screen !== null) screen.currentTime = desc.screenTimeMs / 1000;
      syncTracks(desc.recordingTimeMs, true);
      frameRef.current(clamped);
    },
    [elements, syncTracks],
  );

  const pause = useCallback(() => {
    setPlaying(false);
    elements.screen.current?.pause();
    elements.camera.current?.pause();
    elements.mic.current?.pause();
  }, [elements]);

  const play = useCallback(() => {
    const m = modelRef.current;
    if (m.totalMs <= 0) return;
    if (outRef.current >= m.totalMs - 40) seek(0);
    setPlaying(true);
    void elements.screen.current?.play();
    void elements.camera.current?.play();
    void elements.mic.current?.play();
  }, [elements, seek]);

  useEffect(() => {
    if (!playing) return undefined;
    let handle = 0;
    const tick = (): void => {
      const m = modelRef.current;
      const screen = elements.screen.current;
      if (screen === null) return;
      const recordingMs = screen.currentTime * 1000;
      let out = sourceToOutput(m.timeline, recordingMs);
      if (out === null) {
        // In a cut or past the trim: jump to the next kept stretch, or stop at the end.
        const next = m.timeline.segments.find((segment) => segment.srcStart > recordingMs);
        if (next === undefined) {
          pause();
          outRef.current = m.totalMs;
          setOutputMs(m.totalMs);
          frameRef.current(m.totalMs);
          return;
        }
        screen.currentTime = next.srcStart / 1000;
        out = next.outStart;
        syncTracks(next.srcStart, true);
      } else {
        outRef.current = out;
        syncTracks(recordingMs, false);
      }
      outRef.current = out;
      setOutputMs(out);
      frameRef.current(out);
      if (screen.ended) {
        pause();
        return;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle);
    };
  }, [playing, elements, pause, syncTracks]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  return { playing, outputMs, play, pause, toggle, seek };
}
