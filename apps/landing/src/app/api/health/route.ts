export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness for an uptime monitor. It reports nothing about the database. */
export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
