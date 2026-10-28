import { flipFuses } from '@electron/fuses';
import type { AfterPackContext } from 'electron-builder';
import { join } from 'node:path';
import { toFlipConfig } from './fuses.mts';

/** The executable electron-builder just produced, per platform. */
function executablePath(context: AfterPackContext): string {
  const name = context.packager.appInfo.productFilename;
  switch (context.electronPlatformName) {
    case 'win32':
      return join(context.appOutDir, `${name}.exe`);
    case 'darwin':
      return join(context.appOutDir, `${name}.app`);
    default: {
      // Only the Linux packager carries an executable name. Fall back to the product name.
      const { packager } = context;
      const executable =
        'executableName' in packager && typeof packager.executableName === 'string'
          ? packager.executableName
          : name;
      return join(context.appOutDir, executable);
    }
  }
}

/** Flips the fuses before any signing step, because flipping changes the binary. */
export async function afterPack(context: AfterPackContext): Promise<void> {
  await flipFuses(executablePath(context), toFlipConfig());
}
