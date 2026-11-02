import { describe, expect, it, vi } from 'vitest';
import { MASTER_DURATION_MS, SEGMENTS } from '@/lib/demo/master';
import { DEMO_CLICKS, DEMO_ZOOM_SPANS } from '@/lib/demo/script';
import { DUCK_LEVEL, MASTER_GAIN, createSoundEngine, type AudioLike } from '@/lib/demo/sound';
import { createSoundController } from '@/lib/demo/sound-controller';
import {
  BAR_MS,
  BEAT_MS,
  BPM,
  CHORDS,
  FADE_OUT_MS,
  MAX_PLAY_STEP_MS,
  chordAt,
  cuesBetween,
  isMusic,
  soundCuesFor,
  type Cue,
  type CueKind,
} from '@/lib/demo/sound-cues';

const cues = soundCuesFor({ segments: SEGMENTS, clicks: DEMO_CLICKS, zoomSpans: DEMO_ZOOM_SPANS });
const effects = cues.filter((cue) => !isMusic(cue.kind));
const music = cues.filter((cue) => isMusic(cue.kind));

describe('soundCuesFor', () => {
  it('lists every cue in time order, inside the video', () => {
    expect(cues.length).toBeGreaterThan(100);
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      expect(cue?.t).toBeGreaterThanOrEqual(0);
      expect(cue?.t).toBeLessThanOrEqual(MASTER_DURATION_MS);
      if (index > 0) {
        expect(cue?.t).toBeGreaterThanOrEqual(cues[index - 1]?.t ?? 0);
      }
    }
  });

  it('has no effects on the logo and the headline, only the music', () => {
    const headline = SEGMENTS.find((segment) => segment.id === 'headline');
    expect(effects.filter((cue) => cue.t < (headline?.end ?? 0))).toEqual([]);
  });

  it('puts a click on every click of the recording and a whoosh on every zoom', () => {
    const recording = SEGMENTS.find((segment) => segment.id === 'recording');
    const inside = effects.filter(
      (cue) => cue.t >= (recording?.start ?? 0) && cue.t < (recording?.end ?? 0),
    );
    expect(inside.filter((cue) => cue.kind === 'click')).toHaveLength(DEMO_CLICKS.length);
    expect(inside.filter((cue) => cue.kind === 'whoosh')).toHaveLength(DEMO_ZOOM_SPANS.length);
  });

  it('marks the start with a rising tone, the stop with a lower one and the export with a chime', () => {
    const kinds = new Set(effects.map((cue) => cue.kind));
    for (const kind of ['rise', 'fall', 'chime', 'pop', 'click', 'whoosh'] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    const first = (kind: CueKind) => effects.find((cue) => cue.kind === kind)?.t ?? 0;
    expect(first('rise')).toBeLessThan(first('fall'));
    expect(first('fall')).toBeLessThan(first('chime'));
  });
});

describe('the music', () => {
  it('runs at a calm 90 to 100 beats a minute', () => {
    expect(BPM).toBeGreaterThanOrEqual(90);
    expect(BPM).toBeLessThanOrEqual(100);
    expect(BEAT_MS * 4).toBeCloseTo(BAR_MS, 5);
  });

  it('plays one pad chord a bar, from the first bar to the last, repeating four chords', () => {
    const pads = music.filter((cue) => cue.kind === 'pad');
    expect(pads.length).toBe(Math.ceil(MASTER_DURATION_MS / BAR_MS));
    pads.forEach((cue, bar) => {
      expect(cue.chord).toBe(bar % CHORDS.length);
      expect(cue.ms).toBe(BAR_MS);
      expect(cue.t).toBeCloseTo(bar * BAR_MS, -1);
    });
  });

  it('fades in at the start, swells on every scene change and fades out at the end of the loop', () => {
    expect(music.filter((cue) => cue.kind === 'musicIn')).toHaveLength(1);
    expect(music.find((cue) => cue.kind === 'musicIn')?.t).toBeLessThan(50);
    const swells = music.filter((cue) => cue.kind === 'swell');
    expect(swells).toHaveLength(SEGMENTS.length - 1);
    SEGMENTS.slice(1).forEach((segment, index) => {
      expect(swells[index]?.t).toBeGreaterThanOrEqual(segment.start);
      expect(swells[index]?.t).toBeLessThan(segment.start + 50);
    });
    const out = music.filter((cue) => cue.kind === 'musicOut');
    expect(out).toHaveLength(1);
    expect(out[0]?.t).toBe(MASTER_DURATION_MS - FADE_OUT_MS);
  });

  it('keeps a soft pulse on the beat, starting under the headline and stopping before the fade', () => {
    const pulses = music.filter((cue) => cue.kind === 'pulse');
    expect(pulses.length).toBeGreaterThan(40);
    expect(pulses[0]?.t).toBeGreaterThanOrEqual(2000);
    expect(pulses[pulses.length - 1]?.t).toBeLessThan(MASTER_DURATION_MS - FADE_OUT_MS);
  });

  it('finds the chord of any moment and how much of its bar is left', () => {
    expect(chordAt(0)).toEqual({ chord: 0, remainingMs: BAR_MS });
    expect(chordAt(BAR_MS + 100).chord).toBe(1);
    expect(chordAt(BAR_MS + 100).remainingMs).toBeCloseTo(BAR_MS - 100, 5);
    expect(chordAt(BAR_MS * 4).chord).toBe(0);
    expect(chordAt(-5)).toEqual({ chord: 0, remainingMs: BAR_MS });
  });

  it('tells music from effects', () => {
    for (const kind of ['pad', 'pulse', 'swell', 'musicIn', 'musicOut'] as const) {
      expect(isMusic(kind)).toBe(true);
    }
    for (const kind of ['click', 'pop', 'whoosh', 'rise', 'fall', 'chime', 'shutter'] as const) {
      expect(isMusic(kind)).toBe(false);
    }
  });
});

