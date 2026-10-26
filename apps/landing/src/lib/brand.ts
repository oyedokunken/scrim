/**
 * Geometry of the approved Scrim mark, on a 32 by 32 grid. A green rounded square holding a
 * butter viewfinder (four corner brackets) and a butter center dot. The geometry never changes.
 * Colors are applied where the mark is drawn: CSS variables in components, literal hex in files
 * that cannot read CSS variables.
 */
export const MARK = {
  viewBox: '0 0 32 32',
  size: 32,
  cornerRadius: 8,
  brackets:
    'M9 13v-2a2 2 0 0 1 2-2h2M19 9h2a2 2 0 0 1 2 2v2M23 19v2a2 2 0 0 1-2 2h-2M13 23h-2a2 2 0 0 1-2-2v-2',
  bracketStrokeWidth: 2,
  dot: { cx: 16, cy: 16, r: 3.5 },
} as const;
