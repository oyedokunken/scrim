import { renderFullLogo } from '@/og/logo-image';

// Email clients block SVG and often block attached images, so the emails load the logo from the
// website as an ordinary PNG. It is drawn at twice its shown size so it stays sharp on high density
// screens, and it is built once at build time.
export const dynamic = 'force-static';

export async function GET(): Promise<Response> {
  const image = await renderFullLogo();
  return new Response(image.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
