import { useId } from 'react';
import { Button } from './button';

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Why the switch cannot be used, shown under the label and read out with it. */
  note?: string;
  /** Why the switch is disabled, shown on hover and keyboard focus. */
  disabledReason?: string | undefined;
}

export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  note,
  disabledReason,
}: SwitchProps) {
  const noteId = useId();
  return (
    <div className="ui-switch-row">
      <Button
        bare
        role="switch"
        aria-checked={checked}
        aria-describedby={note ? noteId : undefined}
        disabled={disabled}
        disabledReason={disabledReason ?? note}
        className={checked ? 'ui-switch on' : 'ui-switch'}
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="ui-switch-knob" aria-hidden="true" />
        <span className="ui-switch-label">{label}</span>
      </Button>
      {note ? (
        <p id={noteId} className="ui-help">
          {note}
        </p>
      ) : null}
    </div>
  );
}
