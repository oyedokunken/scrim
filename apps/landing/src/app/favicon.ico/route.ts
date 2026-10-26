import { buildIco } from '@/lib/ico';
import { renderIcon } from '@/og/icon-image';

export const dynamic = 'force-static';

async function png(size: number): Promise<Uint8Array> {
  return new Uint8Array(await renderIcon({ size }).arrayBuffer());
}

/** The same mark at 16 and 32 pixels, built here so no binary file lives in the repo. */
export async function GET(): Promise<Response> {
  const ico = buildIco([
    { size: 16, png: await png(16) },
    { size: 32, png: await png(32) },
  ]);
  return new Response(ico.slice().buffer, {
    headers: {
      'Content-Type': 'image/x-icon',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
