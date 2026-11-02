import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const here = createRequire(__filename);
// axe-core is a dependency of @axe-core/playwright, so it is resolved from there.
const axeSource = readFileSync(
  createRequire(here.resolve('@axe-core/playwright')).resolve('axe-core/axe.min.js'),
  'utf8',
);

interface AxeResult {
  violations: { id: string; nodes: { target: unknown[] }[] }[];
}

/**
 * Runs axe-core inside the page. The packaged page forbids eval and Electron cannot open the
 * extra page that the Playwright integration wants, so the script goes in through the debugger.
 */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    (globalThis as unknown as { axe: { run: () => Promise<AxeResult> } }).axe.run(),
  );
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => String(n.target)).join(' | ')}`,
  );
}
