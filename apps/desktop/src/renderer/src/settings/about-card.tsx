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

const UNKNOWN = 'Not available';

/** The facts list. Separate from the card so it renders without the bridge. The signing line shows only for a signed build. */
export function AboutFacts({ about }: { about: About | null }) {
  return (
    <dl className="set-facts">
      <Fact label="App name" value={about?.name ?? UNKNOWN} />
      <Fact label="Version" value={about?.version ?? UNKNOWN} />
      <Fact label="License" value={about?.license ?? UNKNOWN} />
      <Fact
        label="Release date"
        value={about?.releaseDate == null ? UNKNOWN : formatDay(about.releaseDate)}
      />
      {about?.signedBy != null && <Fact label="Signed by" value={about.signedBy} />}
    </dl>
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
      <AboutFacts about={about} />
    </section>
  );
}
