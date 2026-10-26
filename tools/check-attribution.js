// Reads text from a file path (or stdin when none is given) and fails when it carries
// AI attribution. Used by the commit-policy workflow for PR titles, bodies and commits.
import { readFileSync } from 'node:fs';
import { findAttribution } from './commit-policy.js';

const source = process.argv[2];
const text = readFileSync(source ?? 0, 'utf8');
const problems = findAttribution(text);

if (problems.length > 0) {
  console.error(`Attribution policy failed: ${problems.join('; ')}.`);
  process.exit(1);
}
