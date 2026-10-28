/**
 * Channel names for the camera bubble. Main sends commands, the page sends events. No imports, so
 * the sandboxed preload can use this file without pulling in a library.
 */
export const BUBBLE_CHANNELS = {
  command: 'scrim-bubble:command',
  event: 'scrim-bubble:event',
} as const;
