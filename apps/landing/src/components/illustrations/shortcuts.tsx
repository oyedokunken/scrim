import { Illustration, type IllustrationProps } from './illustration';

const ROWS = [
  { y: 36, keys: ['Ctrl', 'Shift', 'R'], label: 'Start' },
  { y: 112, keys: ['Ctrl', 'Shift', 'S'], label: 'Stop and export' },
] as const;

const KEY_WIDTH = { Ctrl: 58, Shift: 66, R: 44, S: 44 } as const;

/** Keycaps for the two global shortcuts. */
export function ShortcutsIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <g fontFamily="var(--font-sans)">
        {ROWS.map((row) => {
          let x = 28;
          return (
            <g key={row.label}>
              {row.keys.map((key) => {
                const width = KEY_WIDTH[key];
                const left = x;
                x += width + 10;
                return (
                  <g key={key}>
                    <rect
                      x={left}
                      y={row.y + 4}
                      width={width}
                      height="40"
                      rx="9"
                      fill="var(--scrim-border-on-white)"
                    />
                    <rect
                      x={left}
                      y={row.y}
                      width={width}
                      height="40"
                      rx="9"
                      fill="var(--scrim-white)"
                      stroke="var(--scrim-border-on-white)"
                      strokeWidth="1.5"
                    />
                    <text
                      x={left + width / 2}
                      y={row.y + 26}
                      textAnchor="middle"
                      fontSize="15"
                      fontWeight="800"
                      fill="var(--scrim-black)"
                    >
                      {key}
                    </text>
                  </g>
                );
              })}
              <text
                x="28"
                y={row.y + 66}
                fontSize="13"
                fontWeight="700"
                fill="var(--scrim-text-secondary)"
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </g>
    </Illustration>
  );
}
