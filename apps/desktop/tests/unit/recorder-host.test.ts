import { describe, expect, it } from 'vitest';
import type { RecorderEvent, TrackKind } from '../../src/recorder/protocol';
import { estimateOffset, rendererToMain } from '../../src/main/recording/clock-sync';
import { HostFailure, RecorderHost } from '../../src/main/recording/recorder-host';
import { FakePage, responder } from './support/fake-page';
import { parseChunkMessage, recorderEventSchema } from '../../src/recorder/protocol-schemas';

function setup(timeouts = { readyMs: 200, replyMs: 200 }) {
  const page = new FakePage();
  page.reply = responder();
  const unsolicited: RecorderEvent[] = [];
  let clock = 0;
  const host = new RecorderHost({
    transport: page,
    now: () => {
      clock += 2;
      return clock;
    },
    onUnsolicited: (event) => unsolicited.push(event),
    timeouts,
  });
  return { page, host, unsolicited };
}

describe('RecorderHost', () => {
  it('runs a recording from configure to stop', async () => {
    const { page, host } = setup();
    const ready = await host.configure([{ kind: 'screen' }, { kind: 'mic' }], {
      timesliceMs: 1000,
      screenBitsPerSecond: 8_000_000,
    });
    expect(ready.cursor).toBe('hidden');
    expect(page.sent[0]).toMatchObject({ type: 'configure', timesliceMs: 1000 });

    const chunks: number[] = [];
    await host.attachPorts(
      ['screen', 'mic'],
      (chunk) => chunks.push(chunk.seq),
      () => undefined,
    );
    const offset = await host.syncClock(4);
    expect(offset.uncertaintyMs).toBeGreaterThan(0);

    const started = await host.start(['screen', 'mic']);
    expect(started.get('screen')).toEqual({ startedAt: 5000, calledAt: 4900 });
    expect(started.get('mic')).toEqual({ startedAt: 5000, calledAt: 4900 });
    expect(await host.pause()).toBe(7000);
    expect(await host.resume()).toBe(9000);
    expect(await host.stop()).toEqual([{ kind: 'screen', chunks: 3, bytes: 30 }]);

    host.close();
    expect(page.closed).toBe(true);
    expect(page.ports.screen?.closed).toBe(true);
    expect(chunks).toEqual([]);
  });

  it('waits for the page to load before it configures', async () => {
    const { page, host } = setup();
    let load: () => void = () => undefined;
    page.loadedPromise = new Promise<void>((resolve) => {
      load = resolve;
    });
    const pending = host.configure([{ kind: 'screen' }], {
      timesliceMs: 1000,
      screenBitsPerSecond: 1,
    });
    await Promise.resolve();
    expect(page.sent).toHaveLength(0);
    load();
    await pending;
    expect(page.sent).toHaveLength(1);
  });

  it('times out when the page never loads', async () => {
    const { page, host } = setup({ readyMs: 20, replyMs: 20 });
    page.loadedPromise = new Promise<void>(() => undefined);
    await expect(
      host.configure([{ kind: 'screen' }], { timesliceMs: 1000, screenBitsPerSecond: 1 }),
    ).rejects.toMatchObject({ detail: { code: 'timeout' } });
  });

  it('routes valid chunks to the callback and counts bad ones', async () => {
    const { page, host } = setup();
    await host.configure([{ kind: 'screen' }], { timesliceMs: 1000, screenBitsPerSecond: 1 });
    const good: number[] = [];
    const bad: TrackKind[] = [];
    await host.attachPorts(
      ['screen'],
      (chunk) => good.push(chunk.seq),
      (kind) => bad.push(kind),
    );
    const port = page.ports.screen;
    port?.callback?.({
      track: 'screen',
      seq: 0,
      byteLength: 2,
      mediaTimeMs: 10,
      data: new ArrayBuffer(2),
    });
    port?.callback?.({
      track: 'camera',
      seq: 1,
      byteLength: 2,
      mediaTimeMs: 10,
      data: new ArrayBuffer(2),
    });
    port?.callback?.({ track: 'screen', seq: 'x', data: 1 });
    port?.callback?.('nonsense');
    expect(good).toEqual([0]);
    expect(bad).toEqual(['screen', 'screen', 'screen']);
  });

  it('times out when the page does not answer, and says what it was waiting for', async () => {
    const { page, host } = setup({ readyMs: 20, replyMs: 20 });
    page.reply = () => undefined;
    const error = await host.pause().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(HostFailure);
    expect((error as HostFailure).detail).toEqual({ code: 'timeout', waitingFor: 'the pause' });
    expect((error as HostFailure).message).toContain('the pause');
  });

  it('fails a wait at once when the page process dies', async () => {
    const { page, host } = setup({ readyMs: 5000, replyMs: 5000 });
    page.reply = () => undefined;
    const pending = host.stop();
    page.die('crashed');
    await expect(pending).rejects.toMatchObject({
      detail: { code: 'page-gone', reason: 'crashed' },
    });
  });

  it('passes events nobody waits for to the unsolicited callback', () => {
    const { page, unsolicited } = setup();
    page.emit({ type: 'track-ended', kind: 'camera', rendererNow: 1 });
    page.emit({ type: 'fatal', message: 'x' });
    expect(unsolicited.map((event) => event.type)).toEqual(['track-ended', 'fatal']);
  });

  it('refuses to wait once it is closed, and closes only once', async () => {
    const { page, host } = setup();
    host.close();
    host.close();
    await expect(host.pause()).rejects.toMatchObject({ detail: { code: 'closed' } });
    expect(page.closed).toBe(true);
  });

  it('fails a pending wait when it is closed', async () => {
    const { page, host } = setup({ readyMs: 5000, replyMs: 5000 });
    page.reply = () => undefined;
    const pending = host.resume();
    host.close();
    await expect(pending).rejects.toMatchObject({ detail: { code: 'closed' } });
  });

  it('fails the clock sync when no ping is answered', async () => {
    const { page, host } = setup({ readyMs: 20, replyMs: 20 });
    page.reply = () => undefined;
    await expect(host.syncClock(2)).rejects.toBeInstanceOf(HostFailure);
  });
});

