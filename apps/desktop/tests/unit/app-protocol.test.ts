import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  contentTypeFor,
  handleAppRequest,
  isInsideRoot,
  resolveRendererPath,
} from '../../src/main/app-protocol';
import {
  APP_ENTRY_URL,
  APP_ORIGIN,
  isAllowedDevUrl,
  originOf,
  resolveRendererTarget,
} from '../../src/main/renderer-target';

const root = resolve(tmpdir(), 'scrim-root');

describe('resolveRendererPath', () => {
  it.each([
    ['app://scrim/index.html', 'index.html'],
    ['app://scrim/', 'index.html'],
    ['app://scrim', 'index.html'],
    ['app://scrim/assets/index-abc.js', join('assets', 'index-abc.js')],
    ['app://scrim/assets/deep/nested/file.css', join('assets', 'deep', 'nested', 'file.css')],
    ['app://scrim/assets/a%20b.png', join('assets', 'a b.png')],
  ])('serves %s', (url, relative) => {
    expect(resolveRendererPath(root, url)).toEqual({ ok: true, file: join(root, relative) });
  });

  it.each([
    ['dot dot segment', 'app://scrim/../secret.txt'],
    ['dot dot after a folder', 'app://scrim/assets/../../secret.txt'],
    ['encoded dot dot', 'app://scrim/%2e%2e/secret.txt'],
    ['encoded dot dot with encoded slash', 'app://scrim/%2e%2e%2fsecret.txt'],
    ['encoded slash after dot dot', 'app://scrim/assets/..%2f..%2fsecret.txt'],
    ['double encoded dot dot', 'app://scrim/%252e%252e/secret.txt'],
    ['backslash dot dot', 'app://scrim/..\\secret.txt'],
    ['encoded backslash dot dot', 'app://scrim/..%5csecret.txt'],
    ['encoded backslash only', 'app://scrim/assets%5cindex.js'],
    ['drive letter', 'app://scrim/C:/Windows/win.ini'],
    ['encoded drive letter', 'app://scrim/C%3A/Windows/win.ini'],
    ['drive letter with backslash', 'app://scrim/C:%5CWindows%5Cwin.ini'],
    ['unc path', 'app://scrim//server/share/file.js'],
    ['unc path with backslashes', 'app://scrim/%5c%5cserver%5cshare%5cfile.js'],
    ['null byte', 'app://scrim/index.html%00.png'],
    ['bad percent encoding', 'app://scrim/%E0%A4%A.js'],
    ['two encoded backslash dot dots', 'app://scrim/..%5c..%5csecret.txt'],
    ['encoded backslash then dot dots', 'app://scrim/%5c..%5csecret.txt'],
    ['lower case drive letter', 'app://scrim/c%3a/windows/win.ini'],
    ['mixed case drive letter with backslash', 'app://scrim/c%3A%5cWindows%5cwin.ini'],
    ['wrong host', 'app://evil/index.html'],
    ['wrong scheme', 'https://scrim/index.html'],
    ['not a url', 'index.html'],
  ])('rejects %s with 403', (_name, url) => {
    expect(resolveRendererPath(root, url)).toEqual({ ok: false, status: 403 });
  });

  it('rejects an absolute path given as the whole path', () => {
    const absolute = resolve(tmpdir(), 'outside.js');
    const result = resolveRendererPath(root, `app://scrim/${absolute}`);
    expect(result.ok).toBe(false);
  });

  it('treats a path equal to the root itself as a missing file, not an escape', () => {
    expect(resolveRendererPath(root, 'app://scrim/.')).toEqual({ ok: false, status: 404 });
  });

  it('answers 404 for a file type outside the map', () => {
    expect(resolveRendererPath(root, 'app://scrim/script.exe')).toEqual({ ok: false, status: 404 });
    expect(resolveRendererPath(root, 'app://scrim/noextension')).toEqual({
      ok: false,
      status: 404,
    });
  });
});

describe('contentTypeFor', () => {
  it.each([
    ['a.html', 'text/html; charset=utf-8'],
    ['a.JS', 'text/javascript; charset=utf-8'],
    ['a.css', 'text/css; charset=utf-8'],
    ['a.svg', 'image/svg+xml'],
    ['a.woff2', 'font/woff2'],
    ['a.exe', undefined],
    ['a', undefined],
  ])('%s -> %s', (file, expected) => {
    expect(contentTypeFor(file)).toBe(expected);
  });
});

