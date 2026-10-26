import { Illustration, Pointer, WindowFrame, type IllustrationProps } from './illustration';

/** A cursor with a soft halo around it, so the eye finds it at once. */
export function CursorHaloIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <WindowFrame />
      <rect x="48" y="62" width="110" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect x="48" y="80" width="150" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <rect x="48" y="150" width="90" height="8" rx="4" fill="var(--scrim-border-on-white)" />
      <circle cx="196" cy="116" r="36" fill="var(--scrim-green)" opacity="0.14" />
      <circle cx="196" cy="116" r="22" fill="var(--scrim-green)" opacity="0.22" />
      <Pointer x={190} y={108} scale={1.2} />
    </Illustration>
  );
}
