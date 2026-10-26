import { execFileSync } from 'node:child_process';
import { expect, test } from './fixtures';

// Asks Windows for the icon the main window really carries (WM_GETICON, small and big) and reads
// one pixel from the tile, above the brackets. The brand tile is green. Electron's default icon
// is not, so this fails if a window falls back to it. Needs the main process, so built app only.
test.skip(process.platform !== 'win32', 'Reads the Windows window icon');

const SCRIPT = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class IconProbe { [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l); }
"@
$h = [IntPtr]::new([int64]$env:SCRIM_HWND)
foreach ($kind in 0, 1) {
  $handle = [IconProbe]::SendMessage($h, 0x7F, [IntPtr]$kind, [IntPtr]::Zero)
  if ($handle -eq [IntPtr]::Zero) { Write-Output "$kind,none"; continue }
  $bmp = [System.Drawing.Icon]::FromHandle($handle).ToBitmap()
  $px = $bmp.GetPixel([int]($bmp.Width / 2), [int][Math]::Round($bmp.Height * 0.15))
  Write-Output "$kind,$($bmp.Width),$($px.R),$($px.G),$($px.B),$($px.A)"
}
`;

test('the main window carries the brand icon, not the Electron default', async ({ app }) => {
  const hwnd = await app.evaluate(({ BrowserWindow }) => {
    const handle = BrowserWindow.getAllWindows()[0]?.getNativeWindowHandle();
    return handle ? handle.readBigUInt64LE(0).toString() : '';
  });
  expect(hwnd).not.toBe('');

  const output = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, SCRIM_HWND: hwnd },
  });
  const rows = output
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim().split(','));
  expect(rows).toHaveLength(2);

  for (const row of rows) {
    expect(row[1], `icon kind ${row[0] ?? '?'} is missing`).not.toBe('none');
    const [red, green, blue, alpha] = row.slice(2).map(Number);
    // The brand green is 0, 78, 82. Allow for scaling and anti-aliasing.
    expect(Math.abs((red ?? 255) - 0)).toBeLessThan(16);
    expect(Math.abs((green ?? 0) - 78)).toBeLessThan(16);
    expect(Math.abs((blue ?? 0) - 82)).toBeLessThan(16);
    expect(alpha).toBe(255);
  }
});
