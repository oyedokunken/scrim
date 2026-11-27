/**
 * Whether the bubble window should be on screen, kept apart from the window itself. A hide that is
 * asked for before the page is ready has to still hold when the window finishes loading, or the
 * window appears in the recording on systems that cannot leave it out of the capture.
 */
export interface BubbleVisibility {
  /** A new window starts out wanted. */
  reset: () => void;
  /** What the controller asked for last. */
  want: (visible: boolean) => void;
  /** True when the window may be shown now that its page is ready. */
  showWhenReady: (cameraOff: boolean) => boolean;
}

export function createBubbleVisibility(): BubbleVisibility {
  let wanted = true;
  return {
    reset: () => {
      wanted = true;
    },
    want: (visible) => {
      wanted = visible;
    },
    showWhenReady: (cameraOff) => wanted && !cameraOff,
  };
}
