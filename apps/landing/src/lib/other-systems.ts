import type { Os } from './platform';

type SupportedOs = Exclude<Os, 'unsupported'>;

/**
 * The two systems to offer beside the main download button: every system except the visitor's own.
 * Before the system is known (the server render, no JavaScript) Windows is the main button, so the
 * other two are Linux and macOS.
 */
export function otherSystems(current: Os | null): readonly [SupportedOs, SupportedOs] {
  switch (current) {
    case 'linux':
      return ['windows', 'macos'];
    case 'macos':
      return ['windows', 'linux'];
    default:
      return ['linux', 'macos'];
  }
}
