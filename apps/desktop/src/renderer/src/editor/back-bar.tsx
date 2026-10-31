import { ArrowLeft } from 'lucide-react';
import { Button } from '../../ui';

/** The one way out of an editor: back to the page the person came from. It is always shown. */
export function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="editor-back-bar">
      <Button icon={<ArrowLeft size={16} strokeWidth={1.75} />} onClick={onBack}>
        Back
      </Button>
    </div>
  );
}
