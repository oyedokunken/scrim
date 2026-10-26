import { z } from 'zod';

const CURSOR_STYLES = ['halo-ripples', 'halo', 'ripples', 'off'] as const;
const SOURCE_KINDS = ['region', 'display', 'window'] as const;

/** Every setting and its rule. Zoom is stored only in Phase 2 and applied at export later. */
const fields = {
  destinationFolder: z.string().min(1).max(1024).nullable(),
  lastSourceKind: z.enum(SOURCE_KINDS),
  cursorStyle: z.enum(CURSOR_STYLES),
  zoomOn: z.boolean(),
  zoomLevel: z.number().min(1.2).max(3),
  holdAfterClickMs: z.number().int().min(200).max(5000),
  smoothness: z.number().min(0).max(1),
  cameraDeviceId: z.string().max(512).nullable(),
  micDeviceId: z.string().max(512).nullable(),
  cameraOn: z.boolean(),
  micOn: z.boolean(),
  frameRate: z.union([z.literal(30), z.literal(60)]),
};

export const settingsSchema = z.object(fields).strict();
export type Settings = z.infer<typeof settingsSchema>;

/** A change request: any subset of the settings, and nothing else. */
export const settingsPatchSchema = z.object(fields).partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

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
    zoomOn: true,
    zoomLevel: true,
    holdAfterClickMs: true,
    smoothness: true,
    cameraDeviceId: true,
    micDeviceId: true,
    cameraOn: true,
    micOn: true,
    frameRate: true,
  });

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  destinationFolder: null,
  lastSourceKind: 'display',
  cursorStyle: 'halo-ripples',
  zoomOn: true,
  zoomLevel: 1.8,
  holdAfterClickMs: 1200,
  smoothness: 0.6,
  cameraDeviceId: null,
  micDeviceId: null,
  cameraOn: false,
  micOn: false,
  frameRate: 30,
});
