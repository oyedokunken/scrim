/**
 * Channel names for the floating recording pill. Main sends the state. The page sends actions.
 * This file has no imports, so the sandboxed preload can use it without pulling in a library.
 */
export const PILL_CHANNELS = {
  state: 'scrim-pill:state',
  action: 'scrim-pill:action',
} as const;
