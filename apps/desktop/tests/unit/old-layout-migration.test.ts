import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHarness, flushWork, type Harness } from './support/engine-harness';

/**
 * Before commit 4cf89cb a session folder was made inside the export folder (Videos\Scrim). Now
 * working files go to the projects folder. People who recorded with the old layout must still see
 * their unfinished sessions, recover them, and lose nothing: the folder stays where it is.
 */
let harness: Harness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

/** A crashed recording, then moved into the export folder as the old layout had it. */
async function oldLayoutSession(): Promise<{ h: Harness; folder: string }> {
  const h = await createHarness();
  harness = h;
  const started = await h.service.start({ ...h.options, name: 'Old' });
  if (!started.ok) throw new Error('start failed');
  h.sendChunk('screen', 300, 9);
  h.sendChunk('screen', 300, 9);
  h.clock.time += 800;
  h.fireHeartbeat();
  await flushWork();
  h.page.die('crashed');
  await flushWork();
  await flushWork();
  await mkdir(h.destination, { recursive: true });
  const folder = join(h.destination, 'Old.scrim');
  await rename(started.value.folder, folder);
  await h.deps.index.remove(started.value.folder);
  await h.deps.index.add(folder);
  return { h, folder };
}

describe('a session folder from the old layout', () => {
  it('is found by the index and offered for recovery from where it is', async () => {
    const { h, folder } = await oldLayoutSession();
    const found = await h.service.listRecoverable();
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ folder, name: 'Old', bytes: 600 });
  });

  it('recovers in place, keeps the raw file byte for byte, and moves or deletes nothing', async () => {
    const { h, folder } = await oldLayoutSession();
    const before = await readFile(join(folder, 'screen.raw.webm'));
    const namesBefore = (await readdir(folder)).sort();
    const exportFolderBefore = await readdir(h.destination);

    const result = await h.service.recover(folder);
    expect(result.ok).toBe(true);

    expect(await readFile(join(folder, 'screen.raw.webm'))).toEqual(before);
    const namesAfter = await readdir(folder);
    // Only the mouse log is replaced, by its verified converted copy, as in any recovery.
    for (const name of namesBefore.filter((entry) => entry !== 'input.ndjson')) {
      expect(namesAfter).toContain(name);
    }
    expect(namesAfter).toContain('screen.mp4');
    expect(await readdir(h.destination)).toEqual(exportFolderBefore);
    // Nothing was copied into the projects folder.
    await expect(readdir(h.projects)).resolves.toEqual([]);
    expect(await h.service.listRecoverable()).toEqual([]);
  });

  it('is not offered again once it is recovered, and a folder that went missing is skipped', async () => {
    const { h, folder } = await oldLayoutSession();
    await h.deps.index.add(join(h.dir, 'Gone.scrim'));
    expect((await h.service.listRecoverable()).map((entry) => entry.folder)).toEqual([folder]);
    await h.service.recover(folder);
    expect(await h.service.listRecoverable()).toEqual([]);
  });
});
