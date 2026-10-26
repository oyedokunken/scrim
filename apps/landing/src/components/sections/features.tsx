import {
  FileVideo,
  FolderLock,
  LifeBuoy,
  Pause,
  ScreenShare,
  SquareSplitHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import {
  AppWindowIllustration,
  BackdropSwatchesIllustration,
  BeforeAfterIllustration,
  ClickRipplesIllustration,
  CursorHaloIllustration,
  ExportCardIllustration,
  FaceBubbleIllustration,
  ShortcutsIllustration,
  TrimTimelineIllustration,
} from '../illustrations';
import styles from './features.module.css';

interface AlsoItem {
  icon: LucideIcon;
  title: string;
  text: string;
}

const ALSO_INCLUDED: readonly AlsoItem[] = [
  {
    icon: Pause,
    title: 'Pause and resume',
    text: 'Stop to think without leaving a gap in the video.',
  },
  {
    icon: SquareSplitHorizontal,
    title: 'Before and after',
    text: 'Compare the original with the zoomed version side by side before you export.',
  },
  {
    icon: ScreenShare,
    title: 'Screenshots',
    text: 'Capture a full display, a region or a window as a PNG. Save it to your folder or copy it to the clipboard.',
  },
  {
    icon: LifeBuoy,
    title: 'Safe recording',
    text: 'Footage is written to disk as you record, so a crash does not cost you the video. Scrim offers to recover it.',
  },
  {
    icon: FolderLock,
    title: 'Your files stay yours',
    text: 'Recordings are saved to the folder you choose. Nothing is uploaded and there is no account.',
  },
  {
    icon: FileVideo,
    title: 'No watermark',
    text: 'Your export is a plain MP4 with nothing added to it.',
  },
];

interface Feature {
  title: string;
  text: ReactNode;
  note?: string;
  visual: ReactNode;
}

const FEATURES: readonly Feature[] = [
  {
    title: 'Auto zoom',
    text: 'Scrim zooms in around your clicks, follows the cursor while you work, then eases back out, so viewers always see the part of the screen that matters. Choose how far it zooms, how long it holds and how smooth it feels, or turn it off.',
    note: 'It is planned from your mouse activity when you stop recording and applied when you export, so you can change it afterwards.',
    visual: (
      <BeforeAfterIllustration
        className={styles.art}
        title="Before and after auto zoom"
        description="On the left, the whole screen with a small button. On the right, the same moment zoomed in on the button as it is clicked."
      />
    ),
  },
  {
    title: 'One screen',
    text: 'Pick a cursor style, set the zoom, switch your camera and microphone on or off, press Start and drag a box over the part of the screen to record. Prefer the whole display or a single window? Choose that instead.',
    visual: <AppWindowIllustration className={styles.art} />,
  },
  {
    title: 'Cursor',
    text: 'A soft halo marks the cursor and a ripple answers every click, so people can follow what you do. Use halo and ripples, halo only, ripples only, or neither.',
    visual: (
      <div className={styles.pair}>
        <CursorHaloIllustration className={styles.art} />
        <ClickRipplesIllustration className={styles.art} />
      </div>
    ),
  },
  {
    title: 'Face camera',
    text: 'Put your face in a bubble. Drag it, snap it to a corner, resize it and choose a circle or a rounded square. It records as its own track, so you can still move it after you finish.',
    visual: <FaceBubbleIllustration className={styles.art} />,
  },
  {
    title: 'Backgrounds',
    text: 'Set your recording on a gradient, a pattern or your own image, with padding, rounded corners and a soft shadow, so even a plain window looks finished.',
    visual: <BackdropSwatchesIllustration className={styles.art} />,
  },
  {
    title: 'Trim and cut',
    text: 'Drag the ends to trim and cut a section from the middle, then play it back to check. Edits are saved beside the recording, so your original file is never changed.',
    visual: <TrimTimelineIllustration className={styles.art} />,
  },
  {
    title: 'Export',
    text: 'Choose resolution, frame rate and quality, then export an MP4 with H.264 video and AAC sound that plays everywhere. No watermark, and you decide where the file goes.',
    visual: <ExportCardIllustration className={styles.art} />,
  },
  {
    title: 'Shortcuts',
    text: 'Start and stop from any app with global shortcuts. Ctrl+Shift+R starts and Ctrl+Shift+S stops and exports, with Cmd in place of Ctrl on macOS. Change either one to suit you.',
    visual: <ShortcutsIllustration className={styles.art} />,
  },
];

/** A two digit number, so the counters line up: 1 becomes 01. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={`section container ${styles.features}`}
    >
      <header className={styles.intro}>
        <h2 id="features-title" className="section-title">
          Record once. Let Scrim do the polish.
        </h2>
        <p className="lead">
          Eight features that turn a plain screen recording into a video people can follow.
        </p>
      </header>

      {/* On wide screens each card sticks near the top and the next one slides over it. */}
      <div className={styles.stack}>
        {FEATURES.map((feature, index) => (
          <article
            key={feature.title}
            className={styles.card}
            style={{ '--i': index } as CSSProperties}
          >
            <div className={styles.copy}>
              <p className={styles.count} aria-hidden="true">
                <span>{pad(index + 1)}</span>/{pad(FEATURES.length)}
              </p>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              {feature.note === undefined ? null : <p className={styles.note}>{feature.note}</p>}
            </div>
            <div className={styles.visual}>{feature.visual}</div>
          </article>
        ))}
      </div>

      <div className={styles.also}>
        <h3 className={styles.alsoTitle}>Also included</h3>
        <ul>
          {ALSO_INCLUDED.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon aria-hidden="true" size={22} />
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
