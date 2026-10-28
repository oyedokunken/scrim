import { z } from 'zod';

const CURSOR_STYLES = ['halo-ripples', 'halo', 'ripples', 'off'] as const;
const HALO_COLORS = ['brand', 'green', 'white', 'black'] as const;
const SOURCE_KINDS = ['region', 'display', 'window'] as const;

/** Every setting and its rule. Zoom is stored only in Phase 2 and applied at export later. */
const fields = {
  destinationFolder: z.string().min(1).max(1024).nullable(),
  lastSourceKind: z.enum(SOURCE_KINDS),
  cursorStyle: z.enum(CURSOR_STYLES),
  haloColor: z.enum(HALO_COLORS),
  zoomOn: z.boolean(),
  zoomLevel: z.number().min(1.2).max(3),
  holdAfterClickMs: z.number().int().min(200).max(5000),
  smoothness: z.number().min(0).max(1),
  cameraDeviceId: z.string().max(512).nullable(),
  micDeviceId: z.string().max(512).nullable(),
  cameraOn: z.boolean(),
  micOn: z.boolean(),
  frameRate: z.union([z.literal(30), z.literal(60)]),
  firstRunDone: z.boolean(),
  showWelcome: z.boolean(),
};

export const settingsSchema = z.object(fields).strict();
export type Settings = z.infer<typeof settingsSchema>;

/**
 * A change the renderer may ask for: any subset of the settings except the destination folder. The
 * renderer is untrusted, so the folder only changes when the person picks one in the system dialog,
 * which the main process records itself.
 */
export const settingsPatchSchema = z
  .object(fields)
  .omit({ destinationFolder: true })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Every change the main process itself may make, which includes the destination folder. */
export const settingsChangeSchema = z.object(fields).partial().strict();
export type SettingsChange = z.infer<typeof settingsChangeSchema>;

/**
 * What a settings file may hold on disk: the version plus any subset of settings. Missing
 * settings fall back to the defaults (so an older file keeps working after an update), and keys
 * from a newer version are dropped. A value of the wrong type makes the file invalid.
 */
export const SETTINGS_FILE_VERSION = 1;
export const settingsFileSchema = z
  .object({ version: z.literal(SETTINGS_FILE_VERSION), ...fields })
  .partial({
    destinationFolder: true,
    lastSourceKind: true,
    cursorStyle: true,
    haloColor: true,
    zoomOn: true,
    zoomLevel: true,
    holdAfterClickMs: true,
    smoothness: true,
    cameraDeviceId: true,
    micDeviceId: true,
    cameraOn: true,
    micOn: true,
    frameRate: true,
    firstRunDone: true,
    showWelcome: true,
  });

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  destinationFolder: null,
  lastSourceKind: 'display',
  cursorStyle: 'halo-ripples',
  haloColor: 'brand',
  zoomOn: true,
  zoomLevel: 1.8,
  holdAfterClickMs: 1200,
  smoothness: 0.6,
  cameraDeviceId: null,
  micDeviceId: null,
  cameraOn: false,
  micOn: false,
  frameRate: 30,
  firstRunDone: false,
  showWelcome: true,
});
