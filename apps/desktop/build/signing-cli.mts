// Run by the release workflow before packaging. Prints the signing decision, writes it to the job
// outputs and the job summary, and never fails: an unsigned build is allowed, a silent one is not.
import { appendFileSync } from 'node:fs';
import { decideSigning } from './signing.mts';

const decision = decideSigning(process.env);
const output = process.env['GITHUB_OUTPUT'];
const summary = process.env['GITHUB_STEP_SUMMARY'];

if (output) {
  appendFileSync(output, `mode=${decision.mode}\nenabled=${String(decision.enabled)}\n`);
}
if (summary) {
  appendFileSync(summary, `### Windows signing\n\n${decision.message}\n`);
}
console.log(decision.enabled ? decision.message : `::warning::${decision.message}`);
