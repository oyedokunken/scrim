import type { Settings, SettingsPatch } from '../../../shared/settings';
import { BrandMark } from '../brand-mark';
import { formatSeconds } from '../format';
import type { DeviceOption, UserError } from '../hooks';
import { ErrorNotice } from './error-notice';

const CURSOR_STYLES: { value: Settings['cursorStyle']; label: string }[] = [
  { value: 'halo-ripples', label: 'Halo and ripples' },
  { value: 'halo', label: 'Halo only' },
  { value: 'ripples', label: 'Ripples only' },
  { value: 'off', label: 'Off' },
];

export interface HomeViewProps {
  settings: Settings;
  cameras: DeviceOption[];
  mics: DeviceOption[];
  /** True while a recording is being started, so the button cannot be pressed twice. */
  busy: boolean;
  error: UserError | null;
  onChange: (patch: SettingsPatch) => void;
  onChooseFolder: () => void;
  onStart: () => void;
}

function folderLabel(folder: string | null): string {
  return folder === null ? 'Videos\\Scrim' : folder;
}

/** The one screen where a recording starts: what to record, how it looks, the devices and Start. */
export function HomeView({
  settings,
  cameras,
  mics,
  busy,
  error,
  onChange,
  onChooseFolder,
  onStart,
}: HomeViewProps) {
  return (
    <main className="screen home">
      <header className="home-header">
        <h1 className="brand">
          <BrandMark />
          Scrim
        </h1>
        <p className="tagline">Record anything on your screen effortlessly</p>
      </header>

      {error === null ? null : <ErrorNotice error={error} />}

      <section className="panel" aria-labelledby="source-title">
        <h2 id="source-title">What to record</h2>
        <p className="hint">
          Your main screen, all of it. The mouse and every window on it are included.
        </p>
      </section>

      <section className="panel" aria-labelledby="cursor-title">
        <h2 id="cursor-title">Cursor</h2>
        <div className="field">
          <label htmlFor="cursor-style">Style</label>
          <select
            id="cursor-style"
            value={settings.cursorStyle}
            onChange={(event) => {
              onChange({ cursorStyle: event.target.value as Settings['cursorStyle'] });
            }}
          >
            {CURSOR_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel" aria-labelledby="zoom-title">
        <h2 id="zoom-title">Auto zoom</h2>
        <div className="field field-check">
          <input
            id="zoom-on"
            type="checkbox"
            checked={settings.zoomOn}
            onChange={(event) => {
              onChange({ zoomOn: event.target.checked });
            }}
          />
          <label htmlFor="zoom-on">Zoom in where you click</label>
        </div>
        <div className="field">
          <label htmlFor="zoom-level">
            Zoom level <output htmlFor="zoom-level">{settings.zoomLevel.toFixed(1)}x</output>
          </label>
          <input
            id="zoom-level"
            type="range"
            min={1.2}
            max={3}
            step={0.1}
            value={settings.zoomLevel}
            disabled={!settings.zoomOn}
            onChange={(event) => {
              onChange({ zoomLevel: Number(event.target.value) });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="zoom-hold">
            Hold after a click{' '}
            <output htmlFor="zoom-hold">{formatSeconds(settings.holdAfterClickMs)}</output>
          </label>
          <input
            id="zoom-hold"
            type="range"
            min={200}
            max={5000}
            step={100}
            value={settings.holdAfterClickMs}
            disabled={!settings.zoomOn}
            onChange={(event) => {
              onChange({ holdAfterClickMs: Number(event.target.value) });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="zoom-smooth">
            Smoothness{' '}
            <output htmlFor="zoom-smooth">{Math.round(settings.smoothness * 100)}%</output>
          </label>
          <input
            id="zoom-smooth"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.smoothness}
            disabled={!settings.zoomOn}
            onChange={(event) => {
              onChange({ smoothness: Number(event.target.value) });
            }}
          />
        </div>
      </section>

      <section className="panel" aria-labelledby="devices-title">
        <h2 id="devices-title">Camera and microphone</h2>
        <div className="field field-check">
          <input
            id="camera-on"
            type="checkbox"
            checked={settings.cameraOn}
            onChange={(event) => {
              onChange({ cameraOn: event.target.checked });
            }}
          />
          <label htmlFor="camera-on">Camera</label>
        </div>
        <div className="field">
          <label htmlFor="camera-device">Camera to use</label>
          <select
            id="camera-device"
            value={settings.cameraDeviceId ?? ''}
            disabled={!settings.cameraOn || cameras.length === 0}
            onChange={(event) => {
              onChange({ cameraDeviceId: event.target.value === '' ? null : event.target.value });
            }}
          >
            <option value="">{cameras.length === 0 ? 'No camera found' : 'Default camera'}</option>
            {cameras.map((camera) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field field-check">
          <input
            id="mic-on"
            type="checkbox"
            checked={settings.micOn}
            onChange={(event) => {
              onChange({ micOn: event.target.checked });
            }}
          />
          <label htmlFor="mic-on">Microphone</label>
        </div>
        <div className="field">
          <label htmlFor="mic-device">Microphone to use</label>
          <select
            id="mic-device"
            value={settings.micDeviceId ?? ''}
            disabled={!settings.micOn || mics.length === 0}
            onChange={(event) => {
              onChange({ micDeviceId: event.target.value === '' ? null : event.target.value });
            }}
          >
            <option value="">
              {mics.length === 0 ? 'No microphone found' : 'Default microphone'}
            </option>
            {mics.map((mic) => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel" aria-labelledby="save-title">
        <h2 id="save-title">Save to</h2>
        <div className="folder-row">
          <span className="folder" title={folderLabel(settings.destinationFolder)}>
            {folderLabel(settings.destinationFolder)}
          </span>
          <button type="button" className="button secondary" onClick={onChooseFolder}>
            Change folder
          </button>
        </div>
      </section>

      <div className="actions">
        <button type="button" className="button primary start" disabled={busy} onClick={onStart}>
          {busy ? 'Starting...' : 'Start recording'}
        </button>
        <p className="hint">
          Press Ctrl+Shift+R to start from anywhere, and Ctrl+Shift+S to stop and save.
        </p>
      </div>
    </main>
  );
}
