import { describe, expect, it, vi } from 'vitest';
import { createShare } from '../../src/main/share/share';
import { WINDOWS_SHARE_SCRIPT } from '../../src/main/share/windows-share-script';

vi.mock('electron', () => ({ BrowserWindow: {}, ShareMenu: vi.fn(), screen: {} }));

function deps(platform: NodeJS.Platform) {
  return {
    platform,
    anchor: () => ({ x: 100.4, y: 200.6 }),
    runPowerShell: vi.fn(() => Promise.resolve()),
    showMenu: vi.fn(),
  };
}

describe('share', () => {
  it('opens the Windows share sheet with the path in the environment, never in the script', async () => {
    const d = deps('win32');
    const share = createShare(d);
    await share?.('C:/Videos/Take 1.mp4');
    expect(d.runPowerShell).toHaveBeenCalledWith(WINDOWS_SHARE_SCRIPT, {
      SCRIM_SHARE_PATH: 'C:/Videos/Take 1.mp4',
      SCRIM_SHARE_X: '100',
      SCRIM_SHARE_Y: '201',
    });
    expect(WINDOWS_SHARE_SCRIPT).not.toContain('Take 1');
  });

  it('passes a failure of the helper on', async () => {
    const d = deps('win32');
    d.runPowerShell.mockRejectedValueOnce(new Error('no share'));
    await expect(createShare(d)?.('a.mp4')).rejects.toThrow('no share');
  });

  it('opens the share menu on macOS', async () => {
    const d = deps('darwin');
    await createShare(d)?.('/Users/a/Take.mp4');
    expect(d.showMenu).toHaveBeenCalledWith('/Users/a/Take.mp4');
  });

  it('has no share on Linux, so the button stays hidden', () => {
    expect(createShare(deps('linux'))).toBeNull();
  });
});
