import { Illustration, type IllustrationProps } from './illustration';

/** A finished export: a file card, its format, and a full progress bar. */
export function ExportCardIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <rect
        x="40"
        y="30"
        width="240"
        height="140"
        rx="16"
        fill="var(--scrim-white)"
        stroke="var(--scrim-border-on-white)"
        strokeWidth="1.5"
      />
      <rect x="62" y="52" width="48" height="60" rx="8" fill="var(--scrim-green)" />
      <path d="M78 70L96 82L78 94Z" fill="var(--scrim-butter)" />
      <rect x="126" y="56" width="110" height="10" rx="5" fill="var(--scrim-black)" />
      <rect x="126" y="76" width="78" height="7" rx="3.5" fill="var(--scrim-border-on-white)" />
      <rect x="126" y="92" width="52" height="16" rx="8" fill="var(--scrim-green-tint)" />
      <rect x="62" y="132" width="196" height="10" rx="5" fill="var(--scrim-green)" />
      <circle cx="258" cy="48" r="12" fill="var(--scrim-green)" />
      <path
        d="M252 48l4 4 7-8"
        fill="none"
        stroke="var(--scrim-butter)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Illustration>
  );
}
