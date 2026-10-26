import 'server-only';
import { z } from 'zod';

export const unsubscribeSchema = z.strictObject({
  token: z.uuid('That unsubscribe link is not valid.'),
});

export interface UnsubscribeStore {
  /** Marks the person behind a token as unsubscribed. True when a person was found. */
  unsubscribe(token: string): Promise<boolean>;
}

export interface UnsubscribeResult {
  status: number;
  body: { ok: true } | { error: string };
}

function sameOrigin(headers: Headers, siteOrigin: string): boolean {
  const origin = headers.get('origin');
  if (origin === null) {
    return false;
  }
  try {
    const url = new URL(origin);
    return url.origin === siteOrigin || url.host === headers.get('host');
  } catch {
    return false;
  }
}

/**
 * Unsubscribes someone from release notices. It only ever runs for a POST from our own page,
 * because mail scanners open links and a GET must never change anything. An unknown token gets the
 * same answer as a known one, so the endpoint cannot be used to find out who is on the list.
 */
export async function handleUnsubscribe(
  input: { headers: Headers; bodyText: string },
  deps: { store: UnsubscribeStore; siteOrigin: string; log?: (message: string) => void },
): Promise<UnsubscribeResult> {
  if (!(input.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return { status: 415, body: { error: 'Send the request as JSON.' } };
  }
  if (input.bodyText.length > 512) {
    return { status: 413, body: { error: 'That request is too large.' } };
  }
  if (!sameOrigin(input.headers, deps.siteOrigin)) {
    return { status: 403, body: { error: 'This request must come from the Scrim website.' } };
  }

  let json: unknown;
  try {
    json = JSON.parse(input.bodyText);
  } catch {
    return { status: 400, body: { error: 'That request could not be read.' } };
  }
  const parsed = unsubscribeSchema.safeParse(json);
  if (!parsed.success) {
    return { status: 400, body: { error: 'That unsubscribe link is not valid.' } };
  }

  try {
    await deps.store.unsubscribe(parsed.data.token);
  } catch {
    deps.log?.('Could not unsubscribe a person.');
    return { status: 500, body: { error: 'Something went wrong. Please try again.' } };
  }
  return { status: 200, body: { ok: true } };
}
