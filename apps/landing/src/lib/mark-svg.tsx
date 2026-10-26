import { MARK } from './brand';

// Literal values, for image routes and icons that cannot read CSS variables.
const MARK_GREEN = '#004E52';
const MARK_BUTTER = '#FBF8F4';

interface MarkSvgProps {
  size: number;
  /** A full bleed square for maskable icons, which the operating system crops itself. */
  fullBleed?: boolean;
}

/** The Scrim mark with literal colors. The brackets and dot are always butter. */
export function MarkSvg({ size, fullBleed = false }: MarkSvgProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={MARK.viewBox}>
      <rect
        width={MARK.size}
        height={MARK.size}
        rx={fullBleed ? 0 : MARK.cornerRadius}
        fill={MARK_GREEN}
      />
      <path
        d={MARK.brackets}
        fill="none"
        stroke={MARK_BUTTER}
        strokeWidth={MARK.bracketStrokeWidth}
        strokeLinecap="round"
      />
      <circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r} fill={MARK_BUTTER} />
    </svg>
  );
}
