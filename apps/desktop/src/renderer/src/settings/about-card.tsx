import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { About, SystemInfo } from '../../../shared/about-contract';
import { Button } from '../../ui';
import { formatDay, formatMoment } from '../format';
import { GITHUB, Glyph } from '../shell/brand-glyphs';
import { BuiltBy } from '../shell/built-by';

const SOURCE_URL = 'https://github.com/oyedokunken/scrim';
const FFMPEG_NOTES_URL =
  'https://github.com/oyedokunken/scrim/blob/main/docs/adr/0007-ffmpeg-bundling.md';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** What the About card needs from the outside, so a test can hand it plain values. */
export interface AboutCardProps {
  onOpenLink: (url: string) => void;
}

/**
 * The About card. The computer's name and system are fetched when the card shows and are kept in
 * this component only. They are never sent anywhere and never logged.
 */
export function AboutCard({ onOpenLink }: AboutCardProps) {
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
      <h2 className="set-title">About</h2>
      <p className="set-about">
        A free, open source screen recorder and screenshot tool for Windows, macOS and Linux.
      </p>
      <dl className="set-facts">
        <Fact label="App name" value={about?.name ?? unknown} />
        <Fact label="Version" value={about?.version ?? unknown} />
        <Fact label="License" value={about?.license ?? unknown} />
        <Fact
          label="Release date"
          value={about?.releaseDate == null ? unknown : formatDay(about.releaseDate)}
        />
        <Fact
          label="Last updated"
          value={about?.lastUpdated == null ? unknown : formatMoment(about.lastUpdated)}
        />
      </dl>

      <h3 className="set-subtitle">Your computer</h3>
      <dl className="set-facts">
        <Fact label="Computer name" value={system?.computerName ?? unknown} />
        <Fact label="Operating system" value={system?.operatingSystem ?? unknown} />
      </dl>

      <h3 className="set-subtitle">FFmpeg</h3>
      <p className="ui-help">
        Built under the LGPL version 3 and used unchanged. The license and the source offer are in
        the resources folder of the installed app.
      </p>

      <div className="set-links">
        <Button
          icon={<Glyph d={GITHUB} size={16} />}
          onClick={() => {
            onOpenLink(SOURCE_URL);
          }}
        >
          Source code
        </Button>
        <Button
          icon={<ExternalLink size={16} strokeWidth={1.75} />}
          onClick={() => {
            onOpenLink(FFMPEG_NOTES_URL);
          }}
        >
          About the FFmpeg license
        </Button>
      </div>
      <p className="set-built-by">
        <BuiltBy onOpenLink={onOpenLink} />
      </p>
    </section>
  );
}
