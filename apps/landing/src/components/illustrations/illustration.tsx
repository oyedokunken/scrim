import { useId, type ReactNode } from 'react';

export interface IllustrationProps {
  /** Gives the illustration an accessible name. Without it the illustration is decorative. */
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Shared frame for every illustration: a 320 by 200 canvas. Decorative illustrations are hidden
 * from assistive technology. Informational ones expose a title and a description.
 */
export function Illustration({
  title,
  description,
  className,
  children,
}: IllustrationProps & { children: ReactNode }) {
  const id = useId();
  const labelled = title !== undefined;
  const labelIds = labelled
    ? description === undefined
      ? `${id}-title`
      : `${id}-title ${id}-desc`
    : undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 200"
      width="320"
      height="200"
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      aria-labelledby={labelIds}
      focusable="false"
      className={className}
    >
      {labelled ? <title id={`${id}-title`}>{title}</title> : null}
      {labelled && description !== undefined ? <desc id={`${id}-desc`}>{description}</desc> : null}
      {children}
    </svg>
  );
}

/** A mock application window, the stage most illustrations are drawn on. */
export function WindowFrame({
  x = 24,
  y = 18,
  width = 272,
  height = 164,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="12"
        fill="var(--scrim-white)"
        stroke="var(--scrim-border-on-white)"
        strokeWidth="1.5"
      />
      <path
        d={`M${x} ${y + 30}H${x + width}`}
        stroke="var(--scrim-border-on-white)"
        strokeWidth="1.5"
      />
      {[0, 1, 2].map((index) => (
        <circle
          key={index}
          cx={x + 18 + index * 14}
          cy={y + 15}
          r="4"
          fill="var(--scrim-border-on-white)"
        />
      ))}
    </g>
  );
}

/** A pointer arrow with its tip at (x, y). */
export function Pointer({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <path
      d="M0 0V19L5 14.5L8.5 22L12 20.5L8.5 13H15Z"
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="var(--scrim-black)"
      stroke="var(--scrim-white)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}
