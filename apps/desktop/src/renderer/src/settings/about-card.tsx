import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { About, SystemInfo } from '../../../shared/about-contract';
import { formatDay } from '../format';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The About card. The computer's name and system are fetched when the card shows and are kept in
 * this component only. They are never sent anywhere and never logged. The release date is the day
 * the installed version was built, which a packaged file's own timestamp cannot tell.
 */
export function AboutCard() {
  const [about, setAbout] = useState<About | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('app:about').then(
      (value) => {
        if (alive) setAbout(value);
      },
      () => undefined,
    );
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
    <section className="set-section" aria-label="About">
      <h2 className="set-title">
        <Info size={18} strokeWidth={1.75} aria-hidden="true" />
        About
      </h2>
      <p className="set-about">
        Scrim is a free, open source screen recorder and screenshot tool for Windows, macOS and
        Linux.
      </p>
      <dl className="set-facts">
        <Fact label="App name" value={about?.name ?? unknown} />
        <Fact label="Version" value={about?.version ?? unknown} />
        <Fact label="License" value={about?.license ?? unknown} />
        <Fact
          label="Release date"
          value={about?.releaseDate == null ? unknown : formatDay(about.releaseDate)}
        />
      </dl>

      <h3 className="set-subtitle">Your computer</h3>
      <dl className="set-facts">
        <Fact label="Computer name" value={system?.computerName ?? unknown} />
        <Fact label="Operating system" value={system?.operatingSystem ?? unknown} />
      </dl>
    </section>
  );
}
