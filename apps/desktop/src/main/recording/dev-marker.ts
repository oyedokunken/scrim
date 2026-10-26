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
  const flip = (): void => {
    white = !white;
    log(`MARKER flip ${white ? 'white' : 'black'} at hr=${now().toFixed(1)}`);
    void window.webContents.executeJavaScript(
      `document.body.style.background='${white ? '#fff' : '#000'}'`,
    );
    timer = setTimeout(flip, gaps[step % gaps.length]);
    step += 1;
  };

  void window
    .loadURL('data:text/html,<body style="margin:0;background:%23000"></body>')
    .then(() => {
      window.showInactive();
      timer = setTimeout(flip, 500);
    });

  return () => {
    if (timer !== undefined) clearTimeout(timer);
    if (!window.isDestroyed()) window.destroy();
  };
}
