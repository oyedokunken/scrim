import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { About } from '../../../shared/about-contract';
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
 * The About card: app facts only. Machine details live in the "Your machine" card.
 */
export function AboutCard() {
  const [about, setAbout] = useState<About | null>(null);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('app:about').then(
      (value) => {
        if (alive) setAbout(value);
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
    </section>
  );
}
