import { MARK } from '@/lib/brand';

interface LogoMarkProps {
  size?: number;
  className?: string | undefined;
}

/**
 * The Scrim mark. It is green with butter brackets and dot on every background, so it takes its
 * colors from the two brand variables and never from the surrounding text color.
 */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={MARK.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width={MARK.size} height={MARK.size} rx={MARK.cornerRadius} fill="var(--scrim-green)" />
      <path
        d={MARK.brackets}
        fill="none"
        stroke="var(--scrim-butter)"
        strokeWidth={MARK.bracketStrokeWidth}
        strokeLinecap="round"
      />
      <circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r} fill="var(--scrim-butter)" />
    </svg>
  );
}

interface LogoProps {
  className?: string | undefined;
  markSize?: number;
}

/** The mark and the wordmark. The wordmark takes the color of the surrounding text. */
export function Logo({ className, markSize = 32 }: LogoProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}
    >
      <LogoMark size={markSize} />
      <span
        style={{
          fontWeight: 800,
          letterSpacing: '-0.04em',
          fontSize: `${(markSize * 0.75) / 16}rem`,
          lineHeight: 1,
        }}
      >
        Scrim
      </span>
    </span>
  );
}
