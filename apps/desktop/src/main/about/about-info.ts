import type { About, SystemInfo } from '../../shared/about-contract';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The build date comes from the bundler, which writes the day the app was built into the main
 * bundle (see electron.vite.config.ts). Under test or in an unusual build it is missing, and the
 * card then shows nothing for it instead of a made up date.
 */
export function releaseDateOf(stamp: unknown): string | null {
  return typeof stamp === 'string' && DAY.test(stamp) ? stamp : null;
}

export interface AboutDeps {
  name: string;
  version: string;
  license: string;
  /** The raw build stamp, or undefined. */
  buildStamp: unknown;
}

/**
 * There is no "last updated" time: the modified time of a packaged program file is not reliable
 * (an installer can stamp it with 1 January 1980), so only the build day is reported.
 */
export function readAbout(deps: AboutDeps): About {
  return {
    name: deps.name,
    version: deps.version,
    license: deps.license,
    releaseDate: releaseDateOf(deps.buildStamp),
  };
}

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

export interface OsDeps {
  platform: string;
  /** os.version(): "Windows 11 Pro" on Windows, a long kernel text elsewhere. */
  version: string;
  /** os.release(): "10.0.26300", "24.1.0", "6.8.0". */
  release: string;
  hostname: string;
}

/** A plain description such as "Windows 11 Pro (10.0.26300)". The kernel text on Mac and Linux is long, so only the release is used there. */
export function describeOs(deps: OsDeps): string {
  const name = PLATFORM_NAMES[deps.platform] ?? deps.platform;
  const detail = deps.platform === 'win32' ? deps.version.trim() : '';
  const base = detail.startsWith(name) ? detail : `${name} ${detail}`.trim();
  const release = deps.release.trim();
  return release === '' ? base : `${base} (${release})`;
}

/** Read on demand for the About card only. Nothing here is logged or sent. */
export function readSystemInfo(deps: OsDeps): SystemInfo {
  return { computerName: deps.hostname.slice(0, 255), operatingSystem: describeOs(deps) };
}
