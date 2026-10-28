import { CHANNELS, type Channel } from '../../shared/channels';
import { contract, type InputOf, type OutputOf } from '../../shared/ipc-contract';
import { isOwnUrl } from '../permissions';

/** The frame a call came from, as the dispatcher needs to judge it. */
export interface SenderInfo {
  frameUrl: string;
  /** False for an iframe inside our page. Only the top frame of our own page may call. */
  isMainFrame: boolean;
}

export type Handlers = {
  [C in Channel]: (input: InputOf<C>) => Promise<OutputOf<C>> | OutputOf<C>;
};

export type IpcFailure =
  'unknown-channel' | 'forbidden-sender' | 'invalid-input' | 'invalid-output' | 'handler-failed';

/** What the renderer is told. It never carries paths, values or stack traces. */
const MESSAGES: Record<IpcFailure, string> = {
  'unknown-channel': 'Scrim does not know that request.',
  'forbidden-sender': 'Scrim rejected a request from an unexpected page.',
  'invalid-input': 'Scrim rejected that request because it was not in the expected form.',
  'invalid-output': 'Scrim could not complete that request.',
  'handler-failed': 'Scrim could not complete that request.',
};

export class IpcError extends Error {
  readonly failure: IpcFailure;
  constructor(failure: IpcFailure) {
    super(MESSAGES[failure]);
    this.name = 'IpcError';
    this.failure = failure;
  }
}

/** Only our own page, in its top frame, may call. A missing sender frame is a rejection. */
export function isTrustedSender(
  sender: SenderInfo | null | undefined,
  allowedOrigin: string,
): boolean {
  if (!sender) return false;
  return sender.isMainFrame && isOwnUrl(sender.frameUrl, allowedOrigin);
}

const KNOWN: ReadonlySet<string> = new Set(CHANNELS);

function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && KNOWN.has(value);
}

export interface DispatcherOptions {
  handlers: Handlers;
  allowedOrigin: string;
  /** Receives the failure kind and channel, never the input or the error text. */
  onFailure?: (failure: IpcFailure, channel: string) => void;
}

/**
 * Runs one call: checks the sender, the number of arguments and the input against the contract,
 * calls the handler, then checks the output against the contract before it leaves the process.
 */
export function createDispatcher({ handlers, allowedOrigin, onFailure }: DispatcherOptions) {
  const fail = (failure: IpcFailure, channel: string): never => {
    onFailure?.(failure, channel);
    throw new IpcError(failure);
  };

  return async function dispatch(
    channel: unknown,
    sender: SenderInfo | null | undefined,
    args: readonly unknown[],
  ): Promise<unknown> {
    if (!isChannel(channel)) return fail('unknown-channel', String(channel).slice(0, 64));
    if (!isTrustedSender(sender, allowedOrigin)) return fail('forbidden-sender', channel);
    if (args.length > 1) return fail('invalid-input', channel);

    const entry = contract[channel];
    const input = entry.input.safeParse(args[0]);
    if (!input.success) return fail('invalid-input', channel);

    let result: unknown;
    try {
      // The handler type depends on the channel, which TypeScript cannot follow through a
      // lookup, so the parsed input is passed on as the contract promised.
      const handler = handlers[channel] as (value: unknown) => unknown;
      result = await handler(input.data);
    } catch {
      return fail('handler-failed', channel);
    }

    const output = entry.output.safeParse(result);
    if (!output.success) return fail('invalid-output', channel);
    return output.data;
  };
}
