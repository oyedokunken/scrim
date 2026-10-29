import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ShownError {
  /** What went wrong, as a short title: "Scrim could not open the area chooser". */
  title: string;
  /** One plain line on what happened or what to do. */
  message: string;
  /** What to do next, when it is not already in the message. */
  nextStep?: string | undefined;
  /** Behind a Details button, for someone who reports the problem. */
  code?: string | undefined;
  /** Runs the action again. Adds a Try again button. */
  retry?: (() => void) | undefined;
}

type Show = (error: ShownError) => void;

const ErrorContext = createContext<Show | null>(null);

/** Shows an error in the app's dialog. Call it from any screen below the provider. */
export function useShowError(): Show {
  const show = useContext(ErrorContext);
  if (show === null) throw new Error('useShowError needs an ErrorProvider.');
  return show;
}

/**
 * Every error the app shows goes through here: a dialog with a title, a plain line, an X, Escape and a
 * backdrop click to close it, Try again when the action can be repeated, and the error code behind Details.
 */
export function ErrorProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<ShownError | null>(null);
  const [details, setDetails] = useState(false);

  const show = useCallback<Show>((next) => {
    setDetails(false);
    setError(next);
  }, []);
  const close = (): void => {
    setError(null);
  };

  return (
    <ErrorContext.Provider value={show}>
      {children}
      <Dialog open={error !== null} title={error?.title ?? 'Something went wrong'} onClose={close}>
        <div className="ui-confirm-body ui-error-body" role="alert">
          <p>{error?.message}</p>
          {error?.nextStep === undefined ? null : <p>{error.nextStep}</p>}
          {details && error?.code !== undefined ? (
            <p className="ui-help ui-error-code">Error code: {error.code}</p>
          ) : null}
        </div>
        <div className="ui-confirm-actions">
          {error?.code === undefined ? null : (
            <Button
              aria-expanded={details}
              onClick={() => {
                setDetails((value) => !value);
              }}
            >
              Details
            </Button>
          )}
          <Button data-autofocus={error?.retry === undefined ? true : undefined} onClick={close}>
            Close
          </Button>
          {error?.retry === undefined ? null : (
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                const retry = error.retry;
                close();
                retry?.();
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </Dialog>
    </ErrorContext.Provider>
  );
}
