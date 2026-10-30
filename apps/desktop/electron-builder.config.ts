import type { Configuration } from 'electron-builder';
import { APP_ID, APP_NAME } from './src/shared/app-id.ts';
import { afterPack } from './build/after-pack.ts';
import { windowsSigningConfig } from './build/signing.mts';

// A cross build can point this at another folder of FFmpeg binaries. Unset, it is the folder the
// Windows build has always used.
const FFMPEG_DIR = process.env['SCRIM_FFMPEG_DIR'] ?? 'resources/ffmpeg';

// Notarization needs an Apple Developer account. It is switched on only when all three secrets
// exist, so a build without them still produces an unsigned, unnotarized disk image.
const notarize = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'].every(
  (name) => (process.env[name] ?? '') !== '',
);

const config: Configuration = {
  appId: APP_ID,
  productName: APP_NAME,
  directories: { buildResources: 'resources', output: 'release' },
  files: ['out/**', 'package.json', 'resources/icons/**'],
  asar: true,
  // The one native module is a prebuilt binary, so a rebuild step would only fail on a missing toolchain.
  npmRebuild: false,
  // FFmpeg sits beside the app, not inside the archive, because it is run as a program.
  extraResources: [{ from: FFMPEG_DIR, to: 'ffmpeg' }],
  // Native modules cannot load from inside the asar archive.
  asarUnpack: ['node_modules/uiohook-napi/**'],
  // The install folder comes from the package name, and the workspace name is scoped.
  extraMetadata: { name: 'scrim' },
  afterPack,
  // Signing turns on only when its secrets exist. See docs/code-signing.md.
  win: {
    target: ['nsis'],
    icon: 'resources/icons/icon.ico',
    ...windowsSigningConfig(process.env),
  },
  nsis: {
    installerIcon: 'resources/icons/icon.ico',
    uninstallerIcon: 'resources/icons/icon.ico',
    installerHeaderIcon: 'resources/icons/icon.ico',
    shortcutName: APP_NAME,
  },
  // One architecture per build (pass --arm64 or --x64), because the bundled FFmpeg is per architecture.
  mac: {
    target: ['dmg'],
    icon: 'resources/icons/icon.icns',
    category: 'public.app-category.video',
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    notarize,
    // Screen Recording and Accessibility are runtime permissions with no Info.plist key. The
    // camera and microphone keys are required, or macOS ends the app when it asks for them.
    extendInfo: {
      NSCameraUsageDescription: 'Scrim shows your camera in a bubble on the recording.',
      NSMicrophoneUsageDescription:
        'Scrim records your voice with the screen when you turn the microphone on.',
    },
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'AudioVideo',
    icon: 'resources/icons/linux',
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
    maintainer: 'Oyedokun Kehinde <oyedokunken@users.noreply.github.com>',
    synopsis: 'Free screen recorder with cursor effects and auto zoom',
    desktop: { entry: { StartupWMClass: 'Scrim', Keywords: 'screen;recorder;screencast;' } },
  },
};

export default config;
