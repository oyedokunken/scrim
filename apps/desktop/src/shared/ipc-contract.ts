import { z } from 'zod';
import type { Channel, EventChannel } from './channels';
import { isAllowedExternalUrl } from './external-urls';
import { settingsPatchSchema, settingsSchema } from './settings';

/** A link the app may open: the Scrim repository on GitHub, nothing else. */
const allowedUrlSchema = z
  .string()
  .max(2048)
  .refine(isAllowedExternalUrl, 'That link is not allowed.');

const pathSchema = z.string().min(1).max(1024);

/**
 * Every call the renderer can make, with the exact shape of what goes in and what comes out.
 * The main process validates the sender, the input and the output on every call. To add a
 * channel, go in this order: the name in channels.ts, this contract, the main handler, the
 * preload bridge (automatic), then tests.
 */
export const contract = {
  'settings:get': { input: z.void(), output: settingsSchema },
  'settings:set': { input: settingsPatchSchema, output: settingsSchema },
  'folder:choose': { input: z.void(), output: z.string().nullable() },
  'shell:open-external': {
    input: z.object({ url: allowedUrlSchema }).strict(),
    output: z.void(),
  },
  'shell:show-in-folder': { input: z.object({ path: pathSchema }).strict(), output: z.void() },
  'logs:open-folder': { input: z.void(), output: z.void() },
} as const satisfies Record<Channel, { input: z.ZodType; output: z.ZodType }>;

/** Messages from the main process to the renderer. Validated before they are sent. */
export const events = {
  'settings:changed': settingsSchema,
} as const satisfies Record<EventChannel, z.ZodType>;

export type InputOf<C extends Channel> = z.input<(typeof contract)[C]['input']>;
export type OutputOf<C extends Channel> = z.output<(typeof contract)[C]['output']>;
export type EventPayload<E extends EventChannel> = z.output<(typeof events)[E]>;
