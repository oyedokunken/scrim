import { z } from 'zod';

/** Channel names for the area overlay windows. Main sends commands. The pages send events. */
export const REGION_CHANNELS = {
  command: 'scrim-region:command',
  event: 'scrim-region:event',
} as const;

export const areaKindSchema = z.enum(['region', 'window', 'display']);
export type AreaKind = z.infer<typeof areaKindSchema>;

const device = z.strictObject({
  enabled: z.boolean(),
  deviceId: z.string().min(1).max(512).optional(),
});
export type DeviceChoice = z.infer<typeof device>;

const rect = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

/** One window the person can pick. The picture is a PNG, sent as bytes, never as a URL. */
export interface WindowTile {
  id: string;
  name: string;
  png: Uint8Array;
}

/** What main tells an overlay. */
export type RegionCommand =
  | {
      type: 'init';
      /** Recording shows the toolbar and the countdown. Screenshot captures on release. */
      mode: 'record' | 'screenshot';
      area: AreaKind;
      camera: DeviceChoice;
      mic: DeviceChoice;
      /** Whether this display is the one the pointer was on, and so shows the hint and pill. */
      primary: boolean;
    }
  /** Another display's overlay started a box, so this one drops any box it has drawn. */
  | { type: 'clear' }
  /** The person chose another kind of area on another display. */
  | { type: 'set-area'; area: AreaKind }
  /** The toggles changed on another display. */
  | { type: 'set-devices'; camera: DeviceChoice; mic: DeviceChoice }
  | { type: 'windows'; tiles: WindowTile[] }
  /** The countdown shows this number, or is over when null. */
  | { type: 'count'; n: number | null };

/** What an overlay page may tell main. Strict, and checked in main before anything is used. */
export const regionEventSchema = z.discriminatedUnion('type', [
  /** The page has loaded and is showing. */
  z.strictObject({ type: z.literal('ready') }),
  /** The person began drawing a box here. */
  z.strictObject({ type: z.literal('begin') }),
  /** The person chose Region, Window or Full screen. */
  z.strictObject({ type: z.literal('area'), area: areaKindSchema }),
  /** A toggle or a device changed. */
  z.strictObject({ type: z.literal('devices'), camera: device, mic: device }),
  /** A box was confirmed, in device independent pixels on this display. */
  z.strictObject({ type: z.literal('confirm-region'), rect }),
  /** A window card was picked. */
  z.strictObject({ type: z.literal('confirm-window'), sourceId: z.string().min(1).max(256) }),
  /** The whole display of this overlay was picked. */
  z.strictObject({ type: z.literal('confirm-display') }),
  /** Enter during the countdown starts at once. */
  z.strictObject({ type: z.literal('skip') }),
  /** Escape was pressed. */
  z.strictObject({ type: z.literal('cancel') }),
]);
