import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLogger, type LoggerFs } from '../../src/main/log/logger';
import { realLoggerFs } from '../../src/main/log/real-logger-fs';
import {
  describeError,
  folderName,
  hashTitle,
  redactPaths,
  sanitizeFields,
} from '../../src/main/log/redact';

const WIN_HOME = 'C:\\Users\\zainab';
const MAC_HOME = '/Users/zainab';
const LINUX_HOME = '/home/zainab';

describe('redactPaths', () => {
  it.each([
    [WIN_HOME, 'opened C:\\Users\\zainab\\Videos\\Scrim\\a.mp4', 'opened ~\\Videos\\Scrim\\a.mp4'],
    [WIN_HOME, 'opened c:\\users\\ZAINAB\\Videos', 'opened ~\\Videos'],
    [WIN_HOME, 'opened C:/Users/zainab/Videos', 'opened ~/Videos'],
    [WIN_HOME, '{"path":"C:\\\\Users\\\\zainab\\\\x"}', '{"path":"~\\\\x"}'],
    [MAC_HOME, 'wrote /Users/zainab/Movies/a.mov', 'wrote ~/Movies/a.mov'],
    [LINUX_HOME, 'wrote /home/zainab/Videos/a.webm', 'wrote ~/Videos/a.webm'],
  ])('replaces the home folder: %s', (home, text, expected) => {
    const result = redactPaths(text, home);
    expect(result).toBe(expected);
    expect(result).not.toMatch(/zainab/i);
  });

  it('replaces another profile folder, so a second user name never appears either', () => {
    expect(redactPaths('C:\\Users\\Someone Else\\a', WIN_HOME)).not.toMatch(/Someone/);
    expect(redactPaths('/home/someone/a.mp4', WIN_HOME)).not.toMatch(/someone/);
    expect(redactPaths('/Users/someone/a.mov', LINUX_HOME)).not.toMatch(/someone/);
  });

  it('replaces a folder on another drive entirely, not only its user part', () => {
    const result = redactPaths('saved to D:\\Client Work\\Acme\\take 3.mp4 ok', WIN_HOME);
    expect(result).toBe('saved to <path>');
    expect(result).not.toMatch(/Acme|Client/);
  });

  it('replaces an absolute path on macOS and Linux', () => {
    expect(redactPaths('saved to /mnt/disk/Client/take.mp4 ok', LINUX_HOME)).toBe(
      'saved to <path>',
    );
    expect(redactPaths('saved to /Volumes/Backup/Client/take.mp4', MAC_HOME)).toBe(
      'saved to <path>',
    );
  });

  it('leaves text with no path, and urls, alone', () => {
    expect(redactPaths('recording started at 30 fps', WIN_HOME)).toBe(
      'recording started at 30 fps',
    );
    expect(redactPaths('open app://scrim/index.html', WIN_HOME)).toBe(
      'open app://scrim/index.html',
    );
    expect(redactPaths('https://github.com/oyedokunken/scrim', WIN_HOME)).toBe(
      'https://github.com/oyedokunken/scrim',
    );
    expect(redactPaths('/tmp', LINUX_HOME)).toBe('/tmp');
  });

  it('copes with an empty or short home value without erasing the whole line', () => {
    expect(redactPaths('hello', '')).toBe('hello');
    expect(redactPaths('hello /', '/')).toBe('hello /');
  });
});

describe('folderName', () => {
  it.each([
    ['C:\\Users\\zainab\\Videos\\Scrim\\take.mp4', 'Scrim'],
    ['/home/zainab/Videos/Scrim/take.mp4', 'Scrim'],
    ['D:\\Recordings\\', 'D:'],
    ['take.mp4', 'take.mp4'],
    ['', ''],
  ])('%s -> %s', (path, expected) => {
    expect(folderName(path)).toBe(expected);
  });
});

