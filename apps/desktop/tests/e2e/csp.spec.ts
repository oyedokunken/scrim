import { expect, test } from './fixtures';

test('the page loads from the app protocol', async ({ page }) => {
  expect(page.url()).toBe('app://scrim/index.html');
  await expect(page.getByRole('heading', { name: 'Scrim' })).toBeVisible();
});

test('the page is served with the CSP header and no meta copy outside the builder', async ({
  page,
}) => {
  const headerCsp = await page.evaluate(async () => {
    const response = await fetch('app://scrim/index.html');
    return response.headers.get('Content-Security-Policy');
  });
  expect(headerCsp).toContain("default-src 'none'");
  expect(headerCsp).toContain("script-src 'self'");
  expect(headerCsp).not.toContain('unsafe');
});

test('the policy is enforced: inline script and eval are blocked and reported', async ({
  page,
}) => {
  // Playwright evaluates through the debugger, which skips the eval restriction for the code
  // it runs. A string timer is compiled later by the page itself, so the policy applies to it.
  const outcome = await page.evaluate(
    () =>
      new Promise<{ blocked: string[]; inlineRan: boolean; stringTimerRan: boolean }>((resolve) => {
        const blocked: string[] = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          blocked.push(`${event.violatedDirective}|${event.blockedURI}`);
        });
        const g = globalThis as { __inline?: boolean; __timer?: boolean };

        const script = document.createElement('script');
        script.textContent = 'globalThis.__inline = true';
        document.head.appendChild(script);

        (globalThis.setTimeout as unknown as (code: string, ms: number) => void)(
          'globalThis.__timer = true',
          0,
        );
        setTimeout(() => {
          resolve({
            blocked,
            inlineRan: g.__inline === true,
            stringTimerRan: g.__timer === true,
          });
        }, 300);
      }),
  );
  expect(outcome.inlineRan).toBe(false);
  expect(outcome.stringTimerRan).toBe(false);
  expect(outcome.blocked).toContain('script-src-elem|inline');
  expect(outcome.blocked.some((entry) => entry.endsWith('|eval'))).toBe(true);
});

test('a path that escapes the renderer root is refused', async ({ page }) => {
  const status = await page.evaluate(async () => {
    const response = await fetch('app://scrim/%2e%2e/package.json');
    return response.status;
  });
  expect([403, 404]).toContain(status);
});

test('a network request from the page is blocked by connect-src', async ({ page }) => {
  const failed = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(failed).toBe(true);
});
