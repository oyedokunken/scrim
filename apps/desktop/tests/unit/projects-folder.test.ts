import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { projectsRoot } from '../../src/main/recording/projects-folder';

describe('projectsRoot', () => {
  it('is Scrim Projects under the local app data folder on Windows', () => {
    expect(
      projectsRoot({
        platform: 'win32',
        env: { LOCALAPPDATA: 'C:/Users/me/AppData/Local' },
        userData: 'C:/Users/me/AppData/Roaming/Scrim',
      }),
    ).toBe(join('C:/Users/me/AppData/Local', 'Scrim', 'Projects'));
  });

  it('falls back to the user data folder when the variable is missing or on other systems', () => {
    expect(projectsRoot({ platform: 'win32', env: {}, userData: '/data/Scrim' })).toBe(
      join('/data/Scrim', 'Projects'),
    );
    expect(
      projectsRoot({ platform: 'linux', env: { LOCALAPPDATA: 'x' }, userData: '/data/Scrim' }),
    ).toBe(join('/data/Scrim', 'Projects'));
  });
});
