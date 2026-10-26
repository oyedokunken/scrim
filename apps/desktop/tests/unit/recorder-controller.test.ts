import { describe, expect, it } from 'vitest';
import {
  failureReason,
  RecorderController,
  type ControllerDeps,
  type MediaStreamLike,
} from '../../src/recorder/page/controller';
import { FrameClock, type FrameSource, type FrameStamp } from '../../src/recorder/page/frame-clock';
import type { RecorderEvent } from '../../src/recorder/protocol';
import {
  blobOf,
  FakePort,
  FakeRecorder,
  FakeStream,
  FakeTrack,
  namedError,
  settle,
} from './support/recorder-fakes';

type Overrides = Partial<ControllerDeps> & { cursor?: string };

function setup(overrides: Overrides = {}) {
  const events: RecorderEvent[] = [];
  const recorders: FakeRecorder[] = [];
  const created: { mimeType: string; video?: number | undefined; audio?: number | undefined }[] =
    [];
  const screenTrack = new FakeTrack('Screen 1', {
    width: 1920,
    height: 1080,
    cursor: overrides.cursor ?? 'never',
  });
  const cameraTrack = new FakeTrack('Camera');
  const micTrack = new FakeTrack('Mic');
  const clock = { time: 100 };
  const controller = new RecorderController({
    now: () => clock.time,
    isTypeSupported: () => true,
    getDisplayMedia: () => Promise.resolve(new FakeStream([screenTrack], [])),
    getUserMedia: (constraints) =>
      Promise.resolve(
        constraints.audio === undefined
          ? new FakeStream([cameraTrack], [])
          : new FakeStream([], [micTrack]),
      ),
    createRecorder: (_stream: MediaStreamLike, options) => {
      const recorder = new FakeRecorder();
      recorders.push(recorder);
      created.push({
        mimeType: options.mimeType,
        video: options.videoBitsPerSecond,
        audio: options.audioBitsPerSecond,
      });
      return recorder;
    },
    sendEvent: (event) => events.push(event),
    ...overrides,
  });
  const configure = (kinds: ('screen' | 'camera' | 'mic')[]) =>
    controller.handle({
      type: 'configure',
      tracks: kinds.map((kind) => ({ kind })),
      timesliceMs: 1000,
      screenBitsPerSecond: 12_000_000,
    });
  const last = <T extends RecorderEvent['type']>(type: T) =>
    events.findLast((event): event is Extract<RecorderEvent, { type: T }> => event.type === type);
  return {
    controller,
    events,
    recorders,
    created,
    clock,
    configure,
    last,
    tracks: { screenTrack, cameraTrack, micTrack },
  };
}

describe('configure', () => {
  it('opens the screen, camera and mic and reports type, frame and cursor', async () => {
    const { configure, last, created } = setup();
    await configure(['screen', 'camera', 'mic']);
    const ready = last('ready');
    expect(ready?.tracks.map((track) => track.kind)).toEqual(['screen', 'camera', 'mic']);
    expect(ready?.tracks[0]?.mimeType).toBe('video/webm;codecs=h264');
    expect(ready?.tracks[2]?.mimeType).toBe('audio/webm;codecs=opus');
    expect(ready?.failed).toEqual([]);
    expect(ready?.frame).toEqual({ width: 1920, height: 1080 });
    expect(ready?.cursor).toBe('hidden');
    expect(created[0]?.video).toBe(12_000_000);
    expect(created[1]?.video).toBe(2_500_000);
    expect(created[2]?.audio).toBe(128_000);
  });

  it.each([
    ['never', 'hidden'],
    ['always', 'shown'],
    ['motion', 'shown'],
    ['', 'unknown'],
  ])('reports cursor setting %j as %s', async (setting, expected) => {
    const { configure, last } = setup({ cursor: setting });
    await configure(['screen']);
    expect(last('ready')?.cursor).toBe(expected === 'unknown' ? 'unknown' : expected);
  });

  it('keeps going when the camera fails, and says why', async () => {
    const { configure, last } = setup({
      getUserMedia: (constraints) =>
        constraints.video === undefined
          ? Promise.resolve(new FakeStream([], [new FakeTrack('Mic')]))
          : Promise.reject(namedError('NotAllowedError', 'Permission denied')),
    });
    await configure(['screen', 'camera', 'mic']);
    const ready = last('ready');
    expect(ready?.tracks.map((track) => track.kind)).toEqual(['screen', 'mic']);
    expect(ready?.failed).toEqual([
      { kind: 'camera', reason: 'permission-denied', message: 'Permission denied' },
    ]);
  });

  it('fails a track when this computer cannot record its type, and releases the device', async () => {
    const { configure, last, tracks } = setup({ isTypeSupported: () => false });
    await configure(['screen']);
    expect(last('ready')?.failed[0]).toMatchObject({ kind: 'screen', reason: 'unsupported' });
    expect(tracks.screenTrack.stopped).toBe(true);
  });

  it('fails a track when the stream has no track', async () => {
    const { configure, last } = setup({
      getDisplayMedia: () => Promise.resolve(new FakeStream([], [])),
    });
    await configure(['screen']);
    expect(last('ready')?.failed[0]).toMatchObject({ kind: 'screen', reason: 'device-missing' });
  });

  it('asks for a specific device when one is named', async () => {
    const asked: unknown[] = [];
    const { controller } = setup({
      getUserMedia: (constraints) => {
        asked.push(constraints);
        return Promise.resolve(new FakeStream([new FakeTrack()], [new FakeTrack()]));
      },
    });
    await controller.handle({
      type: 'configure',
      tracks: [
        { kind: 'camera', deviceId: 'cam-1' },
        { kind: 'mic', deviceId: 'mic-9' },
      ],
      timesliceMs: 1000,
      screenBitsPerSecond: 1,
    });
    expect(JSON.stringify(asked)).toContain('"deviceId":{"exact":"cam-1"}');
    expect(JSON.stringify(asked)).toContain('"deviceId":{"exact":"mic-9"}');
  });
});

