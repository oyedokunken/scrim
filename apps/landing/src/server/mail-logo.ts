import 'server-only';
import { renderFullLogo } from '@/og/logo-image';

let cached: Uint8Array | undefined;

/** The full Scrim logo (mark and wordmark) as a PNG, drawn from the same mark as the app icons. */
export async function loadMailLogo(): Promise<Uint8Array> {
  cached ??= new Uint8Array(await (await renderFullLogo()).arrayBuffer());
  return cached;
}
