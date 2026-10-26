import { Illustration, WindowFrame, type IllustrationProps } from './illustration';

/** A round camera bubble sitting in the corner of a recording. */
export function FaceBubbleIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <WindowFrame />
      <rect x="48" y="62" width="130" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect x="48" y="80" width="96" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect x="48" y="98" width="116" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <circle cx="240" cy="136" r="38" fill="var(--scrim-white)" />
      <circle cx="240" cy="136" r="34" fill="var(--scrim-green)" />
      <circle cx="240" cy="127" r="11" fill="var(--scrim-butter)" />
      <path d="M219 164a21 17 0 0 1 42 0Z" fill="var(--scrim-butter)" />
      <circle
        cx="240"
        cy="136"
        r="38"
        fill="none"
        stroke="var(--scrim-border-on-white)"
        strokeWidth="1.5"
      />
    </Illustration>
  );
}
