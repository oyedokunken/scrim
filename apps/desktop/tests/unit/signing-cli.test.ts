import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../../build/signing-cli.mts', import.meta.url));
const workflow = readFileSync(
  fileURLToPath(new URL('../../../../.github/workflows/release.yml', import.meta.url)),
  'utf8',
);

/** Runs the command with only the given variables, so the machine's own settings never leak in. */
function run(env: Record<string, string>, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', ...env },
  });
}

const SIGNPATH = {
  SIGNPATH_API_TOKEN: 't',
  SIGNPATH_ORGANIZATION_ID: 'o',
  SIGNPATH_PROJECT_SLUG: 'p',
  SIGNPATH_SIGNING_POLICY_SLUG: 's',
};

describe('signing-cli', () => {
  it('warns and succeeds for an unsigned local build, saying it is unsigned', () => {
    const result = run({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('UNSIGNED');
  });

  it('fails when signing is required and nothing is configured', () => {
    const result = run({ REQUIRE_WINDOWS_SIGNING: 'true' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('required');
  });

  it('succeeds when signing is required and SignPath is configured', () => {
    expect(run({ REQUIRE_WINDOWS_SIGNING: 'true', ...SIGNPATH }).status).toBe(0);
  });

  it('accepts --dry-run and says the service is not called', () => {
    const result = run(SIGNPATH, '--dry-run');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dry run');
  });
});

describe('the release workflow', () => {
  it('reads the require variable and offers a dry run that publishes nothing', () => {
    expect(workflow).toContain('vars.REQUIRE_WINDOWS_SIGNING');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toMatch(/publish:[\s\S]*?if: github\.event_name == 'push'/);
  });

  it('signs the app, builds the installer from it, then signs the installer', () => {
    const order = [
      'node build/signing-targets.mts stage',
      'Sign the programs with SignPath',
      'restore signing/app-signed release/win-unpacked --expect-changed',
      '--prepackaged release/win-unpacked',
      'Sign the installer with SignPath',
      'refresh-update-info.mts --check',
      'Verify the signatures',
      'Refuse an unsigned installer',
    ].map((marker) => workflow.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('never calls the signing service in a dry run', () => {
    const signSteps = workflow
      .split('\n      - name: ')
      .filter((step) => step.includes('submit-signing-request'));
    expect(signSteps).toHaveLength(2);
    for (const step of signSteps) expect(step).toContain("steps.sign.outputs.dry_run != 'true'");
  });
});
