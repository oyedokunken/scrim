import { renderIcon } from '@/og/icon-image';

export const dynamic = 'force-static';

export function GET(): Response {
  return renderIcon({ size: 192 });
}
