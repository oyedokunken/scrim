import { ExternalLink, ScrollText } from 'lucide-react';
import { Button } from '../../ui';
import { GITHUB, Glyph } from '../shell/brand-glyphs';
import { BuiltBy } from '../shell/built-by';

const SOURCE_URL = 'https://github.com/oyedokunken/scrim';
const FFMPEG_NOTES_URL =
  'https://github.com/oyedokunken/scrim/blob/main/docs/adr/0007-ffmpeg-bundling.md';

export interface AttributionsCardProps {
  onOpenLink: (url: string) => void;
}

/** Credits: the FFmpeg notice, the source code, and the developer, as one row of three buttons. */
export function AttributionsCard({ onOpenLink }: AttributionsCardProps) {
  return (
    <section className="set-section" aria-label="Attributions">
      <h2 className="set-title">
        <ScrollText size={18} strokeWidth={1.75} aria-hidden="true" />
        Attributions
      </h2>

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
        <BuiltBy variant="button" onOpenLink={onOpenLink} />
      </div>
    </section>
  );
}
