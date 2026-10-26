import { Illustration, Pointer, WindowFrame, type IllustrationProps } from './illustration';

/** Rings spreading from a click, each fainter than the last. */
export function ClickRipplesIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <WindowFrame />
      <rect x="48" y="62" width="120" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect x="48" y="150" width="100" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <circle
        cx="190"
        cy="112"
        r="52"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="2"
        opacity="0.18"
      />
      <circle
        cx="190"
        cy="112"
        r="38"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="2.5"
        opacity="0.4"
      />
      <circle
        cx="190"
        cy="112"
        r="24"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="3"
        opacity="0.75"
      />
      <circle cx="190" cy="112" r="6" fill="var(--scrim-green)" />
      <Pointer x={194} y={116} />
    </Illustration>
  );
}