describe('sanitizeFields', () => {
  it('hashes a window title and never writes it', () => {
    const clean = sanitizeFields(
      { windowTitle: 'Payroll 2026.xlsx - Excel', title: 'x' },
      WIN_HOME,
    );
    expect(clean['windowTitle']).toBe(`hash:${hashTitle('Payroll 2026.xlsx - Excel')}`);
    expect(JSON.stringify(clean)).not.toMatch(/Payroll|Excel/);
  });

  it('gives the same hash for the same title and a different one for another', () => {
    expect(hashTitle('a')).toBe(hashTitle('a'));
    expect(hashTitle('a')).not.toBe(hashTitle('b'));
    expect(hashTitle('a')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('cleans path text, keeps plain numbers and booleans, drops objects', () => {
    const clean = sanitizeFields(
      {
        where: 'C:\\Users\\zainab\\Videos',
        fps: 30,
        ok: true,
        none: null,
        nested: { a: 1 },
        list: [1],
      },
      WIN_HOME,
    );
    expect(clean).toEqual({ where: '~\\Videos', fps: 30, ok: true, none: null });
  });

  it('cuts a long value short', () => {
    expect(String(sanitizeFields({ text: 'x'.repeat(5000) }, WIN_HOME)['text']).length).toBe(200);
  });

  it('copes with no fields', () => {
    expect(sanitizeFields(undefined, WIN_HOME)).toEqual({});
  });
});

describe('describeError', () => {
  it('keeps the kind and the code and leaves out the message, which often holds a path', () => {
    const error = Object.assign(new Error('EACCES: open C:\\Users\\zainab\\secret'), {
      code: 'EACCES',
    });
    const described = describeError(error);
    expect(described).toEqual({ error: 'Error', code: 'EACCES' });
    expect(JSON.stringify(described)).not.toMatch(/zainab/);
  });

  it('handles values that are not errors', () => {
    expect(describeError('boom')).toEqual({ error: 'unknown' });
    expect(describeError(null)).toEqual({ error: 'unknown' });
  });
});

/** An in-memory file system that records what the logger does to it. */
function memoryFs(failAppend = false) {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const fs: LoggerFs = {
    mkdir: () => {
      calls.push('mkdir');
      return Promise.resolve();
    },
    append: (path, text) => {
      if (failAppend) return Promise.reject(new Error('disk full'));
      files.set(path, (files.get(path) ?? '') + text);
      return Promise.resolve();
    },
    size: (path) => Promise.resolve(files.has(path) ? (files.get(path) ?? '').length : undefined),
    rename: (from, to) => {
      calls.push(`rename ${from.split('/').pop() ?? ''} ${to.split('/').pop() ?? ''}`);
      files.set(to, files.get(from) ?? '');
      files.delete(from);
      return Promise.resolve();
    },
    remove: (path) => {
      files.delete(path);
      return Promise.resolve();
    },
  };
  return { fs, files, calls };
}

const fixedNow = () => new Date('2026-10-26T12:00:00.000Z');

describe('the logger', () => {
  it('writes one line per event with the time, level, event and clean fields', async () => {
    const { fs, files } = memoryFs();
    const log = createLogger({ dir: 'logs', fs, home: WIN_HOME, now: fixedNow });
    log.info('app.start', { version: '0.0.0', fps: 30 });
    log.warn('ipc.rejected', { channel: 'settings:set' });
    await log.flush();
    expect(files.get('logs/scrim.log')).toBe(
      '2026-10-26T12:00:00.000Z info app.start {"version":"0.0.0","fps":30}\n' +
        '2026-10-26T12:00:00.000Z warn ipc.rejected {"channel":"settings:set"}\n',
    );
  });

  it('never writes a full user path or a user name, in any field', async () => {
    const { fs, files } = memoryFs();
    const log = createLogger({ dir: 'logs', fs, home: WIN_HOME, now: fixedNow });
    log.info('export.done', {
      folder: 'C:\\Users\\zainab\\Videos\\Scrim',
      other: 'D:\\Client Work\\Acme\\take.mp4',
      windowTitle: 'Zainab payroll.xlsx',
      ...describeError(Object.assign(new Error('open C:\\Users\\zainab\\x'), { code: 'ENOENT' })),
    });
    await log.flush();
    const text = [...files.values()].join('');
    expect(text).not.toMatch(/zainab/i);
    expect(text).not.toMatch(/Acme|Client Work|payroll/i);
    expect(text).toContain('~\\\\Videos\\\\Scrim');
    expect(text).toContain('"code":"ENOENT"');
  });

  it('creates the folder once', async () => {
    const { fs, calls } = memoryFs();
    const log = createLogger({ dir: 'logs', fs, home: WIN_HOME });
    log.info('a');
    log.info('b');
    await log.flush();
    expect(calls.filter((call) => call === 'mkdir')).toHaveLength(1);
  });

  it('rotates by size and keeps a fixed number of old files', async () => {
    const { fs, files } = memoryFs();
    const log = createLogger({
      dir: 'logs',
      fs,
      home: WIN_HOME,
      now: fixedNow,
      maxBytes: 200,
      keep: 3,
    });
    for (let index = 0; index < 40; index += 1) log.info('tick', { index });
    await log.flush();
    const names = [...files.keys()].sort();
    expect(names).toEqual([
      'logs/scrim.log',
      'logs/scrim.log.1',
      'logs/scrim.log.2',
      'logs/scrim.log.3',
    ]);
    for (const text of files.values()) expect(text.length).toBeLessThanOrEqual(200);
    // The newest lines are in the live file, the oldest kept ones in the highest number.
    expect(files.get('logs/scrim.log')).toContain('"index":39');
    expect(files.get('logs/scrim.log.3')).not.toContain('"index":39');
  });

  it('drops a write that fails and keeps logging afterwards', async () => {
    const { fs } = memoryFs(true);
    const log = createLogger({ dir: 'logs', fs, home: WIN_HOME });
    expect(() => {
      log.error('a');
      log.error('b');
    }).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });

  it('records the folder it writes to, so the app can open it', () => {
    const { fs } = memoryFs();
    expect(createLogger({ dir: 'logs', fs, home: WIN_HOME }).directory).toBe('logs');
  });
});

describe('the logger on the real file system', () => {
  let dir = '';
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes, rotates and redacts', async () => {
    dir = mkdtempSync(join(tmpdir(), 'scrim-log-'));
    const log = createLogger({
      dir: join(dir, 'logs'),
      fs: realLoggerFs,
      home: WIN_HOME,
      now: fixedNow,
      maxBytes: 300,
      keep: 2,
    });
    for (let index = 0; index < 20; index += 1) {
      log.info('tick', { index, where: 'C:\\Users\\zainab\\Videos' });
    }
    await log.flush();
    const files = readdirSync(join(dir, 'logs')).sort();
    expect(files).toEqual(['scrim.log', 'scrim.log.1', 'scrim.log.2']);
    const all = files.map((name) => readFileSync(join(dir, 'logs', name), 'utf8')).join('');
    expect(all).not.toMatch(/zainab/);
    expect(all).toContain('~\\\\Videos');
  });
});
