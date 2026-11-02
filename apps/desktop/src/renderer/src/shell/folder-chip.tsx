import { FolderOpen } from 'lucide-react';

export interface FolderChipProps {
  /** The folder shown, for example Videos\Scrim. */
  path: string;
  onChoose: () => void;
}

/** Where files are saved, at the right of the page title. Pressing it opens the folder dialog. */
export function FolderChip({ path, onChoose }: FolderChipProps) {
  return (
    <button
      type="button"
      className="folder-chip"
      aria-label={`Save to ${path}. Change folder`}
      onClick={onChoose}
    >
      <FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="folder-chip-path">{path}</span>
    </button>
  );
}
