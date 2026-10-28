import type { ReactNode } from 'react';

export interface PanelSectionProps {
  title: string;
  help?: string;
  children: ReactNode;
}

export function PanelSection({ title, help, children }: PanelSectionProps) {
  return (
    <section className="ui-section">
      <h2 className="ui-section-title">{title}</h2>
      {help ? <p className="ui-help">{help}</p> : null}
      {children}
    </section>
  );
}
