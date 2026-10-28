import { useId } from 'react';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Why the switch cannot be used, shown under the label and read out with it. */
  note?: string;
}

export function Switch({ label, checked, onChange, disabled = false, note }: SwitchProps) {
  const noteId = useId();
  return (
    <div className="ui-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={note ? noteId : undefined}
        disabled={disabled}
        className={checked ? 'ui-switch on' : 'ui-switch'}
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="ui-switch-knob" aria-hidden="true" />
        <span className="ui-switch-label">{label}</span>
      </button>
      {note ? (
        <p id={noteId} className="ui-help">
          {note}
        </p>
      ) : null}
    </div>
  );
}
