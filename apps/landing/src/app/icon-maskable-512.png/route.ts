import { renderIcon } from '@/og/icon-image';

export const dynamic = 'force-static';

// A full bleed green square. The brackets and dot sit well inside the central safe zone.
export function GET(): Response {
  return renderIcon({ size: 512, fullBleed: true });
}
