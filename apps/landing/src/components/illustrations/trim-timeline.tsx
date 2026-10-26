import { Illustration, type IllustrationProps } from './illustration';

/** A timeline with trimmed ends and a section cut from the middle. */
export function TrimTimelineIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <rect
        x="24"
        y="40"
        width="272"
        height="64"
        rx="12"
        fill="var(--scrim-white)"
        stroke="var(--scrim-border-on-white)"
        strokeWidth="1.5"
      />
      <circle cx="160" cy="72" r="14" fill="var(--scrim-green)" />
      <path d="M155 66.5L166 72L155 77.5Z" fill="var(--scrim-butter)" />
      <rect
        x="24"
        y="116"
        width="272"
        height="44"
        rx="10"
        fill="var(--scrim-fill-quiet-on-white)"
      />
      <rect x="50" y="122" width="84" height="32" rx="6" fill="var(--scrim-green)" />
      <rect
        x="136"
        y="122"
        width="52"
        height="32"
        rx="6"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <rect x="190" y="122" width="76" height="32" rx="6" fill="var(--scrim-green)" />
      <rect x="44" y="114" width="10" height="48" rx="5" fill="var(--scrim-black)" />
      <rect x="262" y="114" width="10" height="48" rx="5" fill="var(--scrim-black)" />
      <path d="M162 108V170" stroke="var(--scrim-black)" strokeWidth="2" strokeLinecap="round" />
    </Illustration>
  );
}
