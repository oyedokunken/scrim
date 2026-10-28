import type { Configuration } from 'electron-builder';
import { APP_ID, APP_NAME } from './src/shared/app-id.ts';
import { afterPack } from './build/after-pack.ts';

const config: Configuration = {
  appId: APP_ID,
  productName: APP_NAME,
  directories: { buildResources: 'resources', output: 'release' },
  files: ['out/**', 'package.json', 'resources/icons/**'],
  asar: true,
  // The one native module is a prebuilt binary, so a rebuild step would only fail on a missing toolchain.
  npmRebuild: false,
  // FFmpeg sits beside the app, not inside the archive, because it is run as a program.
  extraResources: [{ from: 'resources/ffmpeg', to: 'ffmpeg' }],
  // Native modules cannot load from inside the asar archive.
  asarUnpack: ['node_modules/uiohook-napi/**'],
  // The install folder comes from the package name, and the workspace name is scoped.
  extraMetadata: { name: 'scrim' },
  afterPack,
  win: { target: ['nsis'], icon: 'resources/icons/icon.ico' },
  nsis: {
    installerIcon: 'resources/icons/icon.ico',
    uninstallerIcon: 'resources/icons/icon.ico',
    installerHeaderIcon: 'resources/icons/icon.ico',
    shortcutName: APP_NAME,
  },
  mac: { target: ['dmg'], icon: 'resources/icons/icon.icns' },
  linux: { target: ['AppImage', 'deb'], category: 'AudioVideo', icon: 'resources/icons/linux' },
};

export default config;
