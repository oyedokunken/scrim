import type { UserError } from '../hooks';

/** A failure in plain words, with what to do next. It is announced as soon as it appears. */
export function ErrorNotice({ error }: { error: UserError }) {
  return (
    <div className="notice error" role="alert">
      <p className="notice-title">{error.message}</p>
      <p>{error.nextStep}</p>
    </div>
  );
}
