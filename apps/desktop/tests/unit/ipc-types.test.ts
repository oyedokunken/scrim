import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Channel, EventChannel } from '../../src/shared/channels';
import type { contract, events } from '../../src/shared/ipc-contract';
import type { ScrimApi } from '../../src/shared/scrim-api';
import type { Settings } from '../../src/shared/settings';

// These checks run in the compiler (`tsc -b`), not at run time. A line marked `@ts-expect-error`
// that stops being an error fails the build, and so does any assertion that no longer holds.
// The bodies are never called, because `api` only exists as a type.
declare const api: ScrimApi;

describe('the typed bridge', () => {
  it('has exactly the channels in the contract', () => {
    expectTypeOf<keyof typeof contract>().toEqualTypeOf<Channel>();
    expectTypeOf<keyof typeof events>().toEqualTypeOf<EventChannel>();
  });

  it('checks channel names, inputs and outputs at compile time', () => {
    const compileTimeOnly = (): void => {
      // @ts-expect-error not a channel in the contract
      void api.invoke('settings:delete-everything');
      // @ts-expect-error a channel with no input takes no argument
      void api.invoke('settings:get', {});
      // @ts-expect-error a channel with an input needs it
      void api.invoke('settings:set');
      // @ts-expect-error the input must match the schema
      void api.invoke('settings:set', { zoomLevel: 'big' });
      // @ts-expect-error an unknown setting is not allowed
      void api.invoke('settings:set', { notASetting: true });
      // @ts-expect-error not an event in the contract
      api.on('recorder:exploded', () => undefined);

      expectTypeOf(api.invoke('settings:get')).resolves.toEqualTypeOf<Settings>();
      expectTypeOf(api.invoke('folder:choose')).resolves.toEqualTypeOf<string | null>();
      expectTypeOf(api.invoke('logs:open-folder')).resolves.toBeVoid();
    };
    expect(typeof compileTimeOnly).toBe('function');
  });

  it('gives event listeners the validated payload type', () => {
    const compileTimeOnly = (): void => {
      api.on('settings:changed', (payload) => {
        expectTypeOf(payload).toEqualTypeOf<Settings>();
      });
    };
    expect(typeof compileTimeOnly).toBe('function');
  });
});
