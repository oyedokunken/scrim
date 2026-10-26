import { Illustration, Pointer, type IllustrationProps } from './illustration';

/** The same moment twice: the full screen on the left, the zoomed version on the right. */
export function BeforeAfterIllustration(props: IllustrationProps) {
  return (
    <Illustration {...props}>
      <g
        fontFamily="var(--font-sans)"
        fontSize="12"
        fontWeight="700"
        fill="var(--scrim-text-secondary)"
      >
        <text x="84" y="26" textAnchor="middle">
          Before
        </text>
        <text x="236" y="26" textAnchor="middle">
          After
        </text>
      </g>

      {/* Before: the whole window, with the point of interest small and easy to miss. */}
      <rect
        x="16"
        y="36"
        width="136"
        height="120"
        rx="10"
        fill="var(--scrim-white)"
        stroke="var(--scrim-border-on-white)"
        strokeWidth="1.5"
      />
      <path d="M16 54H152" stroke="var(--scrim-border-on-white)" strokeWidth="1.5" />
      {[0, 1, 2].map((index) => (
        <circle
          key={index}
          cx={28 + index * 10}
          cy="45"
          r="2.5"
          fill="var(--scrim-border-on-white)"
        />
      ))}
      <rect x="28" y="66" width="56" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="28" y="80" width="96" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="28" y="94" width="76" height="6" rx="3" fill="var(--scrim-border-on-white)" />
      <rect x="28" y="118" width="38" height="16" rx="8" fill="var(--scrim-green)" />
      <Pointer x={50} y={124} scale={0.7} />

      {/* After: the same window, zoomed in on the click. */}
      <rect
        x="168"
        y="36"
        width="136"
        height="120"
        rx="10"
        fill="var(--scrim-white)"
        stroke="var(--scrim-green)"
        strokeWidth="2"
      />
      <rect x="180" y="52" width="68" height="9" rx="4.5" fill="var(--scrim-border-on-white)" />
      <rect x="180" y="72" width="108" height="9" rx="4.5" fill="var(--scrim-border-on-white)" />
      <rect x="180" y="116" width="62" height="26" rx="13" fill="var(--scrim-green)" />
      <circle
        cx="228"
        cy="130"
        r="22"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="2.5"
        opacity="0.35"
      />
      <circle cx="228" cy="130" r="13" fill="var(--scrim-green)" opacity="0.18" />
      <Pointer x={224} y={124} scale={1.1} />

      <path
        d="M154 96H166M160 90L166 96L160 102"
        fill="none"
        stroke="var(--scrim-green)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Illustration>
  );
}
