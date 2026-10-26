import { describe, expect, it } from 'vitest';
import { detectPlatform, osLabel, type Platform, type PlatformInput } from '@/lib/platform';

// Real user agent strings, as browsers send them.
const UA = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  windows32BitOn64:
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  windowsOnArm:
    'Mozilla/5.0 (Windows NT 10.0; ARM64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macFirefox:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
  linuxChrome:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  linuxFirefoxUbuntu:
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  linuxFirefoxArm: 'Mozilla/5.0 (X11; Linux aarch64; rv:132.0) Gecko/20100101 Firefox/132.0',
  linuxFirefox32Bit: 'Mozilla/5.0 (X11; Linux i686; rv:132.0) Gecko/20100101 Firefox/132.0',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
} as const;

const platform = (os: Platform['os'], arch: Platform['arch']): Platform => ({ os, arch });

describe('detectPlatform from the user agent string alone', () => {
  const cases: [string, PlatformInput, Platform][] = [
    ['Windows, Chrome', { userAgent: UA.windowsChrome }, platform('windows', 'x64')],
    ['Windows, Firefox', { userAgent: UA.windowsFirefox }, platform('windows', 'x64')],
    ['Windows, Edge', { userAgent: UA.windowsEdge }, platform('windows', 'x64')],
    [
      'Windows, 32 bit browser on a 64 bit system',
      { userAgent: UA.windows32BitOn64 },
      platform('windows', 'x64'),
    ],
    ['Windows on Arm', { userAgent: UA.windowsOnArm }, platform('windows', 'arm64')],
    [
      'macOS, Safari (Intel and Apple Silicon look the same)',
      { userAgent: UA.macSafari },
      platform('macos', 'unknown'),
    ],
    ['macOS, Chrome', { userAgent: UA.macChrome }, platform('macos', 'unknown')],
    ['macOS, Firefox', { userAgent: UA.macFirefox }, platform('macos', 'unknown')],
    ['Linux, Chrome', { userAgent: UA.linuxChrome }, platform('linux', 'x64')],
    ['Linux, Firefox on Ubuntu', { userAgent: UA.linuxFirefoxUbuntu }, platform('linux', 'x64')],
    ['Linux on Arm', { userAgent: UA.linuxFirefoxArm }, platform('linux', 'arm64')],
    ['Linux, 32 bit', { userAgent: UA.linuxFirefox32Bit }, platform('linux', 'unknown')],
    ['Android phone', { userAgent: UA.androidChrome }, platform('unsupported', 'unknown')],
    ['Android tablet', { userAgent: UA.androidTablet }, platform('unsupported', 'unknown')],
    ['iPhone', { userAgent: UA.iphone }, platform('unsupported', 'unknown')],
    ['iPad', { userAgent: UA.ipad }, platform('unsupported', 'unknown')],
    ['Chromebook', { userAgent: UA.chromeOs }, platform('unsupported', 'unknown')],
    ['an empty string', { userAgent: '' }, platform('unsupported', 'unknown')],
    ['an unknown browser', { userAgent: 'curl/8.4.0' }, platform('unsupported', 'unknown')],
  ];

  it.each(cases)('%s', (_label, input, expected) => {
    expect(detectPlatform(input)).toEqual(expected);
  });
});

describe('detectPlatform with client hints', () => {
  it('prefers the hinted platform over the user agent', () => {
    expect(detectPlatform({ userAgent: UA.linuxChrome, platform: 'Windows' }).os).toBe('windows');
  });

  it('reads Apple Silicon from the architecture hint on a Mac', () => {
    expect(
      detectPlatform({
        userAgent: UA.macChrome,
        platform: 'macOS',
        architecture: 'arm',
        bitness: '64',
      }),
    ).toEqual(platform('macos', 'arm64'));
  });

  it('reads an Intel Mac from the architecture hint', () => {
    expect(
      detectPlatform({
        userAgent: UA.macChrome,
        platform: 'macOS',
        architecture: 'x86',
        bitness: '64',
      }),
    ).toEqual(platform('macos', 'x64'));
  });

  it('prefers the hinted architecture over the user agent', () => {
    expect(
      detectPlatform({
        userAgent: UA.windowsChrome,
        platform: 'Windows',
        architecture: 'arm',
        bitness: '64',
      }),
    ).toEqual(platform('windows', 'arm64'));
  });

  it('treats x86 without a bitness as 64 bit and a 32 bit hint as unknown', () => {
    expect(detectPlatform({ userAgent: UA.linuxChrome, architecture: 'x86' }).arch).toBe('x64');
    expect(
      detectPlatform({ userAgent: UA.linuxChrome, architecture: 'x86', bitness: '32' }).arch,
    ).toBe('unknown');
    expect(
      detectPlatform({ userAgent: UA.linuxChrome, architecture: 'arm', bitness: '32' }).arch,
    ).toBe('unknown');
  });

  it('falls back to the user agent when the hint is unrecognized', () => {
    expect(
      detectPlatform({ userAgent: UA.linuxChrome, platform: 'Plan 9', architecture: 'mips' }),
    ).toEqual(platform('linux', 'x64'));
  });

  it.each(['Android', 'iOS', 'Chrome OS', 'ChromeOS'])(
    'treats the %s hint as unsupported',
    (hint) => {
      expect(detectPlatform({ userAgent: UA.linuxChrome, platform: hint })).toEqual(
        platform('unsupported', 'unknown'),
      );
    },
  );

  it('treats a mobile hint as unsupported even with a desktop looking user agent', () => {
    expect(
      detectPlatform({ userAgent: UA.windowsChrome, platform: 'Windows', mobile: true }),
    ).toEqual(platform('unsupported', 'unknown'));
  });

  it('spots an iPad that asks for the desktop site by its touch screen', () => {
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 5 })).toEqual(
      platform('unsupported', 'unknown'),
    );
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 0 }).os).toBe('macos');
    expect(detectPlatform({ userAgent: UA.macSafari, maxTouchPoints: 1 }).os).toBe('macos');
  });

  it('does not mistake a touch screen laptop running Windows for a tablet', () => {
    expect(detectPlatform({ userAgent: UA.windowsChrome, maxTouchPoints: 10 }).os).toBe('windows');
  });
});

describe('osLabel', () => {
  it('uses the names people know', () => {
    expect(osLabel('windows')).toBe('Windows');
    expect(osLabel('macos')).toBe('macOS');
    expect(osLabel('linux')).toBe('Linux');
  });
});