describe('handleAppRequest', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrim-app-protocol-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<p>hi</p>');
    writeFileSync(join(dir, 'assets', 'a.js'), 'export {}');
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const csp = "default-src 'none'";
  const get = (url: string) => handleAppRequest(new Request(url), dir, csp);

  it('serves a file with its content type and the CSP on the response', async () => {
    const response = await get('app://scrim/index.html');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Content-Security-Policy')).toBe(csp);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await response.text()).toBe('<p>hi</p>');
  });

  it('serves the index for the root path', async () => {
    expect((await get('app://scrim/')).status).toBe(200);
  });

  it('answers 404 for a missing file and still sends the CSP', async () => {
    const response = await get('app://scrim/assets/missing.js');
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Security-Policy')).toBe(csp);
  });

  it('answers 403 for a path that escapes the root', async () => {
    // A Request already folds plain and encoded dot segments, so use an encoded backslash.
    const response = await get('app://scrim/..%5csecret.txt');
    expect(response.status).toBe(403);
    expect(response.headers.get('Content-Security-Policy')).toBe(csp);
  });

  it('answers 404 for an unknown extension even when the file exists', async () => {
    writeFileSync(join(dir, 'tool.exe'), 'x');
    expect((await get('app://scrim/tool.exe')).status).toBe(404);
  });
});

describe('handleAppRequest methods', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'scrim-app-methods-'));
    writeFileSync(join(dir, 'index.html'), '<p>hi</p>');
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const csp = "default-src 'none'";
  const send = (method: string) =>
    handleAppRequest(new Request('app://scrim/index.html', { method }), dir, csp);

  it('serves GET with a body', async () => {
    const response = await send('GET');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<p>hi</p>');
  });

  it('serves HEAD with the headers and no body', async () => {
    const response = await send('HEAD');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe('');
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])('answers 405 to %s', async (method) => {
    const response = await send(method);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
    expect(response.headers.get('Content-Security-Policy')).toBe(csp);
  });
});

describe('isAllowedDevUrl and the dev target', () => {
  it.each([
    ['http://localhost:5173', true],
    ['http://localhost:5173/', true],
    ['http://127.0.0.1:3000/index.html', true],
    ['http://localhost', false],
    ['http://127.0.0.1', false],
    ['https://localhost:5173', false],
    ['http://evil.example:5173', false],
    ['http://localhost.evil.example:5173', false],
    ['http://user:pw@localhost:5173', false],
    ['http://[::1]:5173', false],
    ['ws://localhost:5173', false],
    ['file:///C:/x.html', false],
    ['app://scrim/index.html', false],
    ['', false],
    ['nonsense', false],
  ])('%s -> %s', (url, allowed) => {
    expect(isAllowedDevUrl(url)).toBe(allowed);
    const target = resolveRendererTarget({ isPackaged: false, devUrl: url });
    expect(target.kind).toBe(allowed ? 'dev' : 'app');
    if (!allowed) expect(target).toEqual({ kind: 'app', url: APP_ENTRY_URL, origin: APP_ORIGIN });
  });
});

describe('resolveRendererTarget', () => {
  it.each([
    [{ isPackaged: true, devUrl: undefined }, 'app', APP_ENTRY_URL, APP_ORIGIN],
    [{ isPackaged: true, devUrl: 'http://localhost:5173' }, 'app', APP_ENTRY_URL, APP_ORIGIN],
    [{ isPackaged: false, devUrl: undefined }, 'app', APP_ENTRY_URL, APP_ORIGIN],
    [{ isPackaged: false, devUrl: '' }, 'app', APP_ENTRY_URL, APP_ORIGIN],
    [
      { isPackaged: false, devUrl: 'http://localhost:5173/' },
      'dev',
      'http://localhost:5173/',
      'http://localhost:5173',
    ],
  ])('%j', (input, kind, url, origin) => {
    expect(resolveRendererTarget(input)).toEqual({ kind, url, origin });
  });
});

describe('originOf', () => {
  it('builds scheme plus host and gives nothing for garbage', () => {
    expect(originOf('app://scrim/index.html')).toBe('app://scrim');
    expect(originOf('http://localhost:5173/x?y=1')).toBe('http://localhost:5173');
    expect(originOf('file:///C:/x.html')).toBe('file://');
    expect(originOf('nope')).toBe('');
  });
});

describe('isInsideRoot', () => {
  const at = (...parts: string[]): string => parts.join(sep);
  const base = at('C:', 'app', 'renderer');

  it('accepts files under the root and the root itself', () => {
    expect(isInsideRoot(base, at(base, 'index.html'), false)).toBe(true);
    expect(isInsideRoot(base, base, false)).toBe(true);
  });

  it('rejects a sibling folder that only shares the prefix, and a parent file', () => {
    expect(isInsideRoot(base, at('C:', 'app', 'renderer-evil', 'x.js'), true)).toBe(false);
    expect(isInsideRoot(base, at('C:', 'app', 'x.js'), true)).toBe(false);
  });

  it('ignores case only when asked to, as on Windows', () => {
    const shouting = at('c:', 'APP', 'Renderer', 'index.html');
    expect(isInsideRoot(base, shouting, true)).toBe(true);
    expect(isInsideRoot(base, shouting, false)).toBe(false);
  });
});
