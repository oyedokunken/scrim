import { useEffect, useState } from 'react';
import { Button, Dialog } from '../../ui';

type Answer = 'keep' | 'stop' | 'cancel';

/**
 * The question that comes up when the window is closed during a recording, in the app's own dialog
 * and not a system message box. Cancel has focus, so a stray Enter never stops a recording, and
 * nothing is discarded whichever button is pressed.
 */
export function CloseQuestion() {
  const [ask, setAsk] = useState<{ trayAvailable: boolean } | null>(null);

  useEffect(
    () =>
      window.scrim.on('window:close-requested', (request) => {
        setAsk(request);
        // Tells the main process the question is on screen, so it does not fall back to a system box.
        void window.scrim.invoke('window:close-answer', { answer: 'shown' });
      }),
    [],
  );

  const answer = (choice: Answer): void => {
    setAsk(null);
    void window.scrim.invoke('window:close-answer', { answer: choice });
  };

  return (
    <Dialog
      open={ask !== null}
      title="Scrim is still recording"
      onClose={() => {
        if (ask !== null) answer('cancel');
      }}
      className="ui-confirm"
    >
      <div className="ui-confirm-body">
        <p>
          Stop and save finishes the recording and keeps the file. Keeping it running leaves the
          recording going in the background. Nothing is discarded either way.
        </p>
      </div>
      <div className="ui-confirm-actions close-question-actions">
        <Button
          onClick={() => {
            answer('keep');
          }}
        >
          {ask?.trayAvailable === true
            ? 'Keep recording in the tray'
            : 'Keep recording and minimize'}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            answer('stop');
          }}
        >
          Stop and save
        </Button>
        <Button
          data-autofocus
          onClick={() => {
            answer('cancel');
          }}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
