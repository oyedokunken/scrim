import { test } from '@playwright/test';

// Takes review screenshots of each section at all three widths. Run on demand:
//   SCREENSHOTS=1 pnpm exec playwright test screenshots
// Animation is frozen through reduced motion, so the hero shows its still, zoomed frame.
// Images go to test-results/screenshots, which git ignores.
test.skip(process.env.SCREENSHOTS !== '1', 'Set SCREENSHOTS=1 to take review screenshots.');
test.use({ reducedMotion: 'reduce' });

const SECTIONS: [string, string][] = [
  ['hero', 'section[aria-labelledby="hero-title"]'],
  ['features', '#features'],
  ['use-cases', '#use-cases'],
  ['download', '#download'],
  ['faq', '#faq'],
  ['contribute', '#contribute'],
  ['contact', '#contact'],
  ['cta', 'section[aria-labelledby="cta-title"]'],
];

for (const [name, selector] of SECTIONS) {
  test(`screenshot of ${name}`, async ({ page }, testInfo) => {
    await page.goto('/');
    const section = page.locator(selector).first();
    test.skip((await section.count()) === 0, `${name} is not built yet`);
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await section.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-${name}.png`,
      animations: 'disabled',
    });
  });
}
