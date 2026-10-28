import { MARK, MARK_COLORS } from '@scrim/tokens';

/**
 * The Scrim mark, drawn inline from the brand svg's generated geometry. Inline keeps it working
 * under the packaged policy, which allows no inline styles: the size comes from the `1em`
 * attributes and a CSS class, never a style attribute. The name next to it is text, so the mark
 * is hidden from assistive technology.
 */
export function BrandMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARK.viewBox}
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      className="brand-mark"
    >
      <rect width={MARK.size} height={MARK.size} rx={MARK.cornerRadius} fill={MARK_COLORS.tile} />
      <path
        d={MARK.brackets}
        fill="none"
        stroke={MARK_COLORS.glyph}
        strokeWidth={MARK.bracketStrokeWidth}
        strokeLinecap="round"
      />
      <circle cx={MARK.dot.cx} cy={MARK.dot.cy} r={MARK.dot.r} fill={MARK_COLORS.glyph} />
    </svg>
  );
}
