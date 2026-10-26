import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { diffFuses, parseFuseReport } from './fuses.mts';

// Usage: node build/verify-fuses.mts <path to the packaged executable or .app>
const target = process.argv[2];
if (!target) {
  console.error('Usage: node build/verify-fuses.mts <path to the packaged app>');
  process.exit(2);
}

// Run the fuses CLI with this same Node, so no shell is involved.
const cli = join(dirname(createRequire(import.meta.url).resolve('@electron/fuses')), 'bin.js');
const report = execFileSync(process.execPath, [cli, 'read', '--app', target], {
  encoding: 'utf8',
});
const problems = diffFuses(parseFuseReport(report));
if (problems.length > 0) {
  console.error(`Fuses in ${target} do not match build/fuses.mts:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Fuses in ${target} match build/fuses.mts.`);