describe('cuesBetween', () => {
  it('returns the cues in a normal frame step, excluding the start and including the end', () => {
    const cue = effects[3];
    const t = cue?.t ?? 0;
    expect(cuesBetween(cues, t - 16, t)).toContainEqual(cue);
    expect(cuesBetween(cues, t, t + 16)).not.toContainEqual(cue);
  });

  it('plays nothing for a seek, forward or back', () => {
    const t = effects[3]?.t ?? 0;
    expect(cuesBetween(cues, t - MAX_PLAY_STEP_MS - 1, t)).toEqual([]);
    expect(cuesBetween(cues, t + 100, t - 100)).toEqual([]);
    expect(cuesBetween(cues, t, t)).toEqual([]);
  });
});

/** A stand in for the audio context that records what is built and every gain it schedules. */
function fakeContext() {
  const made: string[] = [];
  const duckCalls: { value: number; at: number }[] = [];
  const gains: { gain: ReturnType<typeof param> }[] = [];
  function param() {
    return {
      value: 0,
      setValueAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
  }
  const node = (name: string) => {
    made.push(name);
    return {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      gain: param(),
      frequency: param(),
      detune: { value: 0 },
      type: '',
      buffer: null as unknown,
      onended: null as unknown,
    };
  };
  const connections: unknown[] = [];
  const compressor = node('compressor');
  compressor.connect.mockImplementation((target: unknown) => connections.push(target));
  const destination = { name: 'destination' };
  const close = vi.fn(() => Promise.resolve());
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    destination,
    createGain: () => {
      const gainNode = node('gain');
      gains.push(gainNode);
      return gainNode;
    },
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createDynamicsCompressor: () => compressor,
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => node('source'),
    close,
  };
  return {
    context: context as unknown as AudioLike,
    made,
    close,
    compressor,
    destination,
    gains,
    duckCalls,
  };
}

const cue = (kind: CueKind, extra: Partial<Cue> = {}): Cue => ({ t: 0, kind, ...extra });

