export interface KeycapsProps {
  /** One key per entry, for example ['Ctrl', 'Shift', 'R']. */
  keys: readonly string[];
}

export function Keycaps({ keys }: KeycapsProps) {
  return (
    <span className="ui-keycaps" role="img" aria-label={keys.join(' ')}>
      {keys.map((key) => (
        <kbd key={key} className="ui-keycap">
          {key}
        </kbd>
      ))}
    </span>
  );
}
