'use client';

import { Check, Download, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react';
import {
  downloadRequestSchema,
  fieldErrors,
  type DownloadResponse,
  type SystemValue,
} from '@/lib/download-request';
import { SYSTEMS } from '@/lib/systems';
import { siteConfig } from '@/site.config';
import { OsIcon } from '../os-icons';
import { usePlatform } from '../use-platform';
import styles from './download-modal.module.css';

interface DownloadModalProps {
  open: boolean;
  /** A system to preselect, when the button that opened the dialog already names one. */
  initialOs: SystemValue | undefined;
  onClose: () => void;
}

type Arch = 'x64' | 'arm64';
type Format = 'appimage' | 'deb';

type View =
  { kind: 'form' } | { kind: 'done'; result: DownloadResponse; os: SystemValue; firstName: string };

const FIELD_ORDER = ['name', 'email', 'os'] as const;

const GENERIC_ERROR =
  'Something went wrong on our side. You can still get Scrim from the Releases page.';

function systemName(os: SystemValue): string {
  return SYSTEMS.find((system) => system.os === os)?.name ?? os;
}

/** Starts a file download without leaving the page. */
function startDownload(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  if (filename !== '') {
    link.download = filename;
  }
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Asks for a name and an email before a download starts, because the site counts downloads. The
 * dialog is the browser's own, so focus stays inside it, Escape closes it and focus goes back to
 * the button that opened it. The visitor's system is picked from their computer, and they can
 * change it.
 */
export function DownloadModal({ open, initialOs, onClose }: DownloadModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const introId = useId();
  const platform = usePlatform();

  const [view, setView] = useState<View>({ kind: 'form' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // What the visitor picked. Until they pick, the system and chip come from their computer.
  const [pickedOs, setPickedOs] = useState<SystemValue | null>(null);
  const [pickedArch, setPickedArch] = useState<Arch | null>(null);
  const [format, setFormat] = useState<Format>('appimage');
  const [updatesOptIn, setUpdatesOptIn] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState(false);

  const detectedOs = platform !== null && platform.os !== 'unsupported' ? platform.os : null;
  const detectedArch = platform?.arch ?? 'unknown';
  const os: SystemValue | '' = pickedOs ?? initialOs ?? detectedOs ?? '';
  // Apple Silicon is the default for a Mac, because that is every Mac sold in recent years.
  const arch: Arch = pickedArch ?? (detectedArch === 'x64' ? 'x64' : 'arm64');

  // Open and close the browser's dialog to match the `open` prop. The provider mounts a fresh
  // dialog for every opening, so the form always starts empty.
  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
      nameInput.current?.focus();
    }
    if (!open && element.open) {
      element.close();
    }
  }, [open]);

  // After success, move focus to the heading so screen readers announce it.
  useEffect(() => {
    if (view.kind === 'done') {
      heading.current?.focus();
    }
  }, [view.kind]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setFormError('');

    // A Mac asks which chip it has. Other systems use what the browser reported, 64 bit Intel by default.
    const chosenArch: Arch | undefined =
      os === 'macos' ? arch : os === '' ? undefined : detectedArch === 'arm64' ? 'arm64' : 'x64';

    const parsed = downloadRequestSchema.safeParse({
      name,
      email,
      os: os === '' ? undefined : os,
      arch: chosenArch,
      format: os === 'linux' ? format : undefined,
      updatesOptIn,
      website,
    });
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      setErrors(found);
      const first = FIELD_ORDER.find((field) => found[field] !== undefined);
      if (first === 'name') {
        nameInput.current?.focus();
      } else if (first === 'email') {
        emailInput.current?.focus();
      }
      return;
    }
    setErrors({});

    setPending(true);
    try {
      const response = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = (await response.json()) as DownloadResponse & {
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        if (data.fields !== undefined) {
          setErrors(data.fields);
        }
        setFormError(data.error ?? GENERIC_ERROR);
        return;
      }
      setView({
        kind: 'done',
        result: data,
        os: parsed.data.os,
        firstName: parsed.data.name.split(/\s+/)[0] ?? parsed.data.name,
      });
      if (data.direct) {
        startDownload(data.url, data.filename);
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setFormError(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  };

  const fieldProps = (field: string) => ({
    id: `${titleId}-${field}`,
    'aria-invalid': errors[field] === undefined ? undefined : (true as const),
    'aria-describedby': errors[field] === undefined ? undefined : `${titleId}-${field}-error`,
  });

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={view.kind === 'form' ? introId : undefined}
      onClose={() => {
        if (open) {
          onClose();
        }
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself, not on anything inside it.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.panel}>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" size={20} />
        </button>

        {view.kind === 'form' ? (
          <form noValidate onSubmit={(event) => void submit(event)} className={styles.form}>
            <h2 id={titleId} className={styles.title} ref={heading} tabIndex={-1}>
              Before you download
            </h2>
            <p id={introId} className={styles.intro}>
              We track the number of downloads, so let&rsquo;s get to know you.
            </p>

            <div className={styles.field}>
              <label htmlFor={`${titleId}-name`}>Your name</label>
              <input
                {...fieldProps('name')}
                ref={nameInput}
                type="text"
                name="name"
                autoComplete="name"
                maxLength={80}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              {errors.name === undefined ? null : (
                <p id={`${titleId}-name-error`} className={styles.error}>
                  {errors.name}
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor={`${titleId}-email`}>Your email</label>
              <input
                {...fieldProps('email')}
                ref={emailInput}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                maxLength={254}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
              {errors.email === undefined ? null : (
                <p id={`${titleId}-email-error`} className={styles.error}>
                  {errors.email}
                </p>
              )}
            </div>

            <fieldset className={styles.fieldset}>
              <legend>Your machine</legend>
              <div className={styles.choices}>
                {SYSTEMS.map((system) => (
                  <label key={system.os} className={styles.choice}>
                    <input
                      type="radio"
                      name="os"
                      value={system.os}
                      checked={os === system.os}
                      onChange={() => {
                        setPickedOs(system.os);
                      }}
                    />
                    <OsIcon os={system.os} size={26} />
                    <span>{system.name}</span>
                  </label>
                ))}
              </div>
              {errors.os === undefined ? null : <p className={styles.error}>{errors.os}</p>}
              <p className={styles.hint}>
                {detectedOs !== null && os === detectedOs
                  ? `We picked ${systemName(detectedOs)} from your computer. Change it if that is wrong.`
                  : platform?.os === 'unsupported'
                    ? 'Scrim runs on Windows, macOS and Linux computers. Pick the one you will install it on.'
                    : 'Pick the system you will install Scrim on.'}
              </p>
            </fieldset>

            {os === 'macos' ? (
              <fieldset className={styles.fieldset}>
                <legend>Which Mac?</legend>
                <div className={styles.inline}>
                  <label className={styles.pill}>
                    <input
                      type="radio"
                      name="arch"
                      value="arm64"
                      checked={arch === 'arm64'}
                      onChange={() => {
                        setPickedArch('arm64');
                      }}
                    />
                    <span>Apple Silicon (M1 or newer)</span>
                  </label>
                  <label className={styles.pill}>
                    <input
                      type="radio"
                      name="arch"
                      value="x64"
                      checked={arch === 'x64'}
                      onChange={() => {
                        setPickedArch('x64');
                      }}
                    />
                    <span>Intel</span>
                  </label>
                </div>
              </fieldset>
            ) : null}

            {os === 'linux' ? (
              <fieldset className={styles.fieldset}>
                <legend>Which package?</legend>
                <div className={styles.inline}>
                  <label className={styles.pill}>
                    <input
                      type="radio"
                      name="format"
                      value="appimage"
                      checked={format === 'appimage'}
                      onChange={() => {
                        setFormat('appimage');
                      }}
                    />
                    <span>AppImage</span>
                  </label>
                  <label className={styles.pill}>
                    <input
                      type="radio"
                      name="format"
                      value="deb"
                      checked={format === 'deb'}
                      onChange={() => {
                        setFormat('deb');
                      }}
                    />
                    <span>deb</span>
                  </label>
                </div>
              </fieldset>
            ) : null}

            <label className={styles.check}>
              <input
                type="checkbox"
                name="updates"
                checked={updatesOptIn}
                onChange={(event) => {
                  setUpdatesOptIn(event.target.checked);
                }}
              />
              <span>Email me when a new version is out</span>
            </label>

            {/* A trap for bots. People never see it, so only a bot fills it in. */}
            <div className={styles.trap} aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => {
                    setWebsite(event.target.value);
                  }}
                />
              </label>
            </div>

            {formError === '' ? null : (
              <p className={styles.formError} role="alert">
                {formError}{' '}
                <a href={siteConfig.releasesUrl} target="_blank" rel="noopener noreferrer">
                  Open the Releases page
                </a>
              </p>
            )}

            <button type="submit" className={styles.submit} disabled={pending}>
              {os === '' ? (
                <Download aria-hidden="true" size={20} strokeWidth={2.25} />
              ) : (
                <OsIcon os={os} size={20} />
              )}
              {pending ? 'Starting your download...' : 'Start download'}
            </button>

            <p className={styles.privacy}>
              We store your name, email, system, the app version, a hashed IP address and a
              shortened browser string, only to count downloads.{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                Read the privacy policy
              </a>
              .
            </p>
          </form>
        ) : (
          <div className={styles.done}>
            <span className={styles.tick} aria-hidden="true">
              <Check size={32} strokeWidth={3} />
            </span>
            <h2 id={titleId} className={styles.title} ref={heading} tabIndex={-1}>
              Your download is starting.
            </h2>
            {view.result.direct ? (
              <p className={styles.intro}>
                Thanks, {view.firstName}. {view.result.filename}
                {view.result.version === '' ? '' : ` (version ${view.result.version})`} should begin
                downloading in a moment.
              </p>
            ) : (
              <p className={styles.intro}>
                Thanks, {view.firstName}. The installer for {systemName(view.os)} is published on
                the Releases page, and we are opening it for you.
              </p>
            )}
            <a
              className={styles.again}
              href={view.result.url}
              {...(view.result.direct ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
            >
              {view.result.direct ? 'Nothing happened? Download again' : 'Open the Releases page'}
            </a>
            <button type="button" className={styles.submit} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
