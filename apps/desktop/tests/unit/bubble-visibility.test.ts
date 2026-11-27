import { describe, expect, it } from 'vitest';
import { createBubbleVisibility } from '../../src/main/recording/bubble-visibility';

describe('createBubbleVisibility', () => {
  it('shows a fresh window when its page is ready', () => {
    const visibility = createBubbleVisibility();
    expect(visibility.showWhenReady(false)).toBe(true);
  });

  it('keeps a window hidden that was told to hide before its page was ready', () => {
    const visibility = createBubbleVisibility();
    visibility.want(false);
    expect(visibility.showWhenReady(false)).toBe(false);
  });

  it('shows the window again once it is asked to show', () => {
    const visibility = createBubbleVisibility();
    visibility.want(false);
    visibility.want(true);
    expect(visibility.showWhenReady(false)).toBe(true);
  });

  it('never shows a window whose camera is off', () => {
    const visibility = createBubbleVisibility();
    expect(visibility.showWhenReady(true)).toBe(false);
  });

  it('forgets an earlier hide when a new window opens', () => {
    const visibility = createBubbleVisibility();
    visibility.want(false);
    visibility.reset();
    expect(visibility.showWhenReady(false)).toBe(true);
  });
});
