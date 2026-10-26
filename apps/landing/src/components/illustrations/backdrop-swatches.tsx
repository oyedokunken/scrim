import { useId } from 'react';
import { Illustration, type IllustrationProps } from './illustration';

const SWATCH_X = [24, 116, 208] as const;

/** Three backdrops a recording can sit on: a gradient, a pattern and a picture. */
export function BackdropSwatchesIllustration(props: IllustrationProps) {
  const id = useId();
  return (
    <Illustration {...props}>
      <defs>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--scrim-green)" />
          <stop offset="1" stopColor="var(--scrim-black)" />
        </linearGradient>
        <pattern id={`${id}-dots`} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="1.6" fill="var(--scrim-green)" />
        </pattern>
      </defs>
      <rect x="24" y="28" width="88" height="144" rx="12" fill={`url(#${id}-fade)`} />
      <rect x="116" y="28" width="88" height="144" rx="12" fill="var(--scrim-green-tint)" />
      <rect x="116" y="28" width="88" height="144" rx="12" fill={`url(#${id}-dots)`} />
      <rect x="208" y="28" width="88" height="144" rx="12" fill="var(--scrim-fill-quiet)" />
      <path
        d="M208 142q22-34 44-8t44-22v48a12 12 0 0 1-12 12h-64a12 12 0 0 1-12-12Z"
        fill="var(--scrim-green)"
        opacity="0.55"
      />
      <circle cx="268" cy="54" r="9" fill="var(--scrim-butter)" />
      {SWATCH_X.map((x) => (
        <g key={x}>
          <rect
            x={x + 14}
            y={69}
            width="60"
            height="44"
            rx="8"
            fill="var(--scrim-black)"
            opacity="0.16"
          />
          <rect x={x + 14} y={64} width="60" height="44" rx="8" fill="var(--scrim-white)" />
          <rect
            x={x + 22}
            y={74}
            width="30"
            height="5"
            rx="2.5"
            fill="var(--scrim-border-on-white)"
          />
          <rect
            x={x + 22}
            y={86}
            width="42"
            height="5"
            rx="2.5"
            fill="var(--scrim-border-on-white)"
          />
        </g>
      ))}
    </Illustration>
  );
}
