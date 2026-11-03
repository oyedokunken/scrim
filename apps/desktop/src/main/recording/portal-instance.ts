import { desktopCapturer, type DesktopCapturerSource } from 'electron';
import { createPortalCapture, type PortalCapture } from './portal-capture';

let instance: PortalCapture<DesktopCapturerSource> | undefined;

/** The one portal capture of this process. Only a Wayland session ever calls `pick` on it. */
export function portalCapture(): PortalCapture<DesktopCapturerSource> {
  instance ??= createPortalCapture<DesktopCapturerSource>({
    getSources: (options) => desktopCapturer.getSources(options),
    log: (message) => {
      console.error(message);
    },
  });
  return instance;
}
