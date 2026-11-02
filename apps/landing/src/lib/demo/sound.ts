import type { CueKind } from './sound-cues';

/** How loud the whole video is. Low on purpose: this is a page, not a film. */
export const MASTER_GAIN = 0.15;

/** The part of the Web Audio API this module needs, so tests can pass a stand in. */
export interface AudioLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBiquadFilter(): BiquadFilterNode;
  createDynamicsCompressor(): DynamicsCompressorNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  close(): Promise<void>;
}

export interface SoundEngine {
  play(kind: CueKind): void;
  close(): void;
}

/**
 * Builds the sound engine on an audio context. Every sound is made from oscillators and filtered
 * noise. The master gain is low and a compressor sits before the speakers, so nothing clips.
 */
export function createSoundEngine(context: AudioLike): SoundEngine {
  const compressor = context.createDynamicsCompressor();
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(compressor);
  compressor.connect(context.destination);

  let noise: AudioBuffer | undefined;
  const noiseBuffer = (): AudioBuffer => {
    if (noise === undefined) {
      noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
    }
    return noise;
  };

  /** A tone that glides from one pitch to another with a short, soft envelope. */
  const tone = (from: number, to: number, seconds: number, peak: number, type: OscillatorType) => {
    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
  };

  /** A burst of filtered noise. The filter sweeps, which makes a whoosh or a click. */
  const burst = (
    seconds: number,
    peak: number,
    filter: BiquadFilterType,
    from: number,
    to: number,
  ) => {
    const start = context.currentTime;
    const source = context.createBufferSource();
    const biquad = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(from, start);
    biquad.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + seconds * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(biquad);
    biquad.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + seconds + 0.02);
  };

  return {
    play(kind) {
      switch (kind) {
        case 'click':
          burst(0.045, 0.9, 'highpass', 2600, 5200);
          tone(1800, 900, 0.04, 0.35, 'square');
          break;
        case 'pop':
          tone(520, 190, 0.11, 0.7, 'sine');
          break;
        case 'whoosh':
          burst(0.55, 0.8, 'bandpass', 400, 3200);
          break;
        case 'rise':
          tone(330, 880, 0.35, 0.55, 'triangle');
          break;
        case 'fall':
          tone(660, 220, 0.35, 0.55, 'triangle');
          break;
        case 'chime':
          tone(784, 784, 0.45, 0.5, 'sine');
          setTimeout(() => {
            tone(1175, 1175, 0.6, 0.5, 'sine');
          }, 140);
          break;
        case 'shutter':
          burst(0.03, 1, 'highpass', 3000, 6000);
          setTimeout(() => {
            burst(0.05, 0.8, 'highpass', 1800, 4200);
          }, 55);
          break;
      }
    },
    close() {
      void context.close().catch(() => undefined);
    },
  };
}

/** Makes the real engine on the browser's audio context. Call it only after a click. */
export function createBrowserSoundEngine(): SoundEngine | null {
  const host = (typeof window === 'undefined' ? {} : window) as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Constructor = host.AudioContext ?? host.webkitAudioContext;
  if (Constructor === undefined) {
    return null;
  }
  const context = new Constructor();
  void context.resume().catch(() => undefined);
  return createSoundEngine(context);
}
