import { PanelSection, Segmented, Tile } from '../../ui';
import {
  CURSOR_STYLE_OPTIONS,
  HALO_COLOR_OPTIONS,
  type CursorStyleId,
  type HaloColorId,
} from './presets';

export interface CursorValue {
  style: CursorStyleId;
  haloColor: HaloColorId;
}

export interface CursorPanelProps {
  value: CursorValue;
  onChange: (value: CursorValue) => void;
}

/** A small window with the cursor drawn in one style. Pure SVG, so it needs no inline styles. */
function CursorArt({ style }: { style: CursorStyleId }) {
  const halo = style === 'halo-ripples' || style === 'halo';
  const ripples = style === 'halo-ripples' || style === 'ripples';
  return (
    <svg viewBox="0 0 96 64" focusable="false">
      <rect x="4" y="4" width="88" height="56" rx="6" className="art-window" />
      <path d="M4 14h88" className="art-line" />
      {ripples ? (
        <>
          <circle cx="52" cy="38" r="17" className="art-ripple" />
          <circle cx="52" cy="38" r="11" className="art-ripple" />
        </>
      ) : null}
      {halo ? <circle cx="52" cy="38" r="8" className="art-halo" /> : null}
      <path d="M50 32v14l3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5h5z" className="art-cursor" />
    </svg>
  );
}

/** Cursor style and halo color. Used on the Cursor page and, with an open recording, the editor. */
export function CursorPanel({ value, onChange }: CursorPanelProps) {
  return (
    <>
      <PanelSection title="Cursor style" help="How the mouse shows in the finished video.">
        <div className="tile-grid">
          {CURSOR_STYLE_OPTIONS.map((option) => (
            <Tile
              key={option.value}
              label={option.label}
              selected={value.style === option.value}
              onSelect={() => {
                onChange({ ...value, style: option.value });
              }}
            >
              <CursorArt style={option.value} />
            </Tile>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Halo color" help="The ring around the cursor and the click ripples.">
        <Segmented
          label="Halo color"
          options={HALO_COLOR_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            swatch: option.swatch,
          }))}
          value={value.haloColor}
          onChange={(haloColor) => {
            onChange({ ...value, haloColor });
          }}
        />
      </PanelSection>
    </>
  );
}
