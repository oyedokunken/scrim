import type { CursorValue } from './cursor-panel';

/** A looping demo: the cursor glides across a small window and clicks. All motion is CSS. */
export function CursorPreview({ value }: { value: CursorValue }) {
  return (
    <div className="demo-stage">
      <div
        className="cursor-demo"
        data-style={value.style}
        data-halo={value.haloColor}
        role="img"
        aria-label={`Preview of the cursor style ${value.style.replace('-', ' and ')}`}
      >
        <div className="demo-window">
          <div className="demo-bar" aria-hidden="true" />
          <div className="demo-body" aria-hidden="true">
            <span className="demo-line wide" />
            <span className="demo-line" />
            <span className="demo-button" />
          </div>
        </div>
        <div className="demo-cursor" aria-hidden="true">
          <span className="demo-ripple" />
          <span className="demo-ripple second" />
          <span className="demo-halo" />
          <svg viewBox="0 0 16 24" focusable="false" className="demo-arrow">
            <path d="M0 0v19l5-4.5L8.5 22 12 20.5 8.5 13H15z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
