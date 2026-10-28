import { z } from 'zod';
import type { Channel, EventChannel } from './channels';
import { isAllowedExternalUrl } from './external-urls';
import { imageContract } from './image-contract';
import {
  areaOutcomeSchema,
  areaRequestSchema,
  deviceSchema,
  finishedSchema,
  outcome,
  pathSchema,
  recordingErrorSchema,
  recordingNameSchema,
  recoverableSchema,
  snapshotSchema,
  sourceSchema,
  warningSchema,
} from './recording-contract';
import { settingsPatchSchema, settingsSchema } from './settings';

/** A link the app may open: the Scrim repository on GitHub, nothing else. */
const allowedUrlSchema = z
  .string()
  .max(2048)
  .refine(isAllowedExternalUrl, 'That link is not allowed.');

/**
 * Every call the renderer can make, with the exact shape of what goes in and what comes out.
 * The main process validates the sender, the input and the output on every call. To add a
 * channel, go in this order: the name in channels.ts, this contract, the main handler, the
 * preload bridge (automatic), then tests.
 */
export const contract = {
  'app:version': { input: z.void(), output: z.string().min(1).max(64) },
  'settings:get': { input: z.void(), output: settingsSchema },
  'settings:set': { input: settingsPatchSchema, output: settingsSchema },
  'folder:choose': { input: z.void(), output: z.string().nullable() },
  'shell:open-external': {
    input: z.object({ url: allowedUrlSchema }).strict(),
    output: z.void(),
  },
  'shell:show-in-folder': { input: z.object({ path: pathSchema }).strict(), output: z.void() },
  'logs:open-folder': { input: z.void(), output: z.void() },
  'area:run': { input: areaRequestSchema, output: areaOutcomeSchema },
  'area:cancel': { input: z.void(), output: z.void() },
  ...imageContract,
  // The destination is not an input: the main process uses the folder the person chose.
  'recording:start': {
    input: z
      .object({
        source: sourceSchema,
        camera: deviceSchema,
        mic: deviceSchema,
        name: recordingNameSchema.optional(),
      })
      .strict(),
    output: outcome(z.object({}).strict()),
  },
  'recording:pause': { input: z.void(), output: outcome(z.void()) },
  'recording:resume': { input: z.void(), output: outcome(z.void()) },
  'recording:stop': { input: z.void(), output: outcome(finishedSchema) },
  'recording:snapshot': { input: z.void(), output: snapshotSchema },
  'recording:list-recoverable': { input: z.void(), output: z.array(recoverableSchema) },
  // Only a folder that the list above offered is accepted, which the handler checks.
  'recording:recover': {
    input: z.object({ folder: pathSchema }).strict(),
    output: outcome(finishedSchema),
  },
  'recording:dismiss': { input: z.object({ folder: pathSchema }).strict(), output: z.void() },
} as const satisfies Record<Channel, { input: z.ZodType; output: z.ZodType }>;

/** Messages from the main process to the renderer. Validated before they are sent. */
export const events = {
  'settings:changed': settingsSchema,
  'recording:state': snapshotSchema,
  'recording:warning': warningSchema,
  'recording:error': recordingErrorSchema,
  'recording:finished': finishedSchema,
  /** After every capture, whether it came from the button or the shortcut. */
  'screenshot:taken': z
    .object({
      path: pathSchema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .strict(),
} as const satisfies Record<EventChannel, z.ZodType>;

export type InputOf<C extends Channel> = z.input<(typeof contract)[C]['input']>;
export type OutputOf<C extends Channel> = z.output<(typeof contract)[C]['output']>;
export type EventPayload<E extends EventChannel> = z.output<(typeof events)[E]>;
