import type { Channel, EventChannel } from './channels';
import type { EventPayload, InputOf, OutputOf } from './ipc-contract';

/** A channel whose input is `void` is called with no argument. */
type InvokeArgs<C extends Channel> = [undefined] extends [InputOf<C>] ? [] : [input: InputOf<C>];

/**
 * What `window.scrim` offers the renderer. Channel names are string literals checked against the
 * contract, so a misspelled or unknown channel is a compile error.
 */
export interface ScrimApi {
  invoke<C extends Channel>(channel: C, ...args: InvokeArgs<C>): Promise<OutputOf<C>>;
  /** Subscribes to a pushed event. Returns a function that unsubscribes. */
  on<E extends EventChannel>(event: E, listener: (payload: EventPayload<E>) => void): () => void;
}
