import type { ReactNode } from 'react';
import { Keycaps } from '../../ui';

export interface StageProps {
  icon: ReactNode;
  label: string;
  /** The line under the icon. */
  text: string;
  /** The view's one big action, centered under the text. */
  action: ReactNode;
  /** The shortcut for that action, shown small in the top right corner. */
  shortcut: readonly string[];
}

/** The big box of a view: what will happen, the button that does it, and its shortcut in the corner. */
export function Stage({ icon, label, text, action, shortcut }: StageProps) {
  return (
    <section className="stage" aria-label={label}>
      <div className="stage-shortcut">
        <span>Shortcut</span>
        <Keycaps keys={shortcut} />
      </div>
      <span className="stage-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="stage-text">{text}</p>
      {action}
    </section>
  );
}
