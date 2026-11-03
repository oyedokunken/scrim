// Run by the release workflow before packaging. Prints the signing decision, writes it to the job
// outputs and the job summary, and fails only when signing is required (REQUIRE_WINDOWS_SIGNING)
// and cannot happen. An unsigned build is allowed when not required, a silent one is not.
//   node build/signing-cli.mts [--dry-run]
import { appendFileSync } from 'node:fs';
import { decideSigning, windowsPublisher } from './signing.mts';

const decision = decideSigning(process.env, process.argv.includes('--dry-run'));
const publisher = windowsPublisher(process.env);
const output = process.env['GITHUB_OUTPUT'];
const summary = process.env['GITHUB_STEP_SUMMARY'];
const inCi = (process.env['GITHUB_ACTIONS'] ?? '') !== '';

if (output) {
  appendFileSync(
    output,
    [
      `mode=${decision.mode}`,
      `enabled=${String(decision.enabled)}`,
      `dry_run=${String(decision.dryRun)}`,
      `required=${String(decision.required)}`,
      `publisher=${publisher}`,
      '',
    ].join('\n'),
  );
}
if (summary) {
  appendFileSync(summary, `### Windows signing\n\n${decision.message}\n`);
}
if (decision.failure !== null) {
  console.error(inCi ? `::error::${decision.failure}` : decision.failure);
  process.exitCode = 1;
} else if (decision.enabled) {
  console.log(decision.message);
} else {
  console.log(inCi ? `::warning::${decision.message}` : decision.message);
}
