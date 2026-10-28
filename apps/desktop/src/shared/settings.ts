import { z } from 'zod';
import { DEFAULT_ACCELERATORS, isValidAccelerator } from './shortcut-keys';

const CURSOR_STYLES = ['halo-ripples', 'halo', 'ripples', 'off'] as const;
const HALO_COLORS = ['brand', 'green', 'white', 'black'] as const;
const BUBBLE_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const BUBBLE_SIZES = ['S', 'M', 'L'] as const;
const BUBBLE_SHAPES = ['circle', 'rounded-square'] as const;
const MIC_VOLUMES = ['quieter', 'normal', 'louder'] as const;
const PADDINGS = ['none', 'small', 'medium', 'large'] as const;
const CORNERS = ['square', 'soft', 'round'] as const;
const SOURCE_KINDS = ['region', 'display', 'window'] as const;
const acceleratorSchema = z.string().max(64).refine(isValidAccelerator, 'Not a usable shortcut.');

/** Every setting and its rule. Zoom is stored only in Phase 2 and applied at export later. */
const fields = {
  destinationFolder: z.string().min(1).max(1024).nullable(),
  /** Where screenshots are saved. Null means Pictures\Scrim. Only the folder picker sets it. */
  screenshotFolder: z.string().min(1).max(1024).nullable(),
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
  bubbleCorner: z.enum(BUBBLE_CORNERS),
  bubbleSize: z.enum(BUBBLE_SIZES),
  bubbleShape: z.enum(BUBBLE_SHAPES),
  keepSound: z.boolean(),
  micVolume: z.enum(MIC_VOLUMES),
  /** A preset id from the render constants, or `none`. A custom image is not offered yet. */
  backgroundId: z.string().min(1).max(64),
  backgroundPadding: z.enum(PADDINGS),
  backgroundCorners: z.enum(CORNERS),
  backgroundShadow: z.boolean(),
  micOn: z.boolean(),
  frameRate: z.union([z.literal(30), z.literal(60)]),
  firstRunDone: z.boolean(),
  showWelcome: z.boolean(),
  /** The 3, 2, 1 before a recording starts. Off starts it at once. */
  countdownOn: z.boolean(),
  shortcutRecord: acceleratorSchema,
  shortcutStop: acceleratorSchema,
  shortcutScreenshot: acceleratorSchema,
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
  .omit({ destinationFolder: true, screenshotFolder: true })
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
    screenshotFolder: true,
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
    bubbleCorner: true,
    bubbleSize: true,
    bubbleShape: true,
    keepSound: true,
    micVolume: true,
    backgroundId: true,
    backgroundPadding: true,
    backgroundCorners: true,
    backgroundShadow: true,
    micOn: true,
    frameRate: true,
    firstRunDone: true,
    showWelcome: true,
    countdownOn: true,
    shortcutRecord: true,
    shortcutStop: true,
    shortcutScreenshot: true,
  });

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  destinationFolder: null,
  screenshotFolder: null,
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
  bubbleCorner: 'bottom-right',
  bubbleSize: 'M',
  bubbleShape: 'circle',
  keepSound: true,
  micVolume: 'normal',
  backgroundId: 'deep-green',
  backgroundPadding: 'medium',
  backgroundCorners: 'soft',
  backgroundShadow: true,
  micOn: false,
  frameRate: 30,
  firstRunDone: false,
  showWelcome: true,
  countdownOn: true,
  shortcutRecord: DEFAULT_ACCELERATORS.record,
  shortcutStop: DEFAULT_ACCELERATORS.stop,
  shortcutScreenshot: DEFAULT_ACCELERATORS.screenshot,
});
