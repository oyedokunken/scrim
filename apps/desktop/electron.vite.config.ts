import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import { buildCsp } from './src/main/csp';

/** Writes the meta tag from the same builder as the header, so the two cannot drift. */
function cspMeta(): Plugin {
  let packaged = true;
  return {
    name: 'scrim-csp-meta',
    configResolved(config) {
      packaged = config.command === 'build';
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: buildCsp({ packaged, forMeta: true }),
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        // The app window preload, and the one for the hidden recorder window.
        input: {
          index: here('./src/preload/index.ts'),
          recorder: here('./src/recorder/preload/index.ts'),
          region: here('./src/recorder/region/preload/index.ts'),
          pill: here('./src/recorder/pill/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), cspMeta()],
    build: {
      rollupOptions: {
        // The app window, and the hidden recorder page that captures the screen.
        input: {
          index: here('./src/renderer/index.html'),
          recorder: here('./src/renderer/recorder.html'),
          region: here('./src/renderer/region.html'),
          pill: here('./src/renderer/pill.html'),
        },
      },
    },
  },
});
