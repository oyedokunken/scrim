import { describe, expect, it, vi } from 'vitest';
import { MASTER_DURATION_MS, SEGMENTS } from '@/lib/demo/master';
import { DEMO_CLICKS, DEMO_ZOOM_SPANS } from '@/lib/demo/script';
import { MASTER_GAIN, createSoundEngine, type AudioLike } from '@/lib/demo/sound';
import { createSoundController } from '@/lib/demo/sound-controller';
import { MAX_PLAY_STEP_MS, cuesBetween, soundCuesFor, type CueKind } from '@/lib/demo/sound-cues';

const cues = soundCuesFor({ segments: SEGMENTS, clicks: DEMO_CLICKS, zoomSpans: DEMO_ZOOM_SPANS });

describe('soundCuesFor', () => {
  it('lists every cue in time order, inside the video', () => {
    expect(cues.length).toBeGreaterThan(10);
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      expect(cue?.t).toBeGreaterThanOrEqual(0);
      expect(cue?.t).toBeLessThanOrEqual(MASTER_DURATION_MS);
      if (index > 0) {
        expect(cue?.t).toBeGreaterThanOrEqual(cues[index - 1]?.t ?? 0);
      }
    }
  });

  it('is silent on the logo and the headline', () => {
    const headline = SEGMENTS.find((segment) => segment.id === 'headline');
    expect(cues.filter((cue) => cue.t < (headline?.end ?? 0))).toEqual([]);
  });

  it('puts a click on every click of the recording and a whoosh on every zoom', () => {
    const recording = SEGMENTS.find((segment) => segment.id === 'recording');
    const inside = cues.filter(
      (cue) => cue.t >= (recording?.start ?? 0) && cue.t < (recording?.end ?? 0),
    );
    expect(inside.filter((cue) => cue.kind === 'click')).toHaveLength(DEMO_CLICKS.length);
    expect(inside.filter((cue) => cue.kind === 'whoosh')).toHaveLength(DEMO_ZOOM_SPANS.length);
  });

  it('marks the start with a rising tone, the stop with a lower one and the export with a chime', () => {
    const kinds = new Set(cues.map((cue) => cue.kind));
    for (const kind of ['rise', 'fall', 'chime', 'pop', 'click', 'whoosh'] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    const first = (kind: CueKind) => cues.find((cue) => cue.kind === kind)?.t ?? 0;
    expect(first('rise')).toBeLessThan(first('fall'));
    expect(first('fall')).toBeLessThan(first('chime'));
  });
});

describe('cuesBetween', () => {
  it('returns the cues in a normal frame step, excluding the start and including the end', () => {
    const cue = cues[3];
    const t = cue?.t ?? 0;
    expect(cuesBetween(cues, t - 16, t)).toContainEqual(cue);
    expect(cuesBetween(cues, t, t + 16)).not.toContainEqual(cue);
  });

  it('plays nothing for a seek, forward or back', () => {
    const t = cues[3]?.t ?? 0;
    expect(cuesBetween(cues, t - MAX_PLAY_STEP_MS - 1, t)).toEqual([]);
    expect(cuesBetween(cues, t + 100, t - 100)).toEqual([]);
    expect(cuesBetween(cues, t, t)).toEqual([]);
  });
});

/** A stand in for the audio context that counts what is built. */
function fakeContext() {
  const made: string[] = [];
  const node = (name: string) => {
    made.push(name);
    const param = {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    return {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      gain: param,
      frequency: param,
      type: '',
      buffer: null,
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
    createGain: () => node('gain'),
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createDynamicsCompressor: () => compressor,
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => node('source'),
    close,
  };
  return { context: context as unknown as AudioLike, made, close, compressor, destination };
}

describe('createSoundEngine', () => {
  it('keeps the master gain low and puts a compressor before the speakers', () => {
    const { context, compressor, destination } = fakeContext();
    createSoundEngine(context);
    expect(MASTER_GAIN).toBeLessThanOrEqual(0.2);
    expect(compressor.connect).toHaveBeenCalledWith(destination);
  });

  it.each(['click', 'pop', 'whoosh', 'rise', 'fall', 'chime', 'shutter'] as const)(
    'makes the %s sound without error',
    (kind) => {
      vi.useFakeTimers();
      const { context, made } = fakeContext();
      const engine = createSoundEngine(context);
      const before = made.length;
      engine.play(kind);
      vi.runAllTimers();
      vi.useRealTimers();
      expect(made.length).toBeGreaterThan(before);
    },
  );

  it('closes the audio context when it is closed', () => {
    const { context, close } = fakeContext();
    createSoundEngine(context).close();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('createSoundController', () => {
  const engine = () => ({ play: vi.fn(), close: vi.fn() });

  it('loads nothing and plays nothing before sound is turned on', () => {
    const load = vi.fn(() => Promise.resolve(engine()));
    const controller = createSoundController(cues, load);
    const t = cues[0]?.t ?? 0;
    controller.step(t - 16, t);
    expect(load).not.toHaveBeenCalled();
    expect(controller.on).toBe(false);
  });

  it('loads the engine once it is turned on, then plays the cues of each step', async () => {
    const made = engine();
    const load = vi.fn(() => Promise.resolve(made));
    const controller = createSoundController(cues, load);
    await controller.enable();
    expect(controller.on).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    const cue = cues[0];
    controller.step((cue?.t ?? 0) - 16, cue?.t ?? 0);
    expect(made.play).toHaveBeenCalledWith(cue?.kind);
  });

  it('stops and closes the engine when it is turned off', async () => {
    const made = engine();
    const controller = createSoundController(cues, () => Promise.resolve(made));
    await controller.enable();
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
    const pending = controller.enable();
    controller.disable();
    finish(made);
    await pending;
    expect(made.close).toHaveBeenCalledTimes(1);
    expect(controller.on).toBe(false);
  });

  it('turns itself off when the browser has no audio', async () => {
    const controller = createSoundController(cues, () => Promise.resolve(null));
    await controller.enable();
    expect(controller.on).toBe(false);
  });
});
