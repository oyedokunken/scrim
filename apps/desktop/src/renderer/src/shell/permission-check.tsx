import { Camera, Mic } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui';
import { probeDevice, probeMessage, type DeviceKind, type ProbeResult } from './device-probe';

type Row = ProbeResult | 'idle' | 'checking';

export interface PermissionCheckProps {
  /** Runs one check. Replaced in tests. */
  probe?: (kind: DeviceKind) => Promise<ProbeResult>;
  onDone: () => void;
  /** Starting states, for tests that render a static page. */
  initial?: Partial<Record<DeviceKind, Row>>;
}

const ROWS: { kind: DeviceKind; title: string; hint: string }[] = [
  { kind: 'camera', title: 'Camera', hint: 'For the face bubble. Optional.' },
  { kind: 'mic', title: 'Microphone', hint: 'To record your voice. Optional.' },
];

function rowText(kind: DeviceKind, hint: string, state: Row): string {
  if (state === 'idle') return hint;
  if (state === 'checking') return 'Checking...';
  return probeMessage(kind, state);
}

/** The last step of the first launch. Both devices are optional, so there is always a way on. */
export function PermissionCheck({ probe = probeDevice, onDone, initial }: PermissionCheckProps) {
  const [rows, setRows] = useState<Record<DeviceKind, Row>>({
    camera: initial?.camera ?? 'idle',
    mic: initial?.mic ?? 'idle',
  });

  const check = async (kind: DeviceKind): Promise<void> => {
    setRows((current) => ({ ...current, [kind]: 'checking' }));
    const result = await probe(kind);
    setRows((current) => ({ ...current, [kind]: result }));
  };

  return (
    <main className="first-run">
      <h1 className="first-run-title">Check your camera and microphone</h1>
      <p className="ui-help">
        Scrim records your screen without either. Check them now if you plan to use them. Nothing is
        recorded while checking.
      </p>
      <ul className="first-run-list">
        {ROWS.map(({ kind, title, hint }) => {
          const state = rows[kind];
          const Icon = kind === 'camera' ? Camera : Mic;
          return (
            <li key={kind} className="first-run-row">
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <div className="first-run-text">
                <h2 className="ui-section-title">{title}</h2>
                <p className="ui-help" role="status">
                  {rowText(kind, hint, state)}
                </p>
              </div>
              <Button
                disabled={state === 'checking'}
                onClick={() => {
                  void check(kind);
                }}
              >
                {state === 'idle' ? 'Check' : 'Check again'}
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="first-run-actions">
        <Button variant="primary" onClick={onDone}>
          Continue
        </Button>
      </div>
    </main>
  );
}
