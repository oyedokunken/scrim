import { describe, expect, it } from 'vitest';
import { readPlatform, readPlatformInput } from '@/lib/platform-client';

const macChrome =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

describe('readPlatformInput', () => {
  it('collects the hints and the touch points', async () => {
    const input = await readPlatformInput({
      userAgent: macChrome,
      maxTouchPoints: 0,
      userAgentData: {
        platform: 'macOS',
        mobile: false,
        getHighEntropyValues: () => Promise.resolve({ architecture: 'arm', bitness: '64' }),
      },
    });
    expect(input).toEqual({
      userAgent: macChrome,
      platform: 'macOS',
      mobile: false,
      architecture: 'arm',
      bitness: '64',
      maxTouchPoints: 0,
    });
  });

  it('asks only for the architecture and bitness', async () => {
    let asked: string[] = [];
    await readPlatformInput({
      userAgent: macChrome,
      userAgentData: {
        getHighEntropyValues: (hints) => {
          asked = hints;
          return Promise.resolve({});
        },
      },
    });
    expect(asked).toEqual(['architecture', 'bitness']);
  });

  it('carries on with the user agent when the browser refuses the hints', async () => {
    const input = await readPlatformInput({
      userAgent: macChrome,
      userAgentData: {
        platform: 'macOS',
        getHighEntropyValues: () => Promise.reject(new Error('NotAllowedError')),
      },
    });
    expect(input.architecture).toBeUndefined();
    expect(input.platform).toBe('macOS');
  });

  it('works in a browser with no client hints at all, such as Safari and Firefox', async () => {
    const input = await readPlatformInput({ userAgent: macChrome });
    expect(input).toMatchObject({ userAgent: macChrome });
    expect(input.platform).toBeUndefined();
  });
});

describe('readPlatform', () => {
  it('detects Apple Silicon from the hints', async () => {
    const result = await readPlatform({
      userAgent: macChrome,
      userAgentData: {
        platform: 'macOS',
        getHighEntropyValues: () => Promise.resolve({ architecture: 'arm', bitness: '64' }),
      },
    });
    expect(result).toEqual({ os: 'macos', arch: 'arm64' });
  });

  it('leaves the Mac architecture unknown without hints, so the interface can ask', async () => {
    expect(await readPlatform({ userAgent: macChrome })).toEqual({ os: 'macos', arch: 'unknown' });
  });
});
