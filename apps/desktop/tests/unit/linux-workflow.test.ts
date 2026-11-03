import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8');

const e2e = read('.github/workflows/e2e-desktop.yml');
const linuxJob = e2e.slice(e2e.indexOf('\n  linux:'), e2e.indexOf('\n  macos:'));
const release = read('.github/workflows/release.yml');
const releaseLinux = release.slice(release.indexOf('\n  linux:'), release.indexOf('\n  publish:'));

/** Text checks only. The YAML cannot run on this machine, so these keep its steps from drifting. */
describe('the Linux CI job', () => {
  it('marks the steps that have never run', () => {
    expect(linuxJob).toContain('NEW and has never run');
    expect(linuxJob.match(/# NEW\./g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('runs the unit tests, packaging, the fuse read back and the encode check', () => {
    for (const text of [
      'pnpm typecheck',
      'pnpm test',
      'node scripts/check-encode.mts',
      'electron-builder --linux AppImage deb --x64',
      'pnpm verify:fuses release/linux-unpacked/scrim',
      'xvfb-run --auto-servernum',
    ]) {
      expect(linuxJob).toContain(text);
    }
  });

  it('starts the installed app without --no-sandbox and checks the uninstall', () => {
    const launch = linuxJob.slice(linuxJob.indexOf('Install the deb'));
    expect(launch).toContain('xvfb-run --auto-servernum bash -c');
    expect(launch).toContain("'scrim > ");
    expect(launch).toContain('test -f /etc/apparmor.d/scrim');
    expect(launch).toContain('sudo apt-get remove -y scrim');
    expect(launch).toContain('test ! -e /etc/apparmor.d/scrim');
    expect(launch).toContain('test ! -e /opt/Scrim');
    // The only --no-sandbox in the file is the existing end to end step, whose comment says so.
    expect(launch).not.toContain('--no-sandbox');
    expect(launch).not.toContain('disable-setuid-sandbox');
  });

  it('stays allowed to fail until it has run once, and keeps Windows as the gate', () => {
    expect(linuxJob).toContain('continue-on-error: true');
    expect(e2e).toMatch(/\n {2}windows:\n {4}runs-on: windows-latest/);
  });
});

describe('the Linux release job', () => {
  it('builds on an Ubuntu runner for x64 only, and reads the fuses back', () => {
    expect(releaseLinux).toContain('runs-on: ubuntu-24.04');
    expect(releaseLinux).toContain('--linux AppImage deb --x64');
    expect(releaseLinux).toContain('pnpm verify:fuses release/linux-unpacked/scrim');
    expect(releaseLinux).not.toContain('--arm64');
  });

  it('uploads the update file with the AppImage and the signatures', () => {
    expect(releaseLinux).toContain('apps/desktop/release/latest-linux.yml');
    expect(releaseLinux).toContain('apps/desktop/release/*.AppImage');
    expect(releaseLinux).toContain('apps/desktop/release/*.asc');
  });

  it('never passes the sandbox off flag', () => {
    expect(release).not.toContain('--no-sandbox');
  });
});
