/**
 * Channel names, with no schemas. The sandboxed preload may import this file because it pulls in
 * no library, while the contract (which needs zod) stays out of it. A test checks that the
 * contract declares exactly these channels, so the two cannot drift apart.
 */
export const CHANNELS = [
  'app:version',
  'settings:get',
  'settings:set',
  'folder:choose',
  'shell:open-external',
  'shell:show-in-folder',
  'logs:open-folder',
  'area:run',
  'area:cancel',
  'image:read',
  'image:save-edited',
  'image:copy',
  'image:save-as',
  'image:drag',
  'image:delete',
  'recording:start',
  'recording:pause',
  'recording:resume',
  'recording:stop',
  'recording:snapshot',
  'recording:list-recoverable',
  'recording:recover',
  'recording:dismiss',
] as const;
export type Channel = (typeof CHANNELS)[number];

/** Messages the main process pushes to the renderer. */
export const EVENT_CHANNELS = [
  'settings:changed',
  'recording:state',
  'recording:warning',
  'recording:error',
  'recording:finished',
  'screenshot:taken',
] as const;
export type EventChannel = (typeof EVENT_CHANNELS)[number];
