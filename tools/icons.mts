import { spawnSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { readMark, renderMarkModule } from '../packages/tokens/scripts/mark-source.mts';

// One command regenerates everything built from the brand svg:
//   the geometry module the landing page imports,
//   the landing favicon svg, and
//   every desktop icon (ico, icns, png, tray).
// CI runs this and fails on any git diff, so the committed files cannot drift from the source.
const root = new URL('../', import.meta.url);
const source = new URL('packages/tokens/brand/scrim-mark.svg', root);

writeFileSync(new URL('packages/tokens/src/mark.ts', root), renderMarkModule(readMark(source)));
copyFileSync(source, new URL('apps/landing/src/app/icon.svg', root));

const result = spawnSync('pnpm', ['--filter', '@scrim/desktop', 'icons'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
