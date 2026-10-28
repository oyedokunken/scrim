'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Download, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  downloadRequestSchema,
  type DownloadResponse,
  type SystemValue,
} from '@/lib/download-request';
import { SYSTEMS } from '@/lib/systems';
import { siteConfig } from '@/site.config';
import { MaltLink } from '../malt-link';
import { OsIcon } from '../os-icons';
import { usePlatform } from '../use-platform';
import styles from './download-modal.module.css';

interface DownloadModalProps {
  open: boolean;
  /** A system to preselect, when the button that opened the dialog already names one. */
  initialOs: SystemValue | undefined;
  onClose: () => void;
}

/** What the fields hold while the visitor types. The schema turns it into the request. */
type FormInput = z.input<typeof downloadRequestSchema>;
type FormOutput = z.output<typeof downloadRequestSchema>;

type View =
  { kind: 'form' } | { kind: 'done'; result: DownloadResponse; os: SystemValue; firstName: string };

const GENERIC_ERROR =
  'Something went wrong on our side. You can still get Scrim from the Releases page.';

/**
 * Widens a value to "or nothing". The schema says the system is required, but until the visitor
 * picks one the field really is empty, and this lets the code say so honestly.
 */
function orNothing<T>(value: T): T | undefined {
  return value;
}

/**
 * Whether a field has no choice yet. For a group of radio buttons with none checked, the form
 * library reports `null`, not `undefined`, so both count as empty, and so does an empty string.
 */
