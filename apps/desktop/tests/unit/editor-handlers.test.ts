import { emptyEditList, sessionFileSchema } from '@scrim/core';
import { describe, expect, it, vi } from 'vitest';
import { createEditorHandlers, type EditorDeps } from '../../src/main/editor/editor-handlers';
import { editorContract } from '../../src/shared/editor-contract';

const session = sessionFileSchema.parse({
  version: 1,
  id: '6b6f8f64-8f6e-4a4a-9d3a-111111111111',
  name: 'Take 1',
  createdAt: '2026-10-28T10:00:00.000Z',
  app: { version: '1.0.0', os: 'windows', arch: 'x64' },
  pid: 1,
  source: { kind: 'display', origin: { x: 0, y: 0 }, scaleFactor: 1 },
  capture: { cursorInCapture: true },
  tracks: [
    {
      kind: 'screen',
      file: 'screen.webm',
      mimeType: 'video/webm',
      startedAt: 0,
      bytesWritten: 1,
      complete: true,
    },
    {
      kind: 'mic',
      file: 'mic.webm',
      mimeType: 'audio/webm',
      startedAt: 5,
      bytesWritten: 1,
      complete: true,
    },
  ],
  clock: { rendererOffsetMs: 0, uncertaintyMs: 0 },
  pauses: [],
  input: { status: 'unavailable', reason: 'error' },
  warnings: [],
  heartbeatAt: '2026-10-28T10:01:00.000Z',
  heartbeatElapsedMs: 1000,
  cleanClose: true,
});

const FOLDER = 'C:\\Projects\\Take 1.scrim';

function setup(overrides: Partial<EditorDeps> = {}) {
  const deps: EditorDeps = {
    loadSource: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        source: {
          session,
          log: null,
          edits: emptyEditList(),
          files: { screen: `${FOLDER}\\screen.webm`, mic: `${FOLDER}\\mic.webm` },
        },
      }),
    ),
    writeEdits: vi.fn(() => Promise.resolve()),
    isKnownFolder: (folder) => folder === FOLDER,
    ...overrides,
  };
  return { ...createEditorHandlers(deps), deps };
}

describe('editor:open', () => {
  it('opens a known folder with an address for each track and no path', async () => {
    const { handlers } = setup();
    const result = await handlers['editor:open']({ folder: FOLDER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Take 1');
    expect(result.value.media.screen).toMatch(/^scrim-media:\/\/p\/[0-9a-f-]+\/screen$/);
    expect(result.value.media.mic).toMatch(/\/mic$/);
    expect(result.value.media.camera).toBeUndefined();
    expect(result.value.edits).toEqual({ trim: null, cuts: [] });
    expect(JSON.stringify(result.value.media)).not.toContain('Projects');
    expect(editorContract['editor:open'].output.safeParse(result).success).toBe(true);
  });

  it('keeps the token to the folder and track it names', async () => {
    const { handlers, resolve } = setup();
    const result = await handlers['editor:open']({ folder: FOLDER });
    if (!result.ok) throw new Error('open failed');
    const token = result.value.media.screen.split('/')[3] ?? '';
    expect(resolve(token)).toEqual({ folder: FOLDER, kind: 'screen' });
    expect(resolve('made-up')).toBeUndefined();
  });

  it('refuses a folder Scrim did not make, without reading it', async () => {
    const { handlers, deps } = setup();
    const result = await handlers['editor:open']({ folder: 'C:\\Windows' });
    expect(result.ok).toBe(false);
    expect(deps.loadSource).not.toHaveBeenCalled();
  });

  it.each(['missing', 'invalid', 'no-screen'] as const)(
    'explains a %s recording',
    async (reason) => {
      const { handlers } = setup({ loadSource: () => Promise.resolve({ ok: false, reason }) });
      const result = await handlers['editor:open']({ folder: FOLDER });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message.length).toBeGreaterThan(10);
      expect(result.error.nextStep.length).toBeGreaterThan(10);
    },
  );
});

describe('editor:save-edits', () => {
  const edits = { trim: { startMs: 100, endMs: 900 }, cuts: [{ startMs: 200, endMs: 300 }] };

  it('writes the edit list with its version, only for a known folder', async () => {
    const { handlers, deps } = setup();
    expect((await handlers['editor:save-edits']({ folder: FOLDER, edits })).ok).toBe(true);
    expect(deps.writeEdits).toHaveBeenCalledWith(FOLDER, { version: 1, ...edits });
    expect((await handlers['editor:save-edits']({ folder: 'C:\\Other', edits })).ok).toBe(false);
    expect(deps.writeEdits).toHaveBeenCalledTimes(1);
  });

  it('says so when the disk refuses', async () => {
    const { handlers } = setup({
      writeEdits: () => Promise.reject(new Error('EACCES C:\\secret')),
    });
    const result = await handlers['editor:save-edits']({ folder: FOLDER, edits });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).not.toContain('secret');
  });

  it('rejects edits that are not an edit list', () => {
    const { input } = editorContract['editor:save-edits'];
    expect(input.safeParse({ folder: FOLDER, edits }).success).toBe(true);
    expect(
      input.safeParse({ folder: FOLDER, edits: { trim: null, cuts: [{ startMs: 5, endMs: 5 }] } })
        .success,
    ).toBe(false);
    expect(input.safeParse({ folder: FOLDER, edits: { ...edits, extra: 1 } }).success).toBe(false);
  });
});
