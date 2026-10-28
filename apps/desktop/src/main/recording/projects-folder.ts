import { join } from 'node:path';

/**
 * The folder that holds every recording's working folder (`<name>.scrim`: raw tracks, logs, the
 * session file, the edit list). It is the app's own data, not the person's: finished exports and
 * screenshots go to the folder they chose, and nothing else does. On Windows it is
 * `%LOCALAPPDATA%\Scrim\Projects`. Elsewhere it sits in the app's user data folder.
 */
export function projectsRoot(input: {
  platform: NodeJS.Platform;
  env: Readonly<Record<string, string | undefined>>;
  userData: string;
}): string {
  const local = input.env['LOCALAPPDATA'];
  if (input.platform === 'win32' && local !== undefined && local !== '') {
    return join(local, 'Scrim', 'Projects');
  }
  return join(input.userData, 'Projects');
}
