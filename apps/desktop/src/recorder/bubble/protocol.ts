import { z } from 'zod';

/** What main tells the bubble page. The pictures themselves never pass through main. */
export type BubbleCommand =
  | {
      type: 'init';
      /** The camera to show. The system default when left out. */
      cameraDeviceId?: string | undefined;
      /** Whether the dot follows the microphone, and which one. */
      mic: { enabled: boolean; deviceId?: string | undefined };
      side: 'left' | 'right';
      /** The picture's diameter in pixels, and whether it is round or a rounded square. */
      size?: number | undefined;
      shape?: 'circle' | 'rounded-square' | undefined;
    }
  /** The bubble moved to a corner on the other side, so the dot swaps sides. */
  | { type: 'side'; side: 'left' | 'right' };

/** What the page may tell main. Strict, and checked in main before anything is used. */
export const bubbleEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
]);
