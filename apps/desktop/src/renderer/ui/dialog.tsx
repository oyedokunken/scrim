import { X } from 'lucide-react';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { Tooltip } from './tooltip';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** An extra class for the dialog, for a size or a layout. */
  className?: string;
}

/**
 * Every modal and sheet in the app. A native dialog, so focus trapping, Escape and focus return to
 * the opener come with it. It always has a title and a close button in the top right, and a click
 * on the backdrop closes it. A control marked `data-autofocus` takes focus when it opens.
 */
export function Dialog({ open, title, onClose, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The native close event is queued after dialog.close(). When the same dialog is opened again in
  // between, as a retry that fails again does, the late event must not close the new one.
  const onNativeClose = (): void => {
    if (ref.current?.open !== true) onClose();
  };

  // A click on the backdrop lands on the dialog element itself, never on its content.
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={className === undefined ? 'ui-sheet' : `ui-sheet ${className}`}
      aria-label={title}
      onClose={onNativeClose}
      onClick={onBackdrop}
    >
      <div className="ui-sheet-head">
        <h2 className="ui-section-title">{title}</h2>
        <Tooltip label="Close">
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      {children}
    </dialog>
  );
}
