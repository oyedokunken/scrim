import { FolderOpen } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Settings, SettingsPatch } from '../../../shared/settings';
import { acceleratorsOf, SHORTCUT_IDS, type ShortcutId } from '../../../shared/shortcut-keys';
import { Button, ConfirmDialog, Switch, Tooltip, useShowError, useToast } from '../../ui';
import type { FolderKind } from '../hooks';
import { ShortcutRow } from './shortcut-row';

const SOURCE_URL = 'https://github.com/oyedokunken/scrim';
const FFMPEG_NOTES_URL =
  'https://github.com/oyedokunken/scrim/blob/main/docs/adr/0007-ffmpeg-bundling.md';
const OWNER_URL = 'https://www.oyedokun.dev/';

function Section({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <section className="set-section" aria-label={title}>
      <h2 className="set-title">{title}</h2>
      {help === undefined ? null : <p className="ui-help">{help}</p>}
      {children}
    </section>
  );
}

function FolderRow({
  label,
  path,
  fallback,
  onChange,
  onOpen,
}: {
  label: string;
  path: string | null;
  fallback: string;
  onChange: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        <span className="set-row-label">{label}</span>
        <Tooltip label={path ?? fallback}>
          <span className="set-row-path">{path ?? `${fallback} (default)`}</span>
        </Tooltip>
      </div>
      <div className="set-row-control">
        <Button aria-label={`Change ${label.toLowerCase()}`} onClick={onChange}>
          Change
        </Button>
        <Button
          aria-label={`Open ${label.toLowerCase()}`}
          icon={<FolderOpen size={16} strokeWidth={1.75} />}
          onClick={onOpen}
        >
          Open
        </Button>
      </div>
    </div>
  );
}

export interface SettingsViewProps {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  chooseFolder: (kind: FolderKind) => Promise<void>;
  version: string | null;
  /** Shows the welcome screen now. */
  onShowWelcome: () => void;
  onOpenLink: (url: string) => void;
}

