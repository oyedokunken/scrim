import 'server-only';
import { renderIcon } from '@/og/icon-image';

let cached: Uint8Array | undefined;

/** The Scrim mark as a PNG, drawn by the same code as the favicon and the app icons. */
export async function loadMailLogo(): Promise<Uint8Array> {
  cached ??= new Uint8Array(await renderIcon({ size: 132 }).arrayBuffer());
  return cached;
}
