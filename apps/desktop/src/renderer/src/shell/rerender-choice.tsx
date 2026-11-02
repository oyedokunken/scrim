import { Button, Dialog } from '../../ui';

export interface RerenderChoiceProps {
  open: boolean;
  /** The recording's name, so the person knows which video is meant. */
  name: string;
  onReplace: () => void;
  onSaveNew: () => void;
  onKeep: () => void;
}

/**
 * Asked when edits to a recording that already has a video were saved: write over that video, or
 * keep it and save a second one. Either way the recording itself is never changed.
 */
export function RerenderChoice({ open, name, onReplace, onSaveNew, onKeep }: RerenderChoiceProps) {
  return (
    <Dialog open={open} title="Make the video again?" onClose={onKeep} className="ui-confirm">
      <div className="ui-confirm-body">
        <p>
          Your edits to {name} are saved. Replace the video to use them, or save them as a new video
          and keep the one you have.
        </p>
      </div>
      <div className="ui-confirm-actions">
        <Button data-autofocus onClick={onKeep}>
          Not now
        </Button>
        <Button onClick={onSaveNew}>Save as a new video</Button>
        <Button variant="primary" onClick={onReplace}>
          Replace the video
        </Button>
      </div>
    </Dialog>
  );
}