function hasNoChoice(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

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
 * form is React Hook Form with the same Zod schema the server runs, so the page and the server
 * agree on what is valid. The dialog is the browser's own, so focus stays inside it, Escape
 * closes it and focus goes back to the button that opened it. The visitor's system is picked from
 * their computer, and they can change it.
 */
export function DownloadModal({ open, initialOs, onClose }: DownloadModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const introId = useId();
  const platform = usePlatform();

  const [view, setView] = useState<View>({ kind: 'form' });
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    control,
    setError,
    setFocus,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(downloadRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      ...(initialOs === undefined ? {} : { os: initialOs }),
      format: 'appimage',
      updatesOptIn: false,
      website: '',
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  const os = orNothing(useWatch({ control, name: 'os' }));
  const comingSoon = os !== undefined && os !== 'windows';
  const detectedOs = platform !== null && platform.os !== 'unsupported' ? platform.os : null;
  const detectedArch = platform?.arch ?? 'unknown';

  // Open and close the browser's dialog to match the `open` prop. The provider mounts a fresh
  // dialog for every opening, so the form always starts empty.
  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
      setFocus('name');
    }
    if (!open && element.open) {
      element.close();
    }
  }, [open, setFocus]);

  // Pick the system from the visitor's computer, unless they or a button already chose one.
  // Apple Silicon is the default for a Mac, because that is every Mac sold in recent years.
  useEffect(() => {
    if (detectedOs !== null && hasNoChoice(getValues('os'))) {
      setValue('os', detectedOs);
    }
    if (hasNoChoice(getValues('arch'))) {
      setValue('arch', detectedArch === 'x64' ? 'x64' : 'arm64');
    }
  }, [detectedOs, detectedArch, getValues, setValue]);

  // After success, move focus to the heading so screen readers announce it.
  useEffect(() => {
    if (view.kind === 'done') {
      heading.current?.focus();
    }
  }, [view.kind]);

  const onValid = async (data: FormOutput) => {
    setFormError('');
    const request = {
      ...data,
      arch: detectedArch === 'arm64' ? 'arm64' : 'x64',
      format: undefined,
      // Someone asking about a system with no installer is asking to be told when it is ready.
      updatesOptIn: data.os === 'windows' ? data.updatesOptIn : true,
    };

    try {
      const response = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const result = (await response.json()) as DownloadResponse & {
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok) {
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          if (field === 'name' || field === 'email' || field === 'os') {
            setError(field, { message });
          }
        }
        setFormError(result.error ?? GENERIC_ERROR);
        return;
      }
      setView({
        kind: 'done',
        result,
        os: data.os,
        firstName: data.name.split(/\s+/)[0] ?? data.name,
      });
      if (result.comingSoon === true) {
        return;
      }
      if (result.direct) {
        startDownload(result.url, result.filename);
      } else {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setFormError(GENERIC_ERROR);
    }
  };

  const describedBy = (field: 'name' | 'email' | 'os') =>
    errors[field] === undefined ? undefined : `${titleId}-${field}-error`;

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
          <form
            noValidate
            onSubmit={(event) => void handleSubmit(onValid)(event)}
            className={styles.form}
          >
            <h2 id={titleId} className={styles.title} ref={heading} tabIndex={-1}>
              {comingSoon ? `Scrim for ${systemName(os)} is coming soon` : 'Before you download'}
            </h2>
            <p id={introId} className={styles.intro}>
              {comingSoon
                ? 'There is no installer for this system yet. Leave your name and email and we will write once, when it is ready.'
                : 'We track the number of downloads, so let’s get to know you.'}
            </p>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor={`${titleId}-name`}>Your name</label>
                <input
                  id={`${titleId}-name`}
                  type="text"
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  aria-invalid={errors.name === undefined ? undefined : true}
                  aria-describedby={describedBy('name')}
                  {...register('name')}
                />
                {errors.name === undefined ? null : (
                  <p id={`${titleId}-name-error`} className={styles.error}>
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor={`${titleId}-email`}>Your email</label>
                <input
                  id={`${titleId}-email`}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  aria-invalid={errors.email === undefined ? undefined : true}
                  aria-describedby={describedBy('email')}
                  {...register('email')}
                />
                {errors.email === undefined ? null : (
                  <p id={`${titleId}-email-error`} className={styles.error}>
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>

            <fieldset className={styles.fieldset} aria-describedby={describedBy('os')}>
              <legend>Your machine</legend>
              <div className={styles.choices}>
                {SYSTEMS.map((system) => (
                  <label key={system.os} className={styles.choice}>
                    <input type="radio" value={system.os} {...register('os')} />
                    <OsIcon os={system.os} size={26} />
                    <span>{system.name}</span>
                  </label>
                ))}
              </div>
              {errors.os === undefined ? null : (
                <p id={`${titleId}-os-error`} className={styles.error}>
                  {errors.os.message}
                </p>
              )}
              <p className={styles.hint}>
                {detectedOs !== null && os === detectedOs
                  ? `We picked ${systemName(detectedOs)} from your computer. Change it if that is wrong.`
                  : platform?.os === 'unsupported'
                    ? 'Scrim is for desktop computers. Windows has an installer today. macOS and Linux are coming soon.'
                    : 'Windows has an installer today. macOS and Linux are coming soon.'}
              </p>
            </fieldset>

            {comingSoon ? null : (
              <label className={styles.check}>
                <input type="checkbox" {...register('updatesOptIn')} />
                <span>Email me when a new version is out</span>
              </label>
            )}

            {/* A trap for bots. People never see it, so only a bot fills it in. */}
            <div className={styles.trap} aria-hidden="true">
              <label>
                Website
                <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
              </label>
            </div>

            {formError === '' ? null : (
              <p className={styles.formError} role="alert">
                {formError}{' '}
                <a href={siteConfig.releasesUrl} target="_blank" rel="noopener noreferrer">
                  Open the Releases page
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </p>
            )}

            <button type="submit" className={styles.submit} disabled={isSubmitting}>
              {os === undefined ? (
                <Download aria-hidden="true" size={20} strokeWidth={2.25} />
              ) : (
                <OsIcon os={os} size={20} />
              )}
              {isSubmitting
                ? comingSoon
                  ? 'Saving your email...'
                  : 'Starting your download...'
                : comingSoon
                  ? 'Tell me when it is ready'
                  : 'Start download'}
            </button>

            <p className={styles.privacy}>
              We store your name, email, system, the app version, a hashed IP address and a
              shortened browser string, only to count downloads.{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                Read the privacy policy
                <span className="visually-hidden"> (opens in a new tab)</span>
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
              {view.result.comingSoon === true
                ? 'You are on the list.'
                : 'Your download is starting.'}
            </h2>
            {view.result.comingSoon === true ? (
              <p className={styles.intro}>
                Thanks, {view.firstName}. Scrim for {systemName(view.os)} is not ready yet. We will
                write to you once, when it is.
              </p>
            ) : view.result.direct ? (
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
            {view.result.comingSoon === true ? null : (
              <a
                className={styles.again}
                href={view.result.url}
                {...(view.result.direct ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              >
                {view.result.direct ? 'Nothing happened? Download again' : 'Open the Releases page'}
              </a>
            )}
            <MaltLink className={styles.support} label="Show your Support" icon="heart" />
            <button type="button" className={styles.submit} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
