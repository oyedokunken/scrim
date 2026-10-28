import { clipboard, ClipboardItem, desktopCapturer, screen, type NativeImage } from 'electron';
import { realServiceFs } from './fs-adapter';
import {
  takeScreenshot,
  type ImageLike,
  type ScreenshotOptions,
  type ScreenshotResult,
  type ScreenshotSource,
} from './screenshot';
import type { Outcome } from './types';

function findDisplay(displayId: string | undefined): Electron.Display {
  const displays = screen.getAllDisplays();
  return displays.find((display) => String(display.id) === displayId) ?? screen.getPrimaryDisplay();
}

const asImage = (image: NativeImage | undefined): ImageLike | undefined => image;

/**
 * Takes a screenshot of a display, a region or a window, as a PNG saved to a folder and copied to
 * the clipboard. It runs in the main process, so no picture ever passes through a page.
 */
export function createScreenshotTaker(): (
  source: ScreenshotSource,
  options: ScreenshotOptions,
) => Promise<Outcome<ScreenshotResult>> {
  return (source, options) =>
    takeScreenshot(
      {
        fs: realServiceFs,
        async grabDisplay(displayId) {
          const display = findDisplay(displayId);
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
              width: Math.round(display.bounds.width * display.scaleFactor),
              height: Math.round(display.bounds.height * display.scaleFactor),
            },
          });
          const match =
            sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
          return asImage(match?.thumbnail);
        },
        async grabWindow(sourceId) {
          const sources = await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 3840, height: 2160 },
          });
          return asImage(sources.find((candidate) => candidate.id === sourceId)?.thumbnail);
        },
        displayGeometry(displayId) {
          const display = findDisplay(displayId);
          return {
            origin: { x: display.bounds.x, y: display.bounds.y },
            scaleFactor: display.scaleFactor,
          };
        },
        copyImage: (image) =>
          clipboard.write([
            new ClipboardItem({
              'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }),
            }),
          ]),
        now: () => new Date(),
        log: (message) => {
          console.error(message);
        },
      },
      source,
      options,
    );
}
