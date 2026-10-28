import { desktopCapturer, type DesktopCapturerSource, type Session } from 'electron';

/** What to record. A display by id, or a window by its capture source id. */
export type CaptureTarget =
  { kind: 'display'; displayId?: string | undefined } | { kind: 'window'; sourceId: string };

/** The fields of a capture source that choosing needs. */
export interface SourceLike {
  id: string;
  name: string;
  display_id: string;
}

/**
 * Picks the capture source for a target. A display matches on its id, and with no id, or an id
 * that is gone, falls back to the first screen, which is the primary display. A window must match
 * its source id exactly, because recording some other window by mistake would be worse than failing.
 */
export function chooseSource<T extends SourceLike>(
  sources: readonly T[],
  target: CaptureTarget,
): T | undefined {
  if (target.kind === 'window') return sources.find((source) => source.id === target.sourceId);
  const screens = sources.filter((source) => source.id.startsWith('screen:'));
  const byId =
    target.displayId === undefined
      ? undefined
      : screens.find((source) => source.display_id === target.displayId);
  return byId ?? screens[0];
}

/**
 * Makes `getDisplayMedia` in the recorder page return the chosen source with no picker. The
 * handler looks the source up when the page asks, so the id is fresh. With nothing chosen it
 * answers with no streams, and the page sees a normal capture error.
 */
export function installDisplayMediaHandler(
  ses: Session,
  currentTarget: () => CaptureTarget | undefined,
): void {
  ses.setDisplayMediaRequestHandler(
    (_request, callback) => {
      const target = currentTarget();
      if (target === undefined) {
        callback({});
        return;
      }
      desktopCapturer
        .getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources: DesktopCapturerSource[]) => {
          const source = chooseSource(sources, target);
          if (source === undefined) callback({});
          else callback({ video: source });
        })
        .catch(() => {
          callback({});
        });
    },
    { useSystemPicker: false },
  );
}
