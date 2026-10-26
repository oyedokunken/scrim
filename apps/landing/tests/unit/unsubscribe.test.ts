import { describe, expect, it } from 'vitest';
import { handleUnsubscribe, unsubscribeSchema } from '@/server/unsubscribe';

const TOKEN = '3f2b8c1e-5d4a-4b7e-9a10-2c6f8d9e0a11';
const ORIGIN = 'http://localhost:3000';

const headers = (extra: Record<string, string> = {}) =>
  new Headers({
    'content-type': 'application/json',
    origin: ORIGIN,
    host: 'localhost:3000',
    ...extra,
  });

function setup(unsubscribe?: (token: string) => Promise<boolean>) {
  const seen: string[] = [];
  const logs: string[] = [];
  return {
    seen,
    logs,
    deps: {
      store: {
        unsubscribe:
          unsubscribe ??
          ((token: string) => {
            seen.push(token);
            return Promise.resolve(true);
          }),
      },
      siteOrigin: ORIGIN,
      log: (message: string) => logs.push(message),
    },
  };
}

describe('unsubscribeSchema', () => {
  it('accepts a token that is a UUID and nothing else', () => {
    expect(unsubscribeSchema.safeParse({ token: TOKEN }).success).toBe(true);
    expect(unsubscribeSchema.safeParse({ token: 'abc' }).success).toBe(false);
    expect(unsubscribeSchema.safeParse({ token: TOKEN, extra: 1 }).success).toBe(false);
    expect(unsubscribeSchema.safeParse({}).success).toBe(false);
  });
});

describe('handleUnsubscribe', () => {
  it('unsubscribes the person behind the token', async () => {
    const { deps, seen } = setup();
    const result = await handleUnsubscribe(
      { headers: headers(), bodyText: JSON.stringify({ token: TOKEN }) },
      deps,
    );
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(seen).toEqual([TOKEN]);
  });

  it('gives an unknown token the same answer as a known one, so nobody can probe the list', async () => {
    const { deps } = setup(() => Promise.resolve(false));
    const result = await handleUnsubscribe(
      { headers: headers(), bodyText: JSON.stringify({ token: TOKEN }) },
      deps,
    );
    expect(result).toEqual({ status: 200, body: { ok: true } });
  });

  it('refuses a request from another site', async () => {
    const { deps, seen } = setup();
    const result = await handleUnsubscribe(
      {
        headers: headers({ origin: 'https://evil.example' }),
        bodyText: JSON.stringify({ token: TOKEN }),
      },
      deps,
    );
    expect(result.status).toBe(403);
    expect(seen).toEqual([]);
  });

  it('refuses a request with no origin', async () => {
    const { deps } = setup();
    const h = headers();
    h.delete('origin');
    const result = await handleUnsubscribe(
      { headers: h, bodyText: JSON.stringify({ token: TOKEN }) },
      deps,
    );
    expect(result.status).toBe(403);
  });

  it('refuses a request that is not JSON', async () => {
    const { deps } = setup();
    const result = await handleUnsubscribe(
      {
        headers: headers({ 'content-type': 'text/plain' }),
        bodyText: JSON.stringify({ token: TOKEN }),
      },
      deps,
    );
    expect(result.status).toBe(415);
  });

  it('refuses a body that is too large', async () => {
    const { deps } = setup();
    const result = await handleUnsubscribe(
      { headers: headers(), bodyText: JSON.stringify({ token: TOKEN, pad: 'x'.repeat(600) }) },
      deps,
    );
    expect(result.status).toBe(413);
  });

  it('refuses text that is not JSON and a token that is not valid', async () => {
    const { deps, seen } = setup();
    expect((await handleUnsubscribe({ headers: headers(), bodyText: '{nope' }, deps)).status).toBe(
      400,
    );
    expect(
      (
        await handleUnsubscribe(
          { headers: headers(), bodyText: JSON.stringify({ token: 'x' }) },
          deps,
        )
      ).status,
    ).toBe(400);
    expect(seen).toEqual([]);
  });

  it('says it could not and logs without the token when the database fails', async () => {
    const { deps, logs } = setup(() => Promise.reject(new Error(`db error for ${TOKEN}`)));
    const result = await handleUnsubscribe(
      { headers: headers(), bodyText: JSON.stringify({ token: TOKEN }) },
      deps,
    );
    expect(result.status).toBe(500);
    expect(logs).toEqual(['Could not unsubscribe a person.']);
    expect(logs.join(' ')).not.toContain(TOKEN);
  });
});
