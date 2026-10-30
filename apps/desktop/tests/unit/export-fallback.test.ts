import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { exportRecording } from '../../src/main/export/exporter';
import { cursorPaintFor } from '../../src/main/export/look';
import { renderStyleFromSettings } from '../../src/shared/render-style';
import { runProcess } from '../../src/main/recording/ffmpeg';
import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { ExportRequest } from '../../src/main/export/types';
import { makeFixture, testFfmpeg } from './support/export-fixture';
import type { Fixture } from './support/export-fixture';

// Windows Controlled folder access answers EPERM when an app it does not know creates a file in a
// protected folder. This makes the first folder do exactly that, and leaves every other write alone.
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    writeFile: (path: string, ...rest: unknown[]) => {
      if (path.includes('protected-folder')) {
        return Promise.reject(Object.assign(new Error('blocked'), { code: 'EPERM' }));
      }
      return (real['writeFile'] as (...args: unknown[]) => Promise<void>)(path, ...rest);
    },
  };
});

const tools = testFfmpeg();
const made: Fixture[] = [];
afterAll(() => {
  for (const fixture of made) rmSync(fixture.root, { recursive: true, force: true });
});

function requestFor(fixture: Fixture, overrides: Partial<ExportRequest>): ExportRequest {
  return {
    folder: fixture.folder,
    outputDir: join(fixture.root, 'protected-folder'),
    collision: 'number',
    settings: {
      preset: 'source',
      fps: 30,
      quality: 'medium',
      keepAudio: true,
      micGain: 1,
      shadow: true,
    },
    style: renderStyleFromSettings({ ...DEFAULT_SETTINGS }),
    paint: cursorPaintFor('brand'),
    ...overrides,
  };
}

describe.skipIf(tools === undefined)('export into a folder Windows protects', () => {
  const deps = () => {
    if (tools === undefined) throw new Error('no tools');
    return { paths: tools, run: runProcess, log: () => undefined };
  };

  it('saves into the app folder instead, and says so', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 1 });
    made.push(fixture);
    const own = join(fixture.root, 'own');
    const outcome = await exportRecording(deps(), requestFor(fixture, { fallbackDir: own }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.fellBack).toBe(true);
    expect(outcome.note).toContain('Controlled folder access');
    expect(readdirSync(own).filter((name) => name.endsWith('.mp4'))).toHaveLength(1);
    expect(existsSync(join(fixture.root, 'protected-folder', 'x'))).toBe(false);
  }, 120_000);

  it('fails with the steps to allow Scrim when there is no app folder to use', async () => {
    if (tools === undefined) return;
    const fixture = makeFixture(tools, { seconds: 1 });
    made.push(fixture);
    const outcome = await exportRecording(deps(), requestFor(fixture, {}));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('folder-unwritable');
    expect(outcome.error.nextStep).toContain('Controlled folder access');
  }, 120_000);
});
