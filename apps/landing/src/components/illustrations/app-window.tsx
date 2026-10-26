import { Illustration, Pointer, WindowFrame, type IllustrationProps } from './illustration';

/** A mock application window with a sidebar, content and a button. */
export function AppWindowIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <WindowFrame />
      <rect x="24" y="48" width="64" height="134" fill="var(--scrim-fill-quiet-on-white)" />
      <path d="M24 170a12 12 0 0 0 12 12h40V170Z" fill="var(--scrim-fill-quiet-on-white)" />
      <rect x="40" y="62" width="32" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="40" y="78" width="40" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="40" y="94" width="28" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="108" y="62" width="120" height="10" rx="5" fill="var(--scrim-black)" />
      <rect x="108" y="84" width="170" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="108" y="98" width="150" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="108" y="130" width="74" height="28" rx="14" fill="var(--scrim-green)" />
      <Pointer x={160} y={142} />
    </Illustration>
  );
}
