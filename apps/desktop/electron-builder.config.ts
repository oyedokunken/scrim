import type { Configuration } from 'electron-builder';

const config: Configuration = {
  appId: 'app.scrim.desktop',
  productName: 'Scrim',
  directories: { buildResources: 'resources', output: 'release' },
  files: ['out/**'],
  asar: true,
  win: { target: ['nsis'] },
  mac: { target: ['dmg'] },
  linux: { target: ['AppImage', 'deb'], category: 'AudioVideo' },
};

export default config;
