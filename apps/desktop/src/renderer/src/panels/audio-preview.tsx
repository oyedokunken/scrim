import { Mic, MicOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AudioValue } from './audio-panel';
import { useMediaStream } from './use-media-stream';

/** How much the Louder and Quieter choices scale what the meter shows. */
const GAIN = { quieter: 0.6, normal: 1, louder: 1.6 } as const;

export interface AudioPreviewProps {
  value: AudioValue;
  micOn: boolean;
  deviceId: string | null;
}

/** A live level meter for the chosen microphone. It moves as you speak. */
export function AudioPreview({ value, micOn, deviceId }: AudioPreviewProps) {
  const active = micOn && value.keepSound;
  const stream = useMediaStream('audio', deviceId, active);
  const bar = useRef<HTMLDivElement>(null);
  const gain = useRef(GAIN[value.volume]);

  useEffect(() => {
    gain.current = GAIN[value.volume];
  }, [value.volume]);

  useEffect(() => {
    if (stream.status !== 'ready') return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream.stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = (): void => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128) / 128);
      // The level reaches the stylesheet as a custom property, which the CSP allows through the CSSOM.
      bar.current?.style.setProperty('--level', String(Math.min(1, peak * 2.2 * gain.current)));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);

  let message = 'Speak to see the level move.';
  if (!value.keepSound) message = 'Sound is off, so the video will have no audio.';
  else if (!micOn) message = 'The microphone is off. Turn on Record my voice on the Record page.';
  else if (stream.status === 'failed') message = 'Scrim could not open this microphone.';

  return (
    <div className="demo-stage">
      <div className="meter-card">
        <span className="meter-icon" aria-hidden="true">
          {active ? <Mic size={40} strokeWidth={1.5} /> : <MicOff size={40} strokeWidth={1.5} />}
        </span>
        <div
          ref={bar}
          className="meter"
          role="meter"
          aria-label="Microphone level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
        >
          <div className="meter-fill" />
        </div>
        <p className="ui-help">{message}</p>
      </div>
    </div>
  );
}
