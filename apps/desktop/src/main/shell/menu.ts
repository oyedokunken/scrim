import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * The application menu. Windows and Linux have none: the default Electron menu (File, Edit,
 * View, Window, Help) is not ours and exposes developer tools. macOS needs a real menu, with
 * Scrim, Edit (so copy and paste work), Window and Quit on Cmd+Q.
 */
export function buildMenuTemplate(
  platform: NodeJS.Platform,
  appName: string,
): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null;
  return [
    {
      label: appName,
      submenu: [
        { role: 'about', label: `About ${appName}` },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${appName}`, accelerator: 'Command+Q' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
}

export function applyApplicationMenu(platform: NodeJS.Platform, appName: string): void {
  const template = buildMenuTemplate(platform, appName);
  Menu.setApplicationMenu(template === null ? null : Menu.buildFromTemplate(template));
}
