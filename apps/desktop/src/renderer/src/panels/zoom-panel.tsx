import { PanelSection, Segmented, Switch, Tile } from '../../ui';
import { ZOOM_HOLDS, ZOOM_MOTIONS, ZOOM_STRENGTHS, holdOf, motionOf, strengthOf } from './presets';

export interface ZoomValue {
  on: boolean;
  level: number;
  holdMs: number;
  smoothness: number;
}

export interface ZoomPanelProps {
  value: ZoomValue;
  onChange: (value: ZoomValue) => void;
}

/** A frame with an inner box: the smaller the box, the stronger the zoom. */
function StrengthArt({ level }: { level: number }) {
  const size = 80 / level;
  const x = 48 - size / 2;
  const y = 36 - (size * 0.62) / 2;
  return (
    <svg viewBox="0 0 96 64" focusable="false">
      <rect x="4" y="4" width="88" height="56" rx="6" className="art-window" />
      <path d="M4 14h88" className="art-line" />
      <rect x={x} y={y} width={size} height={size * 0.62} rx="3" className="art-zoombox" />
    </svg>
  );
}

/** Auto zoom switch, strength, hold and motion. No sliders. */
export function ZoomPanel({ value, onChange }: ZoomPanelProps) {
  const off = !value.on;
  return (
    <>
      <PanelSection
        title="Auto zoom"
        help="Zooms in where you click and follows your mouse, then eases back out."
      >
        <Switch
          label="Auto zoom"
          checked={value.on}
          onChange={(on) => {
            onChange({ ...value, on });
          }}
        />
      </PanelSection>
      <PanelSection title="Strength" help="How far it zooms in.">
        <div className="tile-row">
          {ZOOM_STRENGTHS.map((option) => (
            <Tile
              key={option.id}
              label={`${option.label} ${String(option.level)}x`}
              disabled={off}
              selected={strengthOf(value.level) === option.id}
              onSelect={() => {
                onChange({ ...value, level: option.level });
              }}
            >
              <StrengthArt level={option.level} />
            </Tile>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="Hold after a click" help="How long it stays zoomed in.">
        <Segmented
          label="Hold after a click"
          options={ZOOM_HOLDS.map((o) => ({ value: o.value, label: o.label, disabled: off }))}
          value={holdOf(value.holdMs)}
          onChange={(hold) => {
            const ms = ZOOM_HOLDS.find((o) => o.value === hold)?.ms ?? value.holdMs;
            onChange({ ...value, holdMs: ms });
          }}
        />
      </PanelSection>
      <PanelSection title="Motion" help="How quickly it moves in and out.">
        <Segmented
          label="Motion"
          options={ZOOM_MOTIONS.map((o) => ({ value: o.value, label: o.label, disabled: off }))}
          value={motionOf(value.smoothness)}
          onChange={(motion) => {
            const smoothness =
              ZOOM_MOTIONS.find((o) => o.value === motion)?.smoothness ?? value.smoothness;
            onChange({ ...value, smoothness });
          }}
        />
      </PanelSection>
    </>
  );
}
