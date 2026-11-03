/**
 * Capture through the system screen sharing portal (PipeWire), which is how a Wayland session
 * lets an app see the screen. Electron's documentation for desktopCapturer says that on Linux
 * with PipeWire `getSources` returns a single source, that PipeWire supports one capture for
 * both screens and windows, that asking for both types returns the chosen source as a window
 * capture, and that the request is denied when the person cancels the PipeWire picker. So the
 * portal shows its own picker when `getSources` runs, the person chooses once, and this module
 * keeps that one source (and the still picture that came with it) for the recording or the
 * screenshot that follows. It needs `WebRTCPipeWireCapturer` and the Ozone hint, set before the
 * app is ready (see platformSwitches). It is untested on a real Wayland session.
 */

/** The parts of a capture source this code touches, so a fake can stand in for Electron's. */
export interface PortalSource {
  id: string;
  name: string;
  display_id: string;
  thumbnail: {
    toPNG(): Uint8Array;
    getSize(): { width: number; height: number };
  };
}

export interface PortalCaptureDeps<S extends PortalSource> {
  getSources(options: {
    types: ('screen' | 'window')[];
    thumbnailSize: { width: number; height: number };
  }): Promise<S[]>;
  log: (message: string) => void;
}

/** The one source the person chose in the portal, with a still picture of it. */
export interface PickedSource<S extends PortalSource> {
  source: S;
  kind: 'screen' | 'window';
  /** A PNG of the source at the moment it was picked. */
  still: Uint8Array;
  /** The size of the still, in pixels. */
  width: number;
  height: number;
}

export interface PortalCapture<S extends PortalSource> {
  /**
   * Shows the portal picker and resolves with what the person chose, or undefined when they
   * cancelled or nothing came back. `maxSize` is the largest picture to ask for, in pixels.
   */
  pick(maxSize: { width: number; height: number }): Promise<PickedSource<S> | undefined>;
  /** The source chosen last, until it is released. */
  picked(): PickedSource<S> | undefined;
  /** Forgets the source, so the next capture asks the portal again. */
  release(): void;
}

export function createPortalCapture<S extends PortalSource>(
  deps: PortalCaptureDeps<S>,
): PortalCapture<S> {
  let current: PickedSource<S> | undefined;
  return {
    async pick(maxSize) {
      current = undefined;
      let sources: S[];
      try {
        sources = await deps.getSources({
          types: ['screen', 'window'],
          thumbnailSize: maxSize,
        });
      } catch (error) {
        // Cancelling the portal picker is a normal answer, so only the kind is logged.
        deps.log(`portal.pick failed ${error instanceof Error ? error.name : typeof error}`);
        return undefined;
      }
      const source = sources[0];
      if (source === undefined) return undefined;
      const size = source.thumbnail.getSize();
      current = {
        source,
        kind: source.id.startsWith('window:') ? 'window' : 'screen',
        still: source.thumbnail.toPNG(),
        width: size.width,
        height: size.height,
      };
      return current;
    },
    picked: () => current,
    release() {
      current = undefined;
    },
  };
}
