import react from '@vitejs/plugin-react';
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

export default defineConfig({
  main: {},
  preload: {},
  renderer: { plugins: [react(), cspMeta()] },
});
