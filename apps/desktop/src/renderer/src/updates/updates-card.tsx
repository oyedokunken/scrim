import { Button, Switch } from '../../ui';
import type { UpdateSnapshot } from '../../../shared/updates-contract';
import { blockText } from './update-modal';
import './updates.css';

/** One plain sentence for where the update flow is. Empty when there is nothing to say. */
export function statusText(snapshot: UpdateSnapshot): string {
  const state = snapshot.state;
  switch (state.phase) {
    case 'idle':
      return '';
    case 'checking':
      return 'Looking for a newer version.';
    case 'none':
      return 'You have the latest version.';
    case 'unsupported':
      return state.message;
    case 'available':
      return `Version ${state.info.version} is available.`;
    case 'downloading':
      return `Downloading version ${state.info.version}, ${String(state.percent)}%.`;
    case 'ready':
      return `Version ${state.info.version} is downloaded and waits for a restart.`;
    case 'error':
      return `${state.message} ${state.nextStep}`;
  }
}

export interface UpdatesCardProps {
  snapshot: UpdateSnapshot;
  autoCheck: boolean;
  onAutoCheck: (on: boolean) => void;
  onCheck: () => void;
  onShowUpdate: () => void;
}

/**
 * The Updates card. A check happens only when the button is pressed, or at start when the person
 * turned that on here. Nothing about the person is sent: the request is for the release details.
 */
export function UpdatesCard({
  snapshot,
  autoCheck,
  onAutoCheck,
  onCheck,
  onShowUpdate,
}: UpdatesCardProps) {
  const state = snapshot.state;
  const working = state.phase === 'checking' || state.phase === 'downloading';
  const canCheck = !working && state.phase !== 'unsupported' && snapshot.blocked === null;
  const found =
    state.phase === 'available' || state.phase === 'downloading' || state.phase === 'ready';
  const text = statusText(snapshot);
  const wait = blockText(snapshot.blocked);

  return (
    <section className="set-section" aria-label="Updates">
      <h2 className="set-title">Updates</h2>
      <p className="ui-help">
        Looks for a newer version only when you ask, or when the app starts if you turn that on. The
        request goes to GitHub for the release details and carries nothing about you or your
        recordings. Nothing is downloaded until you press Update now.
      </p>
      {found ? (
        <button type="button" className="update-pill" onClick={onShowUpdate}>
          New update available
        </button>
      ) : null}
      {text === '' ? null : (
        <p
          className={
            state.phase === 'error' ? 'update-status update-status-error' : 'update-status'
          }
          role={state.phase === 'error' ? 'alert' : 'status'}
        >
          {text}
        </p>
      )}
      {wait === '' ? null : <p className="ui-help">{wait}</p>}
      <div>
        <Button disabled={!canCheck} onClick={onCheck}>
          {state.phase === 'checking' ? 'Checking' : 'Check for updates'}
        </Button>
      </div>
      <Switch
        label="Check for updates when the app starts"
        checked={autoCheck}
        onChange={onAutoCheck}
      />
    </section>
  );
}
