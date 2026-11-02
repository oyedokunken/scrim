import { FolderOpen, Laptop } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SystemInfo } from '../../../shared/about-contract';
import { Button, useShowError } from '../../ui';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The "Your machine" card. The computer's name and system are fetched when the card shows and are
 * kept in this component only. They are never sent anywhere and never logged.
 */
export function MachineCard() {
  const showError = useShowError();
  const [system, setSystem] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('system:info').then(
      (value) => {
        if (alive) setSystem(value);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const unknown = 'Not available';
  return (
    <section className="set-section" aria-label="Your machine">
      <h2 className="set-title">
        <Laptop size={18} strokeWidth={1.75} aria-hidden="true" />
        Your machine
      </h2>
      <dl className="set-facts">
        <Fact label="Computer name" value={system?.computerName ?? unknown} />
        <Fact label="Operating system" value={system?.operatingSystem ?? unknown} />
      </dl>
      <div>
        <Button
          icon={<FolderOpen size={16} strokeWidth={1.75} />}
          onClick={() => {
            void window.scrim.invoke('logs:open-folder').catch(() => {
              showError({
                title: 'Scrim could not open the logs folder',
                message: 'Try again.',
                code: 'logs-open-failed',
              });
            });
          }}
        >
          Open logs folder
        </Button>
      </div>
    </section>
  );
}
