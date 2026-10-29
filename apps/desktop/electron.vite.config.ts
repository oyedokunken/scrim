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

/**
 * The recorder, region, pill and bubble pages sit in the renderer folder but load their scripts
 * from `src/recorder`, one folder up. A build resolves that from the html file. The dev server
 * resolves a script URL from its root, so `/recorder/...` was not found and those pages stayed
 * blank, which showed as the area chooser failing to open. This sends those URLs to the files.
 */
function recorderPagesInDev(): Plugin {
  return {
    name: 'scrim-recorder-pages-dev',
    apply: 'serve',
    configureServer(server) {
      // A file URL's path is already forward slashed, such as /C:/work/scrim/src/recorder/.
      const folder = new URL('./src/recorder/', import.meta.url).pathname;
      server.middlewares.use((request, _response, next) => {
        if (request.url?.startsWith('/recorder/') === true) {
          request.url = `/@fs${folder}${request.url.slice('/recorder/'.length)}`;
        }
        next();
      });
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
          bubble: here('./src/recorder/bubble/preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react(), cspMeta(), recorderPagesInDev()],
    build: {
      rollupOptions: {
        // The app window, and the hidden recorder page that captures the screen.
        input: {
          index: here('./src/renderer/index.html'),
          recorder: here('./src/renderer/recorder.html'),
          region: here('./src/renderer/region.html'),
          pill: here('./src/renderer/pill.html'),
          bubble: here('./src/renderer/bubble.html'),
        },
      },
    },
  },
});
