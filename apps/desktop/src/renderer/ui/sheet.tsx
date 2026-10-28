import { X } from 'lucide-react';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A native dialog, so focus trapping, Escape and focus return come with it. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A click on the backdrop lands on the dialog element itself, never on its content.
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className="ui-sheet"
      aria-label={title}
      onClose={onClose}
      onClick={onBackdrop}
    >
      <div className="ui-sheet-head">
        <h2 className="ui-section-title">{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