describe('failureReason', () => {
  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'device-missing'],
    ['OverconstrainedError', 'device-missing'],
    ['NotReadableError', 'device-busy'],
    ['AbortError', 'device-busy'],
    ['NotSupportedError', 'unsupported'],
    ['TypeError', 'unsupported'],
    ['Whatever', 'unknown'],
  ])('%s becomes %s', (name, reason) => {
    expect(failureReason(namedError(name))).toBe(reason);
  });

  it('is unknown for something that is not an error', () => {
    expect(failureReason('boom')).toBe('unknown');
    expect(failureReason(null)).toBe('unknown');
  });
});

describe('running', () => {
  async function started(kinds: ('screen' | 'camera' | 'mic')[] = ['screen', 'camera']) {
    const ctx = setup();
    await ctx.configure(kinds);
    const ports = { screen: new FakePort(), camera: new FakePort(), mic: new FakePort() };
    ctx.controller.attachPorts(ports);
    await ctx.controller.handle({ type: 'start' });
    return { ...ctx, ports };
  }

  it('answers a ping with the page clock', async () => {
    const { controller, events, clock } = setup();
    clock.time = 4242;
    await controller.handle({ type: 'ping', id: 7, mainSentAt: 99 });
    expect(events).toEqual([{ type: 'pong', id: 7, mainSentAt: 99, rendererNow: 4242 }]);
  });

  it('reports the attached ports', () => {
    const { controller, events } = setup();
    controller.attachPorts({ screen: new FakePort(), mic: new FakePort() });
    expect(events).toEqual([{ type: 'ports-attached', kinds: ['screen', 'mic'] }]);
  });

  it('starts every recorder and reports each start', async () => {
    const { events, recorders } = await started();
    expect(recorders.every((recorder) => recorder.state === 'recording')).toBe(true);
    expect(events.filter((event) => event.type === 'track-started')).toHaveLength(2);
  });

  it('refuses to start a track that has no port', async () => {
    const ctx = setup();
    await ctx.configure(['screen']);
    await ctx.controller.handle({ type: 'start' });
    expect(ctx.last('fatal')?.message).toContain('screen');
    expect(ctx.recorders[0]?.state).toBe('inactive');
  });

  it('sends chunks to the right port', async () => {
    const { recorders, ports } = await started();
    recorders[0]?.emit(blobOf(8));
    recorders[1]?.emit(blobOf(3));
    await settle();
    expect(ports.screen.posted.map((entry) => entry.message.track)).toEqual(['screen']);
    expect(ports.camera.posted.map((entry) => entry.message.byteLength)).toEqual([3]);
  });

  it('pauses and resumes all recorders together and reports the page time', async () => {
    const { controller, recorders, last, clock } = await started();
    clock.time = 500;
    await controller.handle({ type: 'pause' });
    expect(recorders.map((recorder) => recorder.state)).toEqual(['paused', 'paused']);
    expect(last('paused')?.rendererNow).toBe(500);
    clock.time = 900;
    await controller.handle({ type: 'resume' });
    expect(recorders.map((recorder) => recorder.state)).toEqual(['recording', 'recording']);
    expect(last('resumed')?.rendererNow).toBe(900);
  });

  it('stops everything, sends the last chunks first, closes the ports and reports totals', async () => {
    const { controller, recorders, ports, last } = await started();
    recorders[0]?.emit(blobOf(8));
    await controller.handle({ type: 'stop' });
    expect(ports.screen.posted).toHaveLength(1);
    expect(ports.screen.closed).toBe(true);
    expect(ports.camera.closed).toBe(true);
    expect(last('stopped')?.tracks).toEqual([
      { kind: 'screen', chunks: 1, bytes: 8, stoppedAt: 100 },
      { kind: 'camera', chunks: 0, bytes: 0, stoppedAt: 100 },
    ]);
  });

  it('reports a track that ends on its own and keeps the others recording', async () => {
    const { recorders, tracks, last } = await started();
    tracks.cameraTrack.unplug();
    expect(last('track-ended')?.kind).toBe('camera');
    expect(recorders[0]?.state).toBe('recording');
    expect(recorders[1]?.state).toBe('inactive');
  });

  it('turns an unexpected exception into a fatal event instead of throwing', async () => {
    const ctx = setup({
      getDisplayMedia: () => {
        throw new Error('exploded');
      },
    });
    await ctx.controller.handle({
      type: 'configure',
      tracks: [{ kind: 'screen' }],
      timesliceMs: 1000,
      screenBitsPerSecond: 1,
    });
    expect(ctx.last('ready')?.failed[0]?.message).toBe('exploded');
  });
});