describe('estimateOffset', () => {
  it('uses the midpoint of the fastest round trip', () => {
    const offset = estimateOffset([
      { sentAt: 100, receivedAt: 130, rendererNow: 5000 },
      { sentAt: 200, receivedAt: 204, rendererNow: 5100 },
      { sentAt: 300, receivedAt: 320, rendererNow: 5200 },
    ]);
    expect(offset).toEqual({ offsetMs: 202 - 5100, uncertaintyMs: 2 });
    expect(rendererToMain(5100, offset ?? { offsetMs: 0, uncertaintyMs: 0 })).toBe(202);
  });

  it('skips impossible samples and returns nothing for no samples', () => {
    expect(estimateOffset([])).toBeUndefined();
    expect(estimateOffset([{ sentAt: 10, receivedAt: 5, rendererNow: 1 }])).toBeUndefined();
    expect(estimateOffset([{ sentAt: 0, receivedAt: Number.NaN, rendererNow: 1 }])).toBeUndefined();
  });

  it('finds the true offset within its stated uncertainty', () => {
    const trueOffset = 12_345.5;
    const samples = [0, 1, 2, 3, 4].map((i) => {
      const sentAt = 1000 * i;
      const outbound = 1 + i;
      const inbound = 6 - i;
      return {
        sentAt,
        receivedAt: sentAt + outbound + inbound,
        rendererNow: sentAt + outbound - trueOffset,
      };
    });
    const offset = estimateOffset(samples);
    expect(offset).toBeDefined();
    expect(Math.abs((offset?.offsetMs ?? 0) - trueOffset)).toBeLessThanOrEqual(
      offset?.uncertaintyMs ?? 0,
    );
  });
});

describe('recorder protocol schemas', () => {
  it('accepts every event the page can send', () => {
    const events: RecorderEvent[] = [
      { type: 'loaded' },
      {
        type: 'ready',
        tracks: [{ kind: 'screen', mimeType: 'video/webm', label: 'Screen' }],
        failed: [{ kind: 'camera', reason: 'device-busy', message: 'busy' }],
        cursor: 'unknown',
        frame: { width: 1920, height: 1080 },
      },
      { type: 'ports-attached', kinds: ['screen'] },
      { type: 'pong', id: 1, mainSentAt: 2, rendererNow: 3 },
      { type: 'track-started', kind: 'mic', rendererNow: 1, calledAt: 0 },
      { type: 'paused', rendererNow: 1 },
      { type: 'resumed', rendererNow: 1 },
      { type: 'track-ended', kind: 'camera', rendererNow: 1 },
      { type: 'track-error', kind: 'screen', message: 'm', rendererNow: 1 },
      { type: 'stopped', tracks: [{ kind: 'screen', chunks: 1, bytes: 2 }] },
      { type: 'fatal', message: 'x' },
    ];
    for (const event of events) expect(recorderEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    ['an unknown type', { type: 'hello' }],
    ['a stray field', { type: 'paused', rendererNow: 1, extra: true }],
    ['a bad track kind', { type: 'track-ended', kind: 'keys', rendererNow: 1 }],
    ['a bad cursor value', { type: 'ready', tracks: [], failed: [], cursor: 'maybe' }],
    [
      'a zero frame',
      { type: 'ready', tracks: [], failed: [], cursor: 'hidden', frame: { width: 0, height: 5 } },
    ],
    ['negative bytes', { type: 'stopped', tracks: [{ kind: 'screen', chunks: 1, bytes: -1 }] }],
    ['no event at all', 'paused'],
  ])('rejects %s', (_label, event) => {
    expect(recorderEventSchema.safeParse(event).success).toBe(false);
  });

  it('parses a good chunk message and rejects bad ones', () => {
    const data = new ArrayBuffer(4);
    expect(
      parseChunkMessage({ track: 'screen', seq: 0, byteLength: 4, mediaTimeMs: 12.5, data }),
    ).toEqual({ track: 'screen', seq: 0, byteLength: 4, mediaTimeMs: 12.5, data });
    for (const bad of [
      null,
      7,
      { track: 'screen', seq: -1, byteLength: 4, mediaTimeMs: 0, data },
      { track: 'screen', seq: 1.5, byteLength: 4, mediaTimeMs: 0, data },
      { track: 'screen', seq: 0, byteLength: '4', mediaTimeMs: 0, data },
      { track: 'screen', seq: 0, byteLength: 4, mediaTimeMs: Number.NaN, data },
      { track: 'screen', seq: 0, byteLength: 4, mediaTimeMs: 0, data: new Uint8Array(4) },
      { track: 'keys', seq: 0, byteLength: 4, mediaTimeMs: 0, data },
    ]) {
      expect(parseChunkMessage(bad)).toBeUndefined();
    }
  });
});
