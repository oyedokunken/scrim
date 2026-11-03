import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_PLATFORM_INFO,
  platformInfoSchema,
  type PlatformInfo,
} from '../../shared/platform-info';

let cached: PlatformInfo | undefined;

/** For tests: pretend the main process gave this answer. Pass undefined to forget it. */
export function setPlatformInfoForTests(info: PlatformInfo | undefined): void {
  cached = info;
}

/**
 * What this system can do. Until the main process answers, and if it cannot, the page assumes
 * Windows, which is what it always did before.
 */
export function usePlatformInfo(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>(cached ?? DEFAULT_PLATFORM_INFO);
  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;
    void Promise.resolve()
      .then(() => window.scrim.invoke('platform:info'))
      .then(
        (answer) => {
          const parsed = platformInfoSchema.safeParse(answer);
          if (!parsed.success) return;
          cached = parsed.data;
          if (alive) setInfo(parsed.data);
        },
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** A calm, plain note: no red, no alarm. Renders nothing when there is no text. */
export function PlatformNote({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p className="platform-note" role="note">
      <Info size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
