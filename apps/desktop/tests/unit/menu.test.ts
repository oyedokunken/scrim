import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() } }));
const { buildMenuTemplate } = await import('../../src/main/shell/menu');

const submenu = (index: number): MenuItemConstructorOptions[] =>
  (buildMenuTemplate('darwin', 'Scrim')?.[index]?.submenu ?? []) as MenuItemConstructorOptions[];

describe('application menu', () => {
  it.each(['win32', 'linux', 'freebsd'] as const)('has none on %s', (platform) => {
    expect(buildMenuTemplate(platform, 'Scrim')).toBeNull();
  });

  it('has Scrim, Edit and Window on macOS', () => {
    expect(buildMenuTemplate('darwin', 'Scrim')?.map((menu) => menu.label)).toEqual([
      'Scrim',
      'Edit',
      'Window',
    ]);
  });

  it('puts Quit on Cmd+Q in the Scrim menu', () => {
    const quit = submenu(0).find((item) => item.role === 'quit');
    expect(quit?.accelerator).toBe('Command+Q');
    expect(quit?.label).toBe('Quit Scrim');
  });

  it('has copy and paste in Edit, so shortcuts work in text fields', () => {
    expect(submenu(1).map((item) => item.role)).toEqual(
      expect.arrayContaining(['cut', 'copy', 'paste', 'selectAll', 'undo', 'redo']),
    );
  });

  it('has minimize and zoom in Window', () => {
    expect(submenu(2).map((item) => item.role)).toEqual(['minimize', 'zoom', 'close']);
  });
});
