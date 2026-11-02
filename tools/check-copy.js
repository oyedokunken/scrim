// Fails when the site copy, the readme, the changelog or the docs sound unreleased.
// See tools/copy-rules.js for the phrases and the opt out marker.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findCopyProblems, isScanned } from './copy-rules.js';

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)
  .split('\0')
  .filter((file) => file !== '' && isScanned(file));

let failures = 0;
for (const file of files) {
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue;
  }
  if (buffer.includes(0)) {
    continue;
  }
  for (const { line, phrase } of findCopyProblems(buffer.toString('utf8'))) {
    console.error(`${file}:${String(line)}  unreleased wording: "${phrase}"`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\nCopy guard failed with ${String(failures)} problem(s). Write in present tense.`);
  process.exit(1);
}
console.log(`Copy guard passed for ${String(files.length)} files.`);
