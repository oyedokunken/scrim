import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  describeOs,
  readAbout,
  readSystemInfo,
  releaseDateOf,
} from '../../src/main/about/about-info';
import { createAboutHandlers } from '../../src/main/about/about-handlers';
import { createDispatcher, type Handlers } from '../../src/main/ipc/dispatcher';
import { createLogger, type LoggerFs } from '../../src/main/log/logger';
import { aboutSchema, systemInfoSchema } from '../../src/shared/about-contract';

const ORIGIN = 'app://scrim';
const PAGE = { frameUrl: `${ORIGIN}/index.html`, isMainFrame: true };

describe('the build date', () => {
  it('takes only a plain day', () => {
    expect(releaseDateOf('2026-10-30')).toBe('2026-10-30');
    expect(releaseDateOf('yesterday')).toBeNull();
    expect(releaseDateOf(undefined)).toBeNull();
    expect(releaseDateOf(20261030)).toBeNull();
  });
});

describe('readAbout', () => {
  const base = {
    name: 'Scrim',
    version: '1.2.3',
    license: 'MIT',
    buildStamp: '2026-10-30',
  };

  it('reports the version it is given and the modified time of the program file', async () => {
    const about = await readAbout({
      ...base,
      modifiedMs: () => Promise.resolve(1_700_000_000_000),
    });
    expect(about).toEqual({
      name: 'Scrim',
      version: '1.2.3',
      license: 'MIT',
      releaseDate: '2026-10-30',
      lastUpdated: new Date(1_700_000_000_000).toISOString(),
    });
    expect(aboutSchema.safeParse(about).success).toBe(true);
  });

  it('leaves a value empty when it cannot be read', async () => {
    const about = await readAbout({
      ...base,
      buildStamp: undefined,
      modifiedMs: () => Promise.reject(new Error('gone')),
    });
    expect(about.releaseDate).toBeNull();
    expect(about.lastUpdated).toBeNull();
    expect(aboutSchema.safeParse(about).success).toBe(true);
  });
});

describe('the operating system line', () => {
  it('names Windows with its edition and build', () => {
    expect(
      describeOs({
        platform: 'win32',
        version: 'Windows 11 Pro',
        release: '10.0.26300',
        hostname: 'x',
      }),
    ).toBe('Windows 11 Pro (10.0.26300)');
  });

  it('leaves out the long kernel text on macOS and Linux', () => {
    expect(
      describeOs({
        platform: 'darwin',
        version: 'Darwin Kernel Version 24.1.0: Thu Oct 10',
        release: '24.1.0',
        hostname: 'x',
      }),
    ).toBe('macOS (24.1.0)');
    expect(
      describeOs({
        platform: 'linux',
        version: '#1 SMP PREEMPT_DYNAMIC',
        release: '6.8.0',
        hostname: 'x',
      }),
    ).toBe('Linux (6.8.0)');
  });

  it('fits the contract', () => {
    const info = readSystemInfo({
      platform: 'win32',
      version: 'Windows 11 Pro',
      release: '10.0.1',
      hostname: 'DESK-1',
    });
    expect(systemInfoSchema.safeParse(info).success).toBe(true);
    expect(info.computerName).toBe('DESK-1');
  });
});

describe('the computer name stays out of the log', () => {
  it('is never handed to the logger, on success or on a failed call', async () => {
    const lines: string[] = [];
    const fs: LoggerFs = {
      mkdir: () => Promise.resolve(),
      append: (_path, text) => {
        lines.push(text);
        return Promise.resolve();
      },
      size: () => Promise.resolve(0),
      rename: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const logger = createLogger({ dir: 'LOGS', fs, home: 'HOME' });
    const calls: unknown[] = [];
    const spy = {
      info: vi.fn((...args: unknown[]) => {
        calls.push(args);
      }),
      warn: vi.fn((...args: unknown[]) => {
        calls.push(args);
      }),
    };
    const SECRET = 'PRIVATE-HOSTNAME-42';
    const handlers = createAboutHandlers({
      about: () => Promise.reject(new Error(`could not read ${SECRET}`)),
      system: () =>
        readSystemInfo({
          platform: 'win32',
          version: 'Windows 11',
          release: '1',
          hostname: SECRET,
        }),
    });
    const dispatch = createDispatcher({
      allowedOrigin: ORIGIN,
      // The same shape start.ts uses: the failure kind and the channel, nothing else.
      handlers: handlers as unknown as Handlers,
      onFailure: (failure, channel) => {
        spy.warn('ipc.rejected', { failure, channel });
        logger.warn('ipc.rejected', { failure, channel });
      },
    });
    const system = await dispatch('system:info', PAGE, []);
    expect(JSON.stringify(system)).toContain(SECRET);
    await expect(dispatch('app:about', PAGE, [])).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(spy.warn).toHaveBeenCalledWith('ipc.rejected', {
      failure: 'handler-failed',
      channel: 'app:about',
    });
    expect(JSON.stringify(calls)).not.toContain(SECRET);
    expect(lines.join('')).not.toContain(SECRET);
    expect(spy.info).not.toHaveBeenCalled();
  });

  it('has handlers that cannot log, because they take no logger', () => {
    const source = readFileSync(join(__dirname, '../../src/main/about/about-handlers.ts'), 'utf8');
    expect(source).not.toContain("from '../log");
    expect(source).not.toMatch(/\blog(ger)?\./);
  });
});

describe('the settings layout', () => {
  const css = readFileSync(join(__dirname, '../../src/renderer/src/styles.css'), 'utf8');

  it('puts two cards in a row, equal in height, and one column on a narrow window', () => {
    expect(css).toMatch(
      /\.settings\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/s,
    );
    expect(css).toMatch(/\.settings\s*\{[^}]*align-items: stretch/s);
    expect(css).toMatch(
      /@media \(width <= 900px\)\s*\{\s*\.settings\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/s,
    );
  });

  it('makes settings buttons green, black on hover and plainly grey when disabled', () => {
    expect(css).toMatch(
      /\.set-section \.ui-button\s*\{[^}]*color: var\(--scrim-white\);[^}]*background: var\(--scrim-green\)/s,
    );
    expect(css).toMatch(
      /\.set-section \.ui-button:hover:not\(:disabled\)\s*\{[^}]*background: var\(--scrim-black\)/s,
    );
    expect(css).toMatch(
      /\.set-section \.ui-button:disabled\s*\{[^}]*background: var\(--scrim-fill-quiet-on-white\)/s,
    );
  });
});