/** A recorder that reports `start` only when told to, as a real one does a moment late. */
class LateStartRecorder extends FakeRecorder {
  override start(timesliceMs: number): void {
    this.timeslice = timesliceMs;
    this.state = 'recording';
  }
}

/** A frame source that hands out scripted frames, each at a chosen page time. */
class ScriptedFrames implements FrameSource {
  readonly cancelled: boolean[] = [];
  private readonly queue: FrameStamp[] = [];
  private waiting: ((frame: FrameStamp | undefined) => void) | undefined;
  constructor(private readonly clock: { time: number }) {}

  /** A frame captured at `captureMs` on the page clock, which reaches the reader `delayMs` later. */
  push(captureMs: number, delayMs: number, zeroMs: number): void {
    const stamp = { timestampUs: (captureMs + zeroMs) * 1000 };
    this.clock.time = captureMs + delayMs;
    if (this.waiting !== undefined) {
      const resolve = this.waiting;
      this.waiting = undefined;
      resolve(stamp);
    } else {
      this.queue.push(stamp);
    }
  }

  read(): Promise<FrameStamp | undefined> {
    const next = this.queue.shift();
    if (next !== undefined) return Promise.resolve(next);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  cancel(): void {
    this.cancelled.push(true);
    this.waiting?.(undefined);
    this.waiting = undefined;
  }
}

// The steady clock's zero is a long way from the page clock's.
const ZERO = 947_000_000;

describe('FrameClock', () => {
  function setup() {
    const clock = { time: 0 };
    const source = new ScriptedFrames(clock);
    const frames = new FrameClock({ source, now: () => clock.time });
    frames.begin();
    return { clock, source, frames };
  }

  it('knows nothing until a frame has been seen after the call', async () => {
    const { source, frames } = setup();
    expect(frames.firstFrameAt()).toBeUndefined();
    source.push(100, 3, ZERO);
    await settle();
    frames.markStart(500);
    expect(frames.firstFrameAt()).toBeUndefined();
  });

  it('gives the capture time of the first frame seen after the call, on the page clock', async () => {
    const { source, frames } = setup();
    source.push(100, 3, ZERO);
    await settle();
    source.push(133, 2, ZERO);
    await settle();
    frames.markStart(150);
    source.push(166, 4, ZERO);
    await settle();
    source.push(200, 2, ZERO);
    await settle();
    source.push(233, 1, ZERO);
    await settle();
    // The frame captured at 166 ms was the first seen after 150 ms. The delivery delay of the
    // quickest frame (1 ms) is the only thing the estimate cannot see.
    expect(frames.firstFrameAt()).toBeCloseTo(166 + 1, 6);
  });

  it('is not thrown off by frames that arrive late', async () => {
    const { source, frames } = setup();
    frames.markStart(0);
    source.push(100, 40, ZERO);
    await settle();
    source.push(133, 2, ZERO);
    await settle();
    source.push(166, 35, ZERO);
    await settle();
    expect(frames.firstFrameAt()).toBeCloseTo(100 + 2, 6);
  });

  it('keeps the first frame after the call even when later frames follow', async () => {
    const { source, frames } = setup();
    frames.markStart(50);
    source.push(80, 2, ZERO);
    await settle();
    source.push(113, 2, ZERO);
    await settle();
    expect(frames.firstFrameAt()).toBeCloseTo(82, 6);
  });

  it('stops reading and cancels the source', async () => {
    const { source, frames } = setup();
    frames.stop();
    await settle();
    expect(source.cancelled).toEqual([true]);
  });

  it('survives a source that fails to read', async () => {
    const clock = { time: 0 };
    const frames = new FrameClock({
      source: { read: () => Promise.reject(new Error('gone')), cancel: () => undefined },
      now: () => clock.time,
    });
    frames.begin();
    await settle();
    expect(frames.firstFrameAt()).toBeUndefined();
  });
});

describe('the controller with frame timestamps', () => {
  it('reports the first frame time for a video track and none for the microphone', async () => {
    const clock = { time: 1000 };
    const events: RecorderEvent[] = [];
    const sources: ScriptedFrames[] = [];
    const recorders: FakeRecorder[] = [];
    const controller = new RecorderController({
      now: () => clock.time,
      isTypeSupported: () => true,
      getDisplayMedia: () => Promise.resolve(new FakeStream([new FakeTrack('Screen')], [])),
      getUserMedia: () => Promise.resolve(new FakeStream([], [new FakeTrack('Mic')])),
      createRecorder: () => {
        const recorder = new LateStartRecorder();
        recorders.push(recorder);
        return recorder;
      },
      sendEvent: (event) => events.push(event),
      createFrameSource: () => {
        const source = new ScriptedFrames(clock);
        sources.push(source);
        return source;
      },
    });
    await controller.handle({
      type: 'configure',
      tracks: [{ kind: 'screen' }, { kind: 'mic' }],
      timesliceMs: 1000,
      screenBitsPerSecond: 1,
    });
    // Only the screen gets a frame source.
    expect(sources).toHaveLength(1);
    controller.attachPorts({ screen: new FakePort(), mic: new FakePort() });
    sources[0]?.push(900, 2, 5_000_000);
    await settle();
    clock.time = 1000;
    await controller.handle({ type: 'start' });
    sources[0]?.push(1040, 2, 5_000_000);
    await settle();
    clock.time = 2200;
    recorders[0]?.onstart?.();
    recorders[1]?.onstart?.();
    const started = events.filter((event) => event.type === 'track-started');
    expect(started).toHaveLength(2);
    const screen = started.find((event) => event.kind === 'screen');
    const mic = started.find((event) => event.kind === 'mic');
    expect(screen?.firstFrameAt).toBeCloseTo(1040 + 2, 6);
    expect(mic?.firstFrameAt).toBeUndefined();
  });

  it('reports no first frame time when this browser cannot read frames', async () => {
    const events: RecorderEvent[] = [];
    const controller = new RecorderController({
      now: () => 10,
      isTypeSupported: () => true,
      getDisplayMedia: () => Promise.resolve(new FakeStream([new FakeTrack('Screen')], [])),
      getUserMedia: () => Promise.resolve(new FakeStream([], [])),
      createRecorder: () => new FakeRecorder(),
      sendEvent: (event) => events.push(event),
    });
    await controller.handle({
      type: 'configure',
      tracks: [{ kind: 'screen' }],
      timesliceMs: 1000,
      screenBitsPerSecond: 1,
    });
    controller.attachPorts({ screen: new FakePort() });
    await controller.handle({ type: 'start' });
    const started = events.find((event) => event.type === 'track-started');
    expect(started?.type === 'track-started' && started.firstFrameAt).toBeUndefined();
  });
});
