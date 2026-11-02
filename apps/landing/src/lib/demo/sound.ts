import { CHORDS, FADE_OUT_MS, chordAt, isMusic, type Cue } from './sound-cues';

/** How loud the whole video is. Low on purpose: this is a page, not a film. */
export const MASTER_GAIN = 0.15;
/** How much of its level the music keeps while an effect plays. */
export const DUCK_LEVEL = 0.45;

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
  /** Plays one cue: an effect, or a part of the music. */
  play(cue: Cue): void;
  /** Starts the music at a time of the video: the chord of that bar, faded in. */
  sync(timeMs: number): void;
  /** Silences the music at once, for a pause. Effects are too short to need it. */
  hush(): void;
  close(): void;
}

/**
 * Builds the sound engine on an audio context. Every sound is made from oscillators and filtered
 * noise. The master gain is low and a compressor sits before the speakers, so nothing clips. The
 * music has its own bus, which ducks under each effect and fades in and out.
 */
export function createSoundEngine(context: AudioLike): SoundEngine {
  const compressor = context.createDynamicsCompressor();
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(compressor);
  compressor.connect(context.destination);

  // Music goes through a fade gain and then a duck gain, so a fade and a duck never fight.
  const musicFade = context.createGain();
  const musicDuck = context.createGain();
  musicFade.gain.value = 0;
  musicDuck.gain.value = 1;
  musicFade.connect(musicDuck);
  musicDuck.connect(master);

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

  /** Everything that is sounding as music, so a pause can stop it. */
  const sounding = new Set<{ stop(when?: number): void }>();
  const track = (source: { stop(when?: number): void; onended: unknown }) => {
    sounding.add(source);
    source.onended = () => {
      sounding.delete(source);
    };
  };

  /** A tone that glides from one pitch to another with a short, soft envelope. */
  const tone = (
    from: number,
    to: number,
    seconds: number,
    peak: number,
    type: OscillatorType,
    destination: AudioNode = master,
  ) => {
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
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
    return oscillator;
  };

  /** A burst of filtered noise. The filter sweeps, which makes a whoosh or a click. */
  const burst = (
    seconds: number,
    peak: number,
    filter: BiquadFilterType,
    from: number,
    to: number,
    destination: AudioNode = master,
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
    gain.connect(destination);
    source.start(start);
    source.stop(start + seconds + 0.02);
    return source;
  };

  /** Ducks the music under an effect, then lets it come back. */
  const duck = () => {
    const now = context.currentTime;
    musicDuck.gain.cancelScheduledValues(now);
    musicDuck.gain.setValueAtTime(musicDuck.gain.value, now);
    musicDuck.gain.linearRampToValueAtTime(DUCK_LEVEL, now + 0.04);
    musicDuck.gain.linearRampToValueAtTime(1, now + 0.4);
  };

  const fadeTo = (level: number, seconds: number) => {
    const now = context.currentTime;
    musicFade.gain.cancelScheduledValues(now);
    musicFade.gain.setValueAtTime(musicFade.gain.value, now);
    musicFade.gain.linearRampToValueAtTime(level, now + seconds);
  };

  /** One bar of the pad: the four notes of a chord, softly detuned, through a low pass filter. */
  const pad = (chord: number, ms: number) => {
    const start = context.currentTime;
    const seconds = ms / 1000;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.45);
    gain.gain.setValueAtTime(0.5, start + Math.max(0.5, seconds - 0.2));
    gain.gain.linearRampToValueAtTime(0.0001, start + seconds + 0.5);
    filter.connect(gain);
    gain.connect(musicFade);
    for (const frequency of CHORDS[chord % CHORDS.length] ?? []) {
      for (const detune of [-5, 5]) {
        const oscillator = context.createOscillator();
        const voice = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = detune;
        voice.gain.value = 0.12;
        oscillator.connect(voice);
        voice.connect(filter);
        oscillator.start(start);
        oscillator.stop(start + seconds + 0.6);
        track(oscillator);
      }
    }
  };

  const play = (cue: Cue) => {
    if (isMusic(cue.kind)) {
      switch (cue.kind) {
        case 'pad':
          pad(cue.chord ?? 0, cue.ms ?? 2500);
          break;
        case 'pulse':
          track(tone(95, 52, 0.16, 0.5, 'sine', musicFade));
          break;
        case 'swell':
          track(burst(0.9, 0.18, 'bandpass', 300, 1800, musicFade));
          break;
        case 'musicIn':
          fadeTo(1, 1.5);
          break;
        case 'musicOut':
          fadeTo(0, FADE_OUT_MS / 1000);
          break;
        default:
          break;
      }
      return;
    }
    duck();
    switch (cue.kind) {
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
      default:
        break;
    }
  };

  return {
    play,
    sync(timeMs) {
      const { chord, remainingMs } = chordAt(timeMs);
      pad(chord, remainingMs);
      fadeTo(1, 1.5);
    },
    hush() {
      fadeTo(0, 0.12);
      for (const source of sounding) {
        try {
          source.stop(context.currentTime + 0.2);
        } catch {
          // Already stopped.
        }
      }
      sounding.clear();
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
