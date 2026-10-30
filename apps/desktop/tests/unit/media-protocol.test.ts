import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleMediaRequest, parseRange, type MediaFs } from '../../src/main/media/media-protocol';
import { MediaRegistry } from '../../src/main/media/media-registry';

const PROJECTS = '/data/Projects';
const CACHE = '/data/cache/previews';
const registry = (): MediaRegistry => new MediaRegistry(() => [PROJECTS, CACHE], false);

const bytes = new Uint8Array(100).map((_, i) => i);
function fakeFs(links: Record<string, string> = {}): MediaFs {
  return {
    real: (file) => Promise.resolve(links[file] ?? file),
    size: () => Promise.resolve(bytes.length),
    read: (_file, start, end) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(start, end + 1));
          controller.close();
        },
      }),
  };
}
const get = (url: string, range?: string, method = 'GET'): Request =>
  new Request(url, { method, headers: range === undefined ? {} : { range } });

describe('the media allow list', () => {
  it('issues addresses only for files inside the projects and cache folders', () => {
    const r = registry();
    expect(r.issue(`${PROJECTS}/One.scrim/screen.mp4`)).toMatch(
      /^scrim-media:\/\/p\/[\w-]+\/file$/,
    );
    expect(r.issue(`${CACHE}/One.mp4`)).toBeDefined();
    expect(r.issue('/etc/passwd')).toBeUndefined();
    expect(r.issue(`${PROJECTS}/../secret.mp4`)).toBeUndefined();
    expect(r.issue(`${PROJECTS}-other/x.mp4`)).toBeUndefined();
    expect(r.issue(`${PROJECTS}/a\0.mp4`)).toBeUndefined();
  });

  it('serves nothing for an address it did not issue', async () => {
    const r = registry();
    for (const url of [
      'scrim-media://p/not-a-token/file',
      'scrim-media://p/../etc/passwd',
      'scrim-media://other/abc/file',
      'https://example.com/x',
    ]) {
      expect((await handleMediaRequest(get(url), r, fakeFs())).status).toBe(403);
    }
  });

  it('refuses a link inside the folder that leads outside it', async () => {
    const r = registry();
    const url = r.issue(`${PROJECTS}/One.scrim/screen.mp4`) ?? '';
    const fs = fakeFs({
      [resolve(`${PROJECTS}/One.scrim/screen.mp4`)]: resolve('/elsewhere/screen.mp4'),
    });
    expect((await handleMediaRequest(get(url), r, fs)).status).toBe(403);
  });

  it('refuses writes and unknown file types', async () => {
    const r = registry();
    const url = r.issue(`${PROJECTS}/One.scrim/screen.mp4`) ?? '';
    expect((await handleMediaRequest(get(url, undefined, 'POST'), r, fakeFs())).status).toBe(405);
    const text = r.issue(`${PROJECTS}/One.scrim/session.json`) ?? '';
    expect((await handleMediaRequest(get(text), r, fakeFs())).status).toBe(404);
  });

  it('forgets a file that was deleted', async () => {
    const r = registry();
    const url = r.issue(`${CACHE}/One.mp4`) ?? '';
    r.forget(`${CACHE}/One.mp4`);
    expect((await handleMediaRequest(get(url), r, fakeFs())).status).toBe(403);
  });

  it('is case blind only where the platform is', () => {
    const win = new MediaRegistry(() => ['C:\\Data\\Projects'], true);
    expect(win.issue('c:\\data\\projects\\One.scrim\\screen.mp4')).toBeDefined();
  });
});

describe('ranges', () => {
  it('parses the three forms and rejects nonsense', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=0-500', 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBeUndefined();
    expect(parseRange('bytes=9-2', 100)).toBeUndefined();
    expect(parseRange('bytes=-', 100)).toBeUndefined();
    expect(parseRange('items=0-1', 100)).toBeUndefined();
  });

  it('answers a range with 206 and exactly those bytes, so seeking works', async () => {
    const r = registry();
    const url = r.issue(`${PROJECTS}/One.scrim/screen.mp4`) ?? '';
    const res = await handleMediaRequest(get(url, 'bytes=10-19'), r, fakeFs());
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 10-19/100');
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it('answers a whole request with 200 and a bad range with 416', async () => {
    const r = registry();
    const url = r.issue(`${CACHE}/One.mp4`) ?? '';
    const whole = await handleMediaRequest(get(url), r, fakeFs());
    expect(whole.status).toBe(200);
    expect(whole.headers.get('Accept-Ranges')).toBe('bytes');
    expect((await whole.arrayBuffer()).byteLength).toBe(100);
    expect((await handleMediaRequest(get(url, 'bytes=500-'), r, fakeFs())).status).toBe(416);
  });
});
