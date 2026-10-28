import { useEffect, useRef, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A native dialog, so focus trapping, Escape and the backdrop come with it. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="ui-sheet" aria-label={title} onClose={onClose}>
      <h2 className="ui-section-title">{title}</h2>
      {children}
    </dialog>
  );
}
