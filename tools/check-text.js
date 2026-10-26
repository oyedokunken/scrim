// Scans every tracked or new, non ignored text file for the rules in tools/text-rules.js and fails when it finds any.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { EXEMPT_FILES, findTextProblems } from './text-rules.js';

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\0')
  .filter((file) => file !== '' && !EXEMPT_FILES.has(file));

let failures = 0;
for (const file of files) {
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue; // Deleted in the working tree but not yet staged.
  }
  if (buffer.includes(0)) {
    continue; // Binary file.
  }
  for (const { line, rule } of findTextProblems(buffer.toString('utf8'))) {
    console.error(`${file}:${String(line)}  ${rule}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(
    `\nText guard failed with ${String(failures)} problem(s). See CLAUDE.md, hard rule 2 and 3.`,
  );
  process.exit(1);
}
console.log(`Text guard passed for ${String(files.length)} files.`);
