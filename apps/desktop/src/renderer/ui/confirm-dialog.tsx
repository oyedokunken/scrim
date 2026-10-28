import type { ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in plain words. Say what is kept as well as what is lost. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Marks the confirm button as the dangerous one. The safe button still has focus. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * For every action that cannot be undone: delete a recording or screenshot, discard a recording,
 * cancel an export, reset settings, overwrite a file. The safe button has focus when it opens, so
 * pressing Enter by habit never destroys anything.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} title={title} onClose={onCancel} className="ui-confirm">
      <div className="ui-confirm-body">{children}</div>
      <div className="ui-confirm-actions">
        <Button data-autofocus onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
