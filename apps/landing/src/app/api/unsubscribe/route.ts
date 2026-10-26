import { getDb } from '@/server/db';
import { getServerEnv } from '@/server/env';
import { handleUnsubscribe } from '@/server/unsubscribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unsubscribes a person from release notices. There is no GET, on purpose. */
export async function POST(request: Request): Promise<Response> {
  const env = getServerEnv();
  const result = await handleUnsubscribe(
    { headers: request.headers, bodyText: await request.text() },
    {
      store: {
        async unsubscribe(token) {
          const { count } = await getDb().person.updateMany({
            where: { unsubscribeToken: token, unsubscribedAt: null },
            data: { unsubscribedAt: new Date() },
          });
          return count > 0;
        },
      },
      siteOrigin: new URL(env.SITE_URL).origin,
      log: (message) => {
        console.warn(message);
      },
    },
  );
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
