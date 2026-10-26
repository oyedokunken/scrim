import { Illustration, WindowFrame, type IllustrationProps } from './illustration';

/** A wide view with a focus box, and the same area enlarged beside it. */
export function ZoomFrameIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <WindowFrame width={150} height={112} y={44} />
      <rect x="44" y="94" width="58" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect x="44" y="110" width="84" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect
        x="84"
        y="104"
        width="62"
        height="36"
        rx="6"
        fill="var(--scrim-green)"
        fillOpacity="0.1"
        stroke="var(--scrim-green)"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <path
        d="M152 122H184M176 114L184 122L176 130"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="192"
        y="62"
        width="108"
        height="76"
        rx="10"
        fill="var(--scrim-white)"
        stroke="var(--scrim-green)"
        strokeWidth="2"
      />
      <rect x="204" y="76" width="64" height="12" rx="6" fill="var(--scrim-border-on-white)" />
      <rect x="204" y="98" width="84" height="22" rx="11" fill="var(--scrim-green)" />
    </Illustration>
  );
}
