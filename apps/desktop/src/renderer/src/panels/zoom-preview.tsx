import { holdOf, motionOf, strengthOf } from './presets';
import type { ZoomValue } from './zoom-panel';

/** A looping demo of a click, the frame zooming in, following, and easing back out. */
export function ZoomPreview({ value }: { value: ZoomValue }) {
  const strength = strengthOf(value.level);
  return (
    <div className="demo-stage">
      <div
        className="zoom-demo"
        data-on={value.on ? 'true' : 'false'}
        data-strength={strength}
        data-hold={holdOf(value.holdMs)}
        data-motion={motionOf(value.smoothness)}
        role="img"
        aria-label={
          value.on ? `Preview of auto zoom, ${strength} strength` : 'Preview with auto zoom off'
        }
      >
        <div className="zoom-scene" aria-hidden="true">
          <div className="demo-window">
            <div className="demo-bar" />
            <div className="demo-body">
              <span className="demo-line wide" />
              <span className="demo-line" />
              <span className="demo-line" />
              <span className="demo-button" />
            </div>
          </div>
          <div className="demo-cursor zoom-cursor">
            <span className="demo-ripple" />
            <span className="demo-halo" />
            <svg viewBox="0 0 16 24" focusable="false" className="demo-arrow">
              <path d="M0 0v19l5-4.5L8.5 22 12 20.5 8.5 13H15z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
