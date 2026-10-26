import type { Configuration } from 'electron-builder';
import { afterPack } from './build/after-pack.ts';

const config: Configuration = {
  appId: 'app.scrim.desktop',
  productName: 'Scrim',
  directories: { buildResources: 'resources', output: 'release' },
  files: ['out/**', 'package.json'],
  asar: true,
  // The install folder comes from the package name, and the workspace name is scoped.
  extraMetadata: { name: 'scrim' },
  afterPack,
  win: { target: ['nsis'] },
  mac: { target: ['dmg'] },
  linux: { target: ['AppImage', 'deb'], category: 'AudioVideo' },
};

export default config;
