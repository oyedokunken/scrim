'use client';

import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/platform';
import { readPlatform, type NavigatorLike } from '@/lib/platform-client';

/**
 * The visitor's system, or `null` on the server and during the first client render. Callers show
 * a neutral state until it arrives, so the server and client markup always match.
 */
export function usePlatform(): Platform | null {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `navigator.userAgentData` is not in every TypeScript DOM library, so it is read loosely.
    void readPlatform(navigator as NavigatorLike).then((detected) => {
      if (!cancelled) {
        setPlatform(detected);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return platform;
}
