import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { About } from '../../../shared/about-contract';
import { Button } from '../../ui';
import { GITHUB, Glyph } from '../shell/brand-glyphs';
import { BuiltBy } from '../shell/built-by';

const SOURCE_URL = 'https://github.com/oyedokunken/scrim';
const FFMPEG_NOTES_URL =
  'https://github.com/oyedokunken/scrim/blob/main/docs/adr/0007-ffmpeg-bundling.md';

const DAY_FORMAT: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };

/** "2026-10-28" as "October 28, 2026" in the person's language. Anything else is shown as it came. */
export function formatDay(day: string, locale?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return day;
  const [, year, month, date] = match;
  const when = new Date(Number(year), Number(month) - 1, Number(date));
  return Number.isNaN(when.getTime()) ? day : when.toLocaleDateString(locale, DAY_FORMAT);
}

/** An ISO time as a local date and time, or the text unchanged when it cannot be read. */
export function formatMoment(iso: string, locale?: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime())
    ? iso
    : when.toLocaleString(locale, { ...DAY_FORMAT, hour: 'numeric', minute: '2-digit' });
}

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
 * The About card: app facts only. Machine details live in the "Your machine" card.
 */
export function AboutCard({ onOpenLink }: AboutCardProps) {
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
      <h2 className="set-title">About</h2>
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
        <Fact
          label="Last updated"
          value={about?.lastUpdated == null ? unknown : formatMoment(about.lastUpdated)}
        />
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
          FFmpeg
        </Button>
      </div>
      <p className="set-built-by">
        <BuiltBy onOpenLink={onOpenLink} />
      </p>
    </section>
  );
}
