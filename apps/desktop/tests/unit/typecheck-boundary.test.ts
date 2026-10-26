import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const configPath = join(__dirname, '../../tsconfig.node.json');

function diagnosticsFor(source: string): string[] {
  const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath));
  const dir = mkdtempSync(join(tmpdir(), 'scrim-boundary-'));
  const file = join(dir, 'probe.ts');
  try {
    writeFileSync(file, source);
    const program = ts.createProgram([file], { ...parsed.options, composite: false, noEmit: true });
    return ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('main and preload typecheck without the DOM', () => {
  it('rejects a reference to window', () => {
    expect(diagnosticsFor('export const w = window.innerWidth;').join('\n')).toContain(
      "Cannot find name 'window'",
    );
  });

  it('rejects a reference to document', () => {
    expect(diagnosticsFor('export const d = document.title;').join('\n')).toContain(
      "Cannot find name 'document'",
    );
  });

  it('accepts plain Node code', () => {
    expect(
      diagnosticsFor("import { join } from 'node:path';\nexport const p = join('a', 'b');"),
    ).toEqual([]);
  });
});
