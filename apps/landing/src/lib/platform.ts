export type Os = 'windows' | 'macos' | 'linux' | 'unsupported';
type Arch = 'x64' | 'arm64' | 'unknown';

export interface Platform {
  os: Os;
  arch: Arch;
}

/** Everything detection reads. Each field comes from `navigator`, and any of them may be missing. */
export interface PlatformInput {
  /** `navigator.userAgent`. */
  userAgent: string;
  /** `navigator.userAgentData.platform`, for example "Windows" or "macOS". */
  platform?: string | undefined;
  /** `navigator.userAgentData.mobile`. */
  mobile?: boolean | undefined;
  /** High entropy `architecture`: "x86" or "arm". */
  architecture?: string | undefined;
  /** High entropy `bitness`: "64" or "32". */
  bitness?: string | undefined;
  /** `navigator.maxTouchPoints`. Tells an iPad that asks for the desktop site from a Mac. */
  maxTouchPoints?: number | undefined;
}

/** Phones, tablets, Chromebooks and other devices Scrim does not run on. */
const UNSUPPORTED_DEVICE =
  /android|iphone|ipad|ipod|cros|crkey|tizen|kindle|silk|windows phone|mobile/i;

function osFromPlatformHint(platform: string | undefined): Os | undefined {
  switch (platform?.toLowerCase()) {
    case 'windows':
      return 'windows';
    case 'macos':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'android':
    case 'ios':
    case 'chrome os':
    case 'chromeos':
      return 'unsupported';
    default:
      return undefined;
  }
}

function osFromUserAgent(userAgent: string): Os {
  if (/Windows NT/i.test(userAgent)) {
    return 'windows';
  }
  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return 'macos';
  }
  if (/Linux|X11/i.test(userAgent)) {
    return 'linux';
  }
  return 'unsupported';
}

function archFromHints(
  architecture: string | undefined,
  bitness: string | undefined,
): Arch | undefined {
  const name = architecture?.toLowerCase();
  if (name === 'arm') {
    return bitness === '32' ? 'unknown' : 'arm64';
  }
  if (name === 'x86') {
    return bitness === '32' ? 'unknown' : 'x64';
  }
  return undefined;
}

function archFromUserAgent(os: Os, userAgent: string): Arch {
  // Browsers on a Mac always report Intel in the user agent, so it says nothing there.
  if (os === 'macos') {
    return 'unknown';
  }
  if (/aarch64|arm64/i.test(userAgent)) {
    return 'arm64';
  }
  if (/x86_64|x86-64|x64|win64|wow64|amd64/i.test(userAgent)) {
    return 'x64';
  }
  return 'unknown';
}

/**
 * Works out the visitor's system. It prefers the client hints from `navigator.userAgentData` and
 * falls back to the user agent string. Phones, tablets and Chromebooks are `unsupported`. On a
 * Mac the architecture stays `unknown` unless the browser reveals it, and the interface asks.
 */
export function detectPlatform(input: PlatformInput): Platform {
  const userAgent = input.userAgent;
  const hinted = osFromPlatformHint(input.platform);

  if (input.mobile === true || hinted === 'unsupported' || UNSUPPORTED_DEVICE.test(userAgent)) {
    return { os: 'unsupported', arch: 'unknown' };
  }

  const os = hinted ?? osFromUserAgent(userAgent);

  // An iPad asking for the desktop site sends a Mac user agent but has a touch screen.
  if (os === 'macos' && (input.maxTouchPoints ?? 0) > 1) {
    return { os: 'unsupported', arch: 'unknown' };
  }
  if (os === 'unsupported') {
    return { os, arch: 'unknown' };
  }

  return {
    os,
    arch: archFromHints(input.architecture, input.bitness) ?? archFromUserAgent(os, userAgent),
  };
}

/** The name people know the system by. */
export function osLabel(os: Exclude<Os, 'unsupported'>): string {
  switch (os) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
  }
}
