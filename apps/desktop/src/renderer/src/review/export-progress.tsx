import { useEffect, useRef } from 'react';

/** Whole percent from a 0 to 1 fraction. Anything outside the range is clamped, unknown is 0. */
export function toPercent(fraction: number | null): number {
  if (fraction === null || Number.isNaN(fraction)) return 0;
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

export interface ExportProgressProps {
  /** 0 to 1, or null while the speed is not known yet. */
  fraction: number | null;
  /** The accessible name, for example "Exporting". */
  label: string;
}

/**
 * A real bar for export progress, like the seek bar of the video player: a rounded track with a
 * green fill that grows from 0 to 100 percent, and the percentage inside it. The text is drawn twice,
 * black on the empty track and white on the green, and the white copy is clipped to the fill, so the
 * number stays readable on both.
 */
export function ExportProgress({ fraction, label }: ExportProgressProps) {
  const bar = useRef<HTMLSpanElement>(null);
  const percent = toPercent(fraction);
  useEffect(() => {
    bar.current?.style.setProperty('--fraction', String(percent / 100));
  }, [percent]);
  const text = `${String(percent)}%`;
  return (
    <span
      ref={bar}
      className={fraction === null ? 'export-bar waiting' : 'export-bar'}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(fraction === null ? {} : { 'aria-valuenow': percent })}
    >
      <span className="export-bar-text" aria-hidden="true">
        {text}
      </span>
      <span className="export-bar-fill" aria-hidden="true">
        <span className="export-bar-text on-fill">{text}</span>
      </span>
    </span>
  );
}
