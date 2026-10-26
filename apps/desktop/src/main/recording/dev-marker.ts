import { createAppWindow } from '../windows/create-window';

/**
 * A development tool for checking that the video lines up with the recording clock. It opens a
 * small always on top square in the top left corner of the primary display and flips it between
 * black and white, logging the main clock time of every flip. The recorded video shows the flips,
 * so the frame where each one appears can be compared with when it was logged. It exists only
 * when SCRIM_DEV_MARKER=1 in a development run.
 */
export function startMarker(now: () => number, log: (message: string) => void): () => void {
  const window = createAppWindow(
    {
      show: false,
      x: 0,
      y: 0,
      width: 96,
      height: 96,
      frame: false,
      resizable: false,
      focusable: false,
      alwaysOnTop: true,
      webPreferences: { backgroundThrottling: false },
    },
    'helper',
  );
  window.setAlwaysOnTop(true, 'screen-saver');
  let white = false;
  let timer: NodeJS.Timeout | undefined;

  // The gaps between flips differ on purpose, so a flip in the video can only be matched to one
  // flip in the log. A steady beat would match equally well one beat early or late.
  const gaps = [600, 900, 1300, 750, 1100, 1500, 700, 1200];
  let step = 0;
  // The log time is when the page began the frame that shows the new color, not when the command was
  // sent. Sending is a few tens of milliseconds ahead of the screen and varies, and the video can
  // only show a flip once it is drawn. The page reports its own clock as an epoch time, and the
  // main process turns that into its steady clock with the pair of readings taken just after.
  const flip = async (): Promise<void> => {
    white = !white;
    const color = white ? '#fff' : '#000';
    const drawnAtEpoch: unknown = await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        document.body.style.background = '${color}';
        requestAnimationFrame(() => resolve(performance.timeOrigin + performance.now()));
      })`,
    );
    const toSteady = now() - Date.now();
    if (typeof drawnAtEpoch === 'number') {
      log(`MARKER flip ${white ? 'white' : 'black'} at hr=${(drawnAtEpoch + toSteady).toFixed(1)}`);
    }
    timer = setTimeout(
      () => {
        void flip();
      },
      gaps[step % gaps.length],
    );
    step += 1;
  };

  void window
    .loadURL('data:text/html,<body style="margin:0;background:%23000"></body>')
    .then(() => {
      window.showInactive();
      timer = setTimeout(() => {
        void flip();
      }, 500);
    });

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    if (!window.isDestroyed()) window.destroy();
  };
}
