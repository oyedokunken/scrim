import {
  Circle,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Library,
  Mail,
  Mic,
  MousePointer2,
  Play,
  ScanLine,
  Settings,
  Share2,
  Video,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { Scene } from '@/lib/demo/master';
import { LogoMark } from '../logo';
import styles from './scene-screens.module.css';

/**
 * The app screens of the hero video, drawn as HTML and CSS with the real labels of the app. Each
 * one reads its progress from the `--p-<scene>` variable that the one clock writes, so it plays,
 * pauses and scrubs with the rest. Nothing here is a screenshot.
 */

const RAIL: readonly { label: string; Icon: LucideIcon }[] = [
  { label: 'Record', Icon: Circle },
  { label: 'Screenshot', Icon: ScanLine },
  { label: 'Library', Icon: Library },
  { label: 'Cursor', Icon: MousePointer2 },
  { label: 'Zoom', Icon: ZoomIn },
  { label: 'Camera', Icon: Video },
  { label: 'Audio', Icon: Mic },
  { label: 'Background', Icon: ImageIcon },
  { label: 'Settings', Icon: Settings },
];

/** The app window: its title bar, the left rail and the page on the right. */
function AppWindow({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className={styles.window}>
      <div className={styles.titleBar}>
        <LogoMark size={14} className={styles.titleMark} />
        <span className={styles.titleName}>Scrim</span>
        <span className={styles.controls} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className={styles.body}>
        <nav className={styles.rail} aria-hidden="true">
          {RAIL.map(({ label, Icon }) => (
            <span key={label} className={styles.railItem} data-active={label === active}>
              <Icon size={14} strokeWidth={2.2} />
              {label}
            </span>
          ))}
        </nav>
        <div className={styles.page}>{children}</div>
      </div>
    </div>
  );
}

/** A switch that turns on at a point of the scene. */
function Switch({ label, from }: { label: string; from: number }) {
  return (
    <span className={styles.switchRow} style={{ '--from': String(from) } as CSSProperties}>
      <span className={styles.switchTrack}>
        <span className={styles.switchThumb} />
      </span>
      {label}
    </span>
  );
}

function RecordScreen() {
  return (
    <>
      <AppWindow active="Record">
        <div className={styles.pageHead}>
          <h3>Record</h3>
          <span className={styles.folder}>
            <FolderOpen size={14} strokeWidth={2.2} />
            Videos\Scrim
          </span>
        </div>
        <div className={styles.stage}>
          <span className={styles.region}>
            <i />
            <i />
            <i />
            <i />
            <b>1280 by 720</b>
          </span>
          <span className={styles.stageHint}>Drag a box over the part of the screen to record</span>
        </div>
        <div className={styles.optionRow}>
          <div className={styles.option}>
            <h4>
              <Video size={14} strokeWidth={2.2} />
              Camera
            </h4>
            <Switch label="Use camera" from={0.22} />
            <span className={styles.select}>Integrated Camera</span>
          </div>
          <div className={styles.option}>
            <h4>
              <Mic size={14} strokeWidth={2.2} />
              Microphone
            </h4>
            <Switch label="Use microphone" from={0.34} />
            <span className={styles.select}>Microphone Array</span>
          </div>
          <span className={styles.start}>
            <i className={styles.startDot} />
            Start recording
          </span>
        </div>
      </AppWindow>
      <div className={styles.countdown} aria-hidden="true">
        <span style={{ '--a': '0.62', '--b': '0.70' } as CSSProperties}>3</span>
        <span style={{ '--a': '0.70', '--b': '0.77' } as CSSProperties}>2</span>
        <span style={{ '--a': '0.77', '--b': '0.84' } as CSSProperties}>1</span>
      </div>
      <div className={styles.pill} aria-hidden="true">
        <i className={styles.recDot} />
        <span>00:01</span>
        <span className={styles.pillButton}>
          <Mic size={14} strokeWidth={2.2} />
        </span>
        <span className={styles.pillButton}>
          <Video size={14} strokeWidth={2.2} />
        </span>
        <span className={styles.pillStop} />
      </div>
    </>
  );
}

function StopScreen() {
  return (
    <AppWindow active="Record">
      <div className={styles.review}>
        <div className={styles.reviewMedia}>
          <span className={styles.thumb}>
            <i className={styles.thumbBar} />
            <i className={styles.thumbBar} />
            <i className={styles.thumbBar} />
            <span className={styles.bubble} />
            <span className={styles.playBadge}>
              <Play size={16} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        </div>
        <div className={styles.reviewSide}>
          <div className={styles.making}>
            <p className={styles.counterLine}>
              Making your video, <span className={styles.percent} />
            </p>
            <span className={styles.bar}>
              <i className={styles.barFill} />
            </span>
            <span className={styles.ghostButton}>Cancel</span>
          </div>
          <div className={styles.finished}>
            <p className={styles.fileName}>Scrim 2026-11-02 10.14</p>
            <dl className={styles.facts}>
              <div>
                <dt>Length</dt>
                <dd>0:18</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>1920 by 1080</dd>
              </div>
              <div>
                <dt>Frame rate</dt>
                <dd>30 fps</dd>
              </div>
              <div>
                <dt>Export goes to</dt>
                <dd>Videos\Scrim</dd>
              </div>
            </dl>
            <div className={styles.actions}>
              <span className={styles.primaryButton}>Export</span>
              <span className={styles.ghostButton} data-press="stop">
                Open in editor
              </span>
              <span className={styles.ghostButton}>Show in folder</span>
              <span className={styles.ghostButton}>Share</span>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

function EditScreen() {
  return (
    <AppWindow active="Zoom">
      <div className={styles.editor}>
        <div className={styles.editStage}>
          <span className={styles.editFrame}>
            <span className={styles.editScene}>
              <i className={styles.thumbBar} />
              <i className={styles.thumbBar} />
              <i className={styles.thumbBar} />
              <span className={styles.editRipple} />
            </span>
            <span className={styles.editBubble} />
          </span>
          <span className={styles.timeline}>
            <i className={styles.trimHandle} />
            <i className={styles.trimSpan} />
            <i className={styles.trimHandle} />
          </span>
        </div>
        <div className={styles.controlsPanel}>
          <h4>Cursor</h4>
          <span className={styles.chips}>
            <span className={styles.chip} data-pick="before">
              Halo only
            </span>
            <span className={styles.chip} data-pick="after">
              Halo and ripples
            </span>
          </span>
          <h4>Zoom</h4>
          <span className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Level</span>
            <span className={styles.slider}>
              <i className={styles.sliderFill} />
            </span>
            <span className={styles.sliderValue} />
          </span>
          <h4>Background</h4>
          <span className={styles.swatches}>
            <span className={styles.swatch} data-swatch="butter" />
            <span className={styles.swatch} data-swatch="gradient" />
            <span className={styles.swatch} data-swatch="dots" />
          </span>
          <h4>Camera</h4>
          <span className={styles.chips}>
            <span className={styles.chip} data-pick="circle">
              Circle
            </span>
            <span className={styles.chip} data-pick="square">
              Rounded square
            </span>
          </span>
        </div>
      </div>
    </AppWindow>
  );
}

function ExportScreen() {
  return (
    <>
      <AppWindow active="Zoom">
        <div className={styles.exportForm}>
          <h3>Export</h3>
          <dl className={styles.exportFields}>
            <div>
              <dt>Format</dt>
              <dd>MP4</dd>
            </div>
            <div>
              <dt>Resolution</dt>
              <dd>Same as recording</dd>
            </div>
            <div>
              <dt>Frame rate</dt>
              <dd>30 fps</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>High</dd>
            </div>
            <div>
              <dt>File name</dt>
              <dd>Scrim 2026-11-02 10.14.mp4</dd>
            </div>
            <div>
              <dt>Export goes to</dt>
              <dd>Videos\Scrim</dd>
            </div>
          </dl>
          <div className={styles.exportRow}>
            <span className={styles.primaryButton} data-press="export">
              Export
            </span>
            <span className={styles.exportProgress}>
              <span className={styles.counterLine}>
                Exporting your video, <span className={styles.percent} />
              </span>
              <span className={styles.bar}>
                <i className={styles.barFill} />
              </span>
            </span>
            <span className={styles.cancel}>Cancel</span>
          </div>
        </div>
      </AppWindow>
      <div className={styles.done} aria-hidden="true">
        <h4>Your video is ready</h4>
        <p>Scrim 2026-11-02 10.14.mp4</p>
        <p className={styles.muted}>14.2 MB, saved to Videos\Scrim</p>
        <span className={styles.actions}>
          <span className={styles.primaryButton}>Show in folder</span>
          <span className={styles.ghostButton}>Share</span>
        </span>
      </div>
    </>
  );
}

function LibraryScreen() {
  return (
    <>
      <AppWindow active="Library">
        <div className={styles.pageHead}>
          <h3>Library</h3>
          <span className={styles.filters}>
            <span data-on="true">All</span>
            <span>Recordings</span>
            <span>Screenshots</span>
          </span>
        </div>
        <div className={styles.grid}>
          <span className={`${styles.card} ${styles.newCard}`}>
            <span className={styles.cardThumb}>
              <i className={styles.thumbBar} />
              <i className={styles.thumbBar} />
              <span className={styles.bubble} />
              <span className={styles.playBadge}>
                <Play size={16} fill="currentColor" strokeWidth={0} />
              </span>
              <b className={styles.newPill}>NEW</b>
            </span>
            <span className={styles.cardName}>Scrim 2026-11-02 10.14</span>
            <span className={styles.cardMeta}>0:18, 14.2 MB</span>
          </span>
          <span className={styles.card}>
            <span className={styles.cardThumb} data-tone="alt">
              <i className={styles.thumbBar} />
              <i className={styles.thumbBar} />
              <span className={styles.playBadge}>
                <Play size={16} fill="currentColor" strokeWidth={0} />
              </span>
            </span>
            <span className={styles.cardName}>Product tour</span>
            <span className={styles.cardMeta}>1:42, 96 MB</span>
          </span>
          <span className={styles.card}>
            <span className={styles.cardThumb} data-tone="shot">
              <i className={styles.thumbBar} />
              <i className={styles.thumbBar} />
            </span>
            <span className={styles.cardName}>Screenshot 10.02</span>
            <span className={styles.cardMeta}>PNG, 1.1 MB</span>
          </span>
        </div>
      </AppWindow>
      <div className={styles.sheet} aria-hidden="true">
        <h4>Share</h4>
        {[
          { label: 'Share with an app', Icon: Share2 },
          { label: 'Copy file', Icon: Copy },
          { label: 'Email', Icon: Mail },
          { label: 'Show in folder', Icon: FolderOpen },
        ].map(({ label, Icon }) => (
          <span key={label} className={styles.sheetRow}>
            <Icon size={14} strokeWidth={2.2} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

const SCREENS: Partial<Record<Scene, () => ReactNode>> = {
  record: () => <RecordScreen />,
  stop: () => <StopScreen />,
  edit: () => <EditScreen />,
  export: () => <ExportScreen />,
  library: () => <LibraryScreen />,
};

/** The screen of one scene, on its butter card. */
export function SceneScreen({ scene }: { scene: Scene }) {
  return (
    <div className={styles.screen} data-scene-screen={scene}>
      {SCREENS[scene]?.()}
    </div>
  );
}