describe('createSoundEngine', () => {
  it('keeps the master gain low and puts a compressor before the speakers', () => {
    const { context, compressor, destination } = fakeContext();
    createSoundEngine(context);
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.2);
    expect(compressor.connect).toHaveBeenCalledWith(destination);
  });

  it.each(['click', 'pop', 'whoosh', 'rise', 'fall', 'chime', 'shutter'] as const)(
    'makes the %s effect without error',
    (kind) => {
      vi.useFakeTimers();
      const { context, made } = fakeContext();
      const engine = createSoundEngine(context);
      const before = made.length;
      engine.play(cue(kind));
      vi.runAllTimers();
      vi.useRealTimers();
      expect(made.length).toBeGreaterThan(before);
    },
  );

  it('plays a pad as four notes with two voices each, and a pulse and a swell without error', () => {
    const { context, made } = fakeContext();
    const engine = createSoundEngine(context);
    const before = made.filter((name) => name === 'oscillator').length;
    engine.play(cue('pad', { chord: 1, ms: BAR_MS }));
    expect(made.filter((name) => name === 'oscillator').length - before).toBe(8);
    expect(() => {
      engine.play(cue('pulse'));
      engine.play(cue('swell'));
    }).not.toThrow();
  });

  it('ducks the music under an effect and not under the music itself', () => {
    const { context, gains } = fakeContext();
    const engine = createSoundEngine(context);
    // The music duck gain is the third gain made: master, fade, duck.
    const duckGain = gains[2]?.gain;
    engine.play(cue('pad', { chord: 0, ms: BAR_MS }));
    engine.play(cue('pulse'));
    expect(duckGain?.linearRampToValueAtTime).not.toHaveBeenCalled();
    engine.play(cue('click'));
    expect(DUCK_LEVEL).toBeLessThan(1);
    expect(duckGain?.linearRampToValueAtTime).toHaveBeenCalledWith(DUCK_LEVEL, expect.any(Number));
    expect(duckGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, expect.any(Number));
  });

  it('fades the music in and out', () => {
    const { context, gains } = fakeContext();
    const engine = createSoundEngine(context);
    const fadeGain = gains[1]?.gain;
    engine.play(cue('musicIn'));
    expect(fadeGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, expect.any(Number));
    engine.play(cue('musicOut'));
    expect(fadeGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, FADE_OUT_MS / 1000);
  });

  it('starts the music on the right chord when it is synced, and hushes it on a pause', () => {
    const { context, made, gains } = fakeContext();
    const engine = createSoundEngine(context);
    const fadeGain = gains[1]?.gain;
    const before = made.filter((name) => name === 'oscillator').length;
    engine.sync(BAR_MS + 500);
    expect(made.filter((name) => name === 'oscillator').length - before).toBe(8);
    expect(fadeGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, expect.any(Number));
    engine.hush();
    expect(fadeGain?.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
  });

  it('closes the audio context when it is closed', () => {
    const { context, close } = fakeContext();
    createSoundEngine(context).close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('createSoundController', () => {
  const engine = () => ({ play: vi.fn(), sync: vi.fn(), hush: vi.fn(), close: vi.fn() });

  it('loads nothing and plays nothing before sound is turned on', () => {
    const load = vi.fn(() => Promise.resolve(engine()));
    const controller = createSoundController(cues, load);
    const t = cues[0]?.t ?? 0;
    controller.step(t - 16, t);
    controller.resume(1000);
    controller.pause();
    expect(load).not.toHaveBeenCalled();
    expect(controller.on).toBe(false);
  });

  it('loads the engine once it is turned on, starts the music there and plays the cues of each step', async () => {
    const made = engine();
    const load = vi.fn(() => Promise.resolve(made));
    const controller = createSoundController(cues, load);
    await controller.enable(1234);
    expect(controller.on).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(made.sync).toHaveBeenCalledWith(1234);
    const first = cues[0];
    controller.step((first?.t ?? 0) - 16, first?.t ?? 0);
    expect(made.play).toHaveBeenCalledWith(first);
  });

  it('hushes the music on a pause and brings it back on the right moment', async () => {
    const made = engine();
    const controller = createSoundController(cues, () => Promise.resolve(made));
    await controller.enable(0);
    controller.pause();
    expect(made.hush).toHaveBeenCalledTimes(1);
    controller.resume(7000);
    expect(made.sync).toHaveBeenLastCalledWith(7000);
  });

  it('stops and closes the engine when it is turned off', async () => {
    const made = engine();
    const controller = createSoundController(cues, () => Promise.resolve(made));
    await controller.enable(0);
    made.play.mockClear();
    controller.disable();
    expect(made.close).toHaveBeenCalledTimes(1);
    const t = cues[0]?.t ?? 0;
    controller.step(t - 16, t);
    expect(made.play).not.toHaveBeenCalled();
    expect(controller.on).toBe(false);
  });

  it('closes an engine that finished loading after sound was turned off again', async () => {
    const made = engine();
    let finish: (value: ReturnType<typeof engine>) => void = () => undefined;
    const controller = createSoundController(
      cues,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = controller.enable(0);
    controller.disable();
    finish(made);
    await pending;
    expect(made.close).toHaveBeenCalledTimes(1);
    expect(made.sync).not.toHaveBeenCalled();
    expect(controller.on).toBe(false);
  });

  it('turns itself off when the browser has no audio', async () => {
    const controller = createSoundController(cues, () => Promise.resolve(null));
    await controller.enable(0);
    expect(controller.on).toBe(false);
  });
});