/** Every setting, saved and applied the moment it changes. */
export function SettingsView({
  settings,
  update,
  chooseFolder,
  version,
  onShowWelcome,
  onOpenLink,
}: SettingsViewProps) {
  const toast = useToast();
  const showError = useShowError();
  const [unavailable, setUnavailable] = useState<readonly ShortcutId[]>([]);
  const [legacy, setLegacy] = useState(0);
  const [confirmMove, setConfirmMove] = useState(false);
  const keys = acceleratorsOf(settings);

  useEffect(() => {
    let alive = true;
    void window.scrim.invoke('shortcuts:status').then(
      (status) => {
        if (alive) setUnavailable(status.unavailable);
      },
      () => undefined,
    );
    void window.scrim.invoke('legacy:count').then(
      (count) => {
        if (alive) setLegacy(count);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [settings.shortcutRecord, settings.shortcutStop, settings.shortcutScreenshot]);

  const openFolder = (kind: FolderKind): void => {
    void window.scrim.invoke('folder:open', { kind }).catch(() => {
      showError({
        title: 'Scrim could not open that folder',
        message: 'Check that the drive is connected.',
        code: 'folder-open-failed',
        retry: () => {
          openFolder(kind);
        },
      });
    });
  };

  const move = (): void => {
    setConfirmMove(false);
    void window.scrim.invoke('legacy:move').then(
      (result) => {
        setLegacy(result.failed);
        toast(
          result.failed === 0
            ? `Moved ${String(result.moved)} folders out of your videos folder`
            : `Moved ${String(result.moved)}. ${String(result.failed)} could not be moved and stayed where they were.`,
        );
      },
      () => {
        showError({
          title: 'Scrim could not move the folders',
          message: 'Nothing was changed. Your recordings are where they were.',
          code: 'legacy-move-failed',
          retry: move,
        });
      },
    );
  };

  return (
    <div className="settings">
      <Section
        title="Shortcuts"
        help="These work in any program. Press Change, then the keys you want."
      >
        {SHORTCUT_IDS.map((id) => (
          <ShortcutRow
            key={id}
            id={id}
            all={keys}
            unavailable={unavailable.includes(id)}
            onChange={(accelerator) => {
              update(
                id === 'record'
                  ? { shortcutRecord: accelerator }
                  : id === 'stop'
                    ? { shortcutStop: accelerator }
                    : { shortcutScreenshot: accelerator },
              );
            }}
            onCapturing={(capturing) => {
              void window.scrim.invoke('shortcuts:suspend', { suspended: capturing });
            }}
          />
        ))}
      </Section>

      <Section title="Folders" help="Where your finished videos and your screenshots are saved.">
        <FolderRow
          label="Recordings"
          path={settings.destinationFolder}
          fallback="Videos\Scrim"
          onChange={() => void chooseFolder('recordings')}
          onOpen={() => {
            openFolder('recordings');
          }}
        />
        <FolderRow
          label="Screenshots"
          path={settings.screenshotFolder}
          fallback="Pictures\Scrim"
          onChange={() => void chooseFolder('screenshots')}
          onOpen={() => {
            openFolder('screenshots');
          }}
        />
      </Section>

      <Section title="Recording">
        <Switch
          label="Count down 3, 2, 1 before recording"
          checked={settings.countdownOn}
          onChange={(countdownOn) => {
            update({ countdownOn });
          }}
        />
        <Switch
          label="Start with the camera on"
          checked={settings.cameraOn}
          onChange={(cameraOn) => {
            update({ cameraOn });
          }}
        />
        <Switch
          label="Start with the microphone on"
          checked={settings.micOn}
          onChange={(micOn) => {
            update({ micOn });
          }}
        />
      </Section>

      <Section title="Welcome screen">
        <Switch
          label="Show the welcome screen when Scrim starts"
          checked={settings.showWelcome}
          onChange={(showWelcome) => {
            update({ showWelcome });
          }}
        />
        <div>
          <Button onClick={onShowWelcome}>Show welcome again</Button>
        </div>
      </Section>

      {legacy === 0 ? null : (
        <Section
          title="Old working files"
          help={`${String(legacy)} working ${legacy === 1 ? 'folder' : 'folders'} from an earlier version ${legacy === 1 ? 'sits' : 'sit'} in your recordings folder. Moving them keeps that folder to finished videos only. Nothing is deleted.`}
        >
          <div>
            <Button
              onClick={() => {
                setConfirmMove(true);
              }}
            >
              Move them out of the recordings folder
            </Button>
          </div>
        </Section>
      )}

      <Section title="Help">
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
        <p className="ui-help">
          Logs stay on this computer. They never hold a file path or a window title.
        </p>
      </Section>

      <Section title="About">
        <p className="set-about">
          Scrim {version === null ? '' : `version ${version}`}. A free, open source screen recorder.
          Nothing you record is uploaded.
        </p>
        <p className="ui-help">
          Scrim is released under the MIT license. It includes FFmpeg, built under the LGPL version
          3 and used unchanged. The FFmpeg license and its source offer are in the resources folder
          of the installed app.
        </p>
        <div className="set-links">
          <Button
            onClick={() => {
              onOpenLink(SOURCE_URL);
            }}
          >
            Source code
          </Button>
          <Button
            onClick={() => {
              onOpenLink(FFMPEG_NOTES_URL);
            }}
          >
            About the FFmpeg license
          </Button>
          <Button
            onClick={() => {
              onOpenLink(OWNER_URL);
            }}
          >
            Built by @oyedokunken
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmMove}
        title="Move the old working folders?"
        confirmLabel="Move them"
        onCancel={() => {
          setConfirmMove(false);
        }}
        onConfirm={move}
      >
        <p>
          Scrim moves them to its own data folder. Your videos stay where they are, and nothing is
          deleted. If a move cannot be checked, the folder stays where it was.
        </p>
      </ConfirmDialog>
    </div>
  );
}
