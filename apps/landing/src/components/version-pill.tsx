import styles from './version-pill.module.css';

interface VersionPillProps {
  /** The latest release number such as "1.1.0", or null when it is not known. */
  version: string | null;
  /** Colors for a dark background, for the footer. */
  onDark?: boolean;
}

/** A small pill with the current version. It renders nothing when no release is known. */
export function VersionPill({ version, onDark = false }: VersionPillProps) {
  if (version === null) {
    return null;
  }
  const clean = version.replace(/^v/i, '');
  return (
    <span className={`${styles.pill} ${onDark ? styles.dark : ''}`.trim()}>
      <span className="visually-hidden">Version </span>v{clean}
    </span>
  );
}
