import { describe, expect, it } from 'vitest';
import { pickMimeType, VIDEO_MIME_TYPES } from '../../src/recorder/page/mime';
import { TrackRecorder } from '../../src/recorder/page/track-recorder';
import type { ChunkMessage } from '../../src/recorder/protocol';
import { blobOf, FakeRecorder, FakeTrack, settle } from './support/recorder-fakes';

function setup() {
  const recorder = new FakeRecorder();
  const track = new FakeTrack();
  const clock = { time: 1000 };
  const posted: { message: ChunkMessage }[] = [];
  const events: string[] = [];
  const tr = new TrackRecorder({
    kind: 'screen',
    recorder,
    track,
    now: () => clock.time,
    post: (message) => posted.push({ message }),
    onStarted: (at, called) => events.push(`started:${String(at)}:called:${String(called)}`),
    onEnded: (at) => events.push(`ended:${String(at)}`),
    onError: (message) => events.push(`error:${message}`),
    onTrace: (what, at) => events.push(`trace:${what}:${String(at)}`),
  });
  return { recorder, track, clock, posted, events, tr };
}

describe('pickMimeType', () => {
  it('takes the first supported video type in order, and never mp4', () => {
    expect(pickMimeType('video', () => true)).toBe('video/webm;codecs=h264');
    expect(pickMimeType('video', (type) => type !== 'video/webm;codecs=h264')).toBe(
      'video/webm;codecs=vp9',
    );
    expect(pickMimeType('video', (type) => type.endsWith('vp8'))).toBe('video/webm;codecs=vp8');
    expect(VIDEO_MIME_TYPES).toEqual([
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
    ]);
    expect(pickMimeType('video', (type) => type.startsWith('video/mp4'))).toBeUndefined();
  });

  it('uses opus in webm for audio and returns nothing when nothing is supported', () => {
    expect(pickMimeType('audio', () => true)).toBe('audio/webm;codecs=opus');
    expect(pickMimeType('video', () => false)).toBeUndefined();
    expect(pickMimeType('audio', () => false)).toBeUndefined();
  });
});

describe('TrackRecorder', () => {
  it('passes the timeslice to the recorder and reports when it started', () => {
    const { recorder, events, tr } = setup();
    tr.start(1000);
    expect(recorder.timeslice).toBe(1000);
    expect(events).toEqual(['started:1000:called:1000']);
  });

  it('posts numbered chunks with the data copied in, not transferred', async () => {
    const { recorder, posted, clock, tr } = setup();
    tr.start(1000);
    clock.time = 2000;
    recorder.emit(blobOf(10));
    clock.time = 3000;
    recorder.emit(blobOf(20));
    await settle();
    expect(posted.map((entry) => entry.message.seq)).toEqual([0, 1]);
    expect(posted.map((entry) => entry.message.byteLength)).toEqual([10, 20]);
    expect(posted.map((entry) => entry.message.mediaTimeMs)).toEqual([1000, 2000]);
    expect(posted[0]?.message.data.byteLength).toBe(10);
    expect(tr.stats).toEqual({ chunks: 2, bytes: 30 });
  });

  it('keeps order when an early chunk is slow to read', async () => {
    const { recorder, posted, tr } = setup();
    tr.start(1000);
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    recorder.emit(blobOf(1, 1, slow));
    recorder.emit(blobOf(1, 2));
    recorder.emit(blobOf(1, 3));
    await settle();
    expect(posted).toHaveLength(0);
    release();
    await settle();
    expect(posted.map((entry) => entry.message.seq)).toEqual([0, 1, 2]);
  });

  it('ignores empty chunks and does not number them', async () => {
    const { recorder, posted, tr } = setup();
    tr.start(1000);
    recorder.emit(blobOf(0));
    recorder.emit(blobOf(5));
    await settle();
    expect(posted.map((entry) => entry.message.seq)).toEqual([0]);
  });

  it('leaves paused time out of the media time', async () => {
    const { recorder, posted, clock, tr } = setup();
    tr.start(1000);
    clock.time = 2000;
    tr.pause();
    clock.time = 7000;
    tr.resume();
    clock.time = 8000;
    recorder.emit(blobOf(1));
    await settle();
    expect(posted[0]?.message.mediaTimeMs).toBe(2000);
  });

  it('ignores a pause that is not recording and a resume that is not paused', () => {
    const { recorder, tr } = setup();
    tr.pause();
    expect(recorder.state).toBe('inactive');
    tr.start(1000);
    tr.resume();
    expect(recorder.state).toBe('recording');
  });

  it('stops after the last chunk is posted and releases the device', async () => {
    const { recorder, track, posted, tr } = setup();
    tr.start(1000);
    recorder.emit(blobOf(4));
    await tr.stop();
    expect(posted).toHaveLength(1);
    expect(track.stopped).toBe(true);
    expect(recorder.state).toBe('inactive');
  });

  it('can stop a recorder that never started', async () => {
    const { track, tr } = setup();
    await tr.stop();
    expect(track.stopped).toBe(true);
  });

  it('reports a device that goes away, stops only this recorder, and keeps its chunks', () => {
    const { recorder, track, events, clock, tr } = setup();
    tr.start(1000);
    clock.time = 5000;
    track.unplug();
    expect(events).toContain('ended:5000');
    expect(recorder.state).toBe('inactive');
    expect(tr.hasEnded).toBe(true);
    track.unplug();
    expect(events.filter((entry) => entry.startsWith('ended'))).toHaveLength(1);
  });

  it('does not report an end that it caused itself', async () => {
    const { track, events, tr } = setup();
    tr.start(1000);
    await tr.stop();
    track.unplug();
    expect(events.filter((entry) => entry.startsWith('ended'))).toEqual([]);
  });

  it('reports a recorder error and a failing read', async () => {
    const { recorder, events, tr } = setup();
    tr.start(1000);
    recorder.onerror?.(new Error('encoder failed'));
    recorder.emit({
      size: 1,
      arrayBuffer: () => Promise.reject(new Error('read failed')),
    });
    await settle();
    expect(events).toContain('error:encoder failed');
    expect(events).toContain('error:read failed');
  });
});
