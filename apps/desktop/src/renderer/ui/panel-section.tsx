import type { ReactNode } from 'react';

export interface PanelSectionProps {
  title: string;
  help?: string;
  /** A small decorative icon beside the title. */
  icon?: ReactNode;
  children: ReactNode;
}

export function PanelSection({ title, help, icon, children }: PanelSectionProps) {
  return (
    <section className="ui-section">
      <h2 className="ui-section-title">
        {icon}
        {title}
      </h2>
      {help ? <p className="ui-help">{help}</p> : null}
      {children}
    </section>
  );
}
