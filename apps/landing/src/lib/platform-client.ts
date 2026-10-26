import { detectPlatform, type Platform, type PlatformInput } from './platform';

interface UserAgentDataLike {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string; bitness?: string }>;
}

/** The slice of `navigator` that detection uses. Pass a stand in under test. */
export interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: UserAgentDataLike;
}

/**
 * Reads the browser. It asks for the architecture through client hints where they exist, and
 * quietly carries on without them when the browser refuses or does not support them.
 */
export async function readPlatformInput(nav: NavigatorLike): Promise<PlatformInput> {
  const data = nav.userAgentData;
  let architecture: string | undefined;
  let bitness: string | undefined;

  if (data?.getHighEntropyValues !== undefined) {
    try {
      const values = await data.getHighEntropyValues(['architecture', 'bitness']);
      architecture = values.architecture;
      bitness = values.bitness;
    } catch {
      // Blocked by policy or unsupported. The user agent string is the fallback.
    }
  }

  return {
    userAgent: nav.userAgent,
    platform: data?.platform,
    mobile: data?.mobile,
    architecture,
    bitness,
    maxTouchPoints: nav.maxTouchPoints,
  };
}

/** Detects the platform of a browser. Run it on the client, after hydration. */
export async function readPlatform(nav: NavigatorLike): Promise<Platform> {
  return detectPlatform(await readPlatformInput(nav));
}
