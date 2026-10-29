import { useEffect, useState } from 'react';
import { Button, Keycaps } from '../../ui';
import {
  acceleratorFromKeyPress,
  DEFAULT_ACCELERATORS,
  findShortcutConflict,
  keysOfAccelerator,
  SHORTCUT_LABELS,
  type ShortcutId,
} from '../../../shared/shortcut-keys';

export interface ShortcutRowProps {
  id: ShortcutId;
  /** Every shortcut as saved, to find a key that is already taken. */
  all: Readonly<Record<ShortcutId, string>>;
  /** Another program already owns this key, so it does nothing until it is changed. */
  unavailable: boolean;
  onChange: (accelerator: string) => void;
  /** Called with true while a key is being chosen, so the global shortcuts let go and pressing the old keys does not run them. */
  onCapturing: (capturing: boolean) => void;
}

/**
 * One shortcut: its keys, a Change button that listens for the next combination, and Reset. A key
 * that another shortcut uses is refused with the name of that shortcut, and Escape gives up.
 */
export function ShortcutRow({ id, all, unavailable, onChange, onCapturing }: ShortcutRowProps) {
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState('');
  const current = all[id];

  useEffect(() => {
    if (!capturing) return undefined;
    onCapturing(true);
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(false);
        setMessage('');
        return;
      }
      const accelerator = acceleratorFromKeyPress(event);
      if (accelerator === null) {
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
          setMessage('Hold Ctrl or Alt and press a letter, a number or a function key.');
        }
        return;
      }
      const clash = findShortcutConflict(id, accelerator, all);
      if (clash !== null) {
        setMessage(`Those keys already ${SHORTCUT_LABELS[clash].toLowerCase()}. Try others.`);
        return;
      }
      setCapturing(false);
      setMessage('');
      onChange(accelerator);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      onCapturing(false);
    };
    // The listener reads the latest values each time it is set up, which happens when capturing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const isDefault = current === DEFAULT_ACCELERATORS[id];
  const reset = (): void => {
    const clash = findShortcutConflict(id, DEFAULT_ACCELERATORS[id], all);
    if (clash !== null) {
      setMessage(
        `The default keys are in use for ${SHORTCUT_LABELS[clash].toLowerCase()}. Change that first.`,
      );
      return;
    }
    setMessage('');
    onChange(DEFAULT_ACCELERATORS[id]);
  };

  return (
    <div className="set-row">
      <div className="set-row-text">
        <span className="set-row-label">{SHORTCUT_LABELS[id]}</span>
        {message === '' ? null : (
          <span className="set-row-note" role="alert">
            {message}
          </span>
        )}
        {unavailable && message === '' ? (
          <span className="set-row-note" role="status">
            Another program is using these keys. Pick different ones.
          </span>
        ) : null}
      </div>
      <div className="set-row-control">
        {capturing ? (
          <span className="set-capture" role="status">
            Press the new keys
          </span>
        ) : (
          <Keycaps keys={keysOfAccelerator(current)} />
        )}
        <Button
          aria-label={`Change ${SHORTCUT_LABELS[id].toLowerCase()} shortcut`}
          onClick={() => {
            setMessage('');
            setCapturing((value) => !value);
          }}
        >
          {capturing ? 'Cancel' : 'Change'}
        </Button>
        <Button
          aria-label={`Reset ${SHORTCUT_LABELS[id].toLowerCase()} shortcut`}
          disabled={isDefault || capturing}
          onClick={reset}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
