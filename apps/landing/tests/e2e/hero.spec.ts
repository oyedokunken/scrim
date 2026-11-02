import { expect, test, type Locator, type Page } from '@playwright/test';
import { MASTER_DURATION_MS, SEGMENTS, type Scene } from '@/lib/demo/master';

const segment = (id: Scene) => SEGMENTS.find((entry) => entry.id === id) ?? SEGMENTS[0];
/** A point well inside a chapter, as a share of the whole video, for clicking the timeline. */
const shareOf = (id: Scene) =>
  ((segment(id)?.start ?? 0) + 0.7 * ((segment(id)?.end ?? 0) - (segment(id)?.start ?? 0))) /
  MASTER_DURATION_MS;

const demo = (page: Page) => page.getByTestId('hero-demo');
/** The one play control. Its name is Pause while playing, Play while paused and Replay at the end. */
const playButton = (page: Page) => page.getByRole('button', { name: /^(Play|Pause|Replay)$/ });
const timeline = (page: Page) => page.getByRole('slider', { name: 'Video timeline' });
const number = async (locator: Locator, name: string) =>
  Number((await locator.getAttribute(name)) ?? 'NaN');
const time = (locator: Locator) => number(locator, 'data-time');
const scale = (locator: Locator) => number(locator, 'data-scale');

const DURATION = MASTER_DURATION_MS;

/** Clicks the timeline at a share of its width, like a visitor would. */
async function clickTimelineAt(page: Page, share: number) {
  const box = await timeline(page).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * share, (box?.y ?? 0) + 10);
}

/** Pauses so a test can look at one frame without it moving on. */
async function pause(page: Page) {
  if ((await playButton(page).textContent())?.includes('Pause')) {
    await playButton(page).click();
  }
  await expect(demo(page)).toHaveAttribute('data-playing', 'false');
}

test.describe('the hero video', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens on the green logo card with the mark and the wordmark, then plays', async ({
    page,
  }) => {
    const view = demo(page);
    const brand = page.getByTestId('hero-cards').locator('[data-card="brand"]');
    await expect(view).toHaveAttribute('data-scene', 'opening');
    await expect(brand).toHaveCSS('background-color', 'rgb(0, 78, 82)');
    await expect(brand.getByText('Scrim', { exact: true })).toBeVisible();
    await expect(view).toHaveAttribute('data-playing', 'true');
    await expect.poll(() => time(view)).toBeGreaterThan(300);
  });

  test('has one play control and the auto zoom switch inside the video, nothing else around it', async ({
    page,
  }) => {
    const stage = await demo(page).boundingBox();
    const play = await playButton(page).boundingBox();
    const zoom = await page.getByRole('switch', { name: 'Auto zoom' }).boundingBox();
    for (const box of [play, zoom]) {
      expect(box).not.toBeNull();
      // Inside the video, in its lower right half.
      expect(box?.x ?? 0).toBeGreaterThan((stage?.x ?? 0) + (stage?.width ?? 0) * 0.3);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
        (stage?.y ?? 0) + (stage?.height ?? 0) + 1,
      );
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
        (stage?.x ?? 0) + (stage?.width ?? 0) + 1,
      );
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const hero = page.locator('section[aria-labelledby="hero-title"]');
    // The hero holds the download link, the source link, the play control, the switch and the
    // timeline. There is no Play demo button, no caption and no second label.
    // Inside the video: Play and Pause, and the sound toggle. Under it sit one button for each chapter.
    await expect(hero.getByRole('button')).toHaveCount(2 + SEGMENTS.length);
    await expect(
      hero.getByRole('navigation', { name: 'Chapters' }).getByRole('button'),
    ).toHaveCount(SEGMENTS.length);
    await expect(hero.getByText('Play demo')).toHaveCount(0);
    await expect(hero.getByText(/Auto zoom is (on|off)/)).toHaveCount(0);
    await expect(hero.getByText('Timeline', { exact: true })).toHaveCount(0);
    // The timeline sits under the video.
    const line = await timeline(page).boundingBox();
    expect(line?.y ?? 0).toBeGreaterThanOrEqual((stage?.y ?? 0) + (stage?.height ?? 0) - 1);
  });

  test('the play control pauses and resumes from the same place', async ({ page }) => {
    const view = demo(page);
    const button = playButton(page);
    await expect(button).toHaveAccessibleName('Pause');
    await expect.poll(() => time(view)).toBeGreaterThan(300);

    await button.click();
    await expect(button).toHaveAccessibleName('Play');
    await expect(view).toHaveAttribute('data-playing', 'false');
    const frozenAt = await time(view);
    await page.waitForTimeout(700);
    expect(await time(view)).toBe(frozenAt);

    await button.click();
    await expect(button).toHaveAccessibleName('Pause');
    await expect.poll(() => time(view)).toBeGreaterThan(frozenAt);
  });

  test('the timeline can be clicked anywhere, in the intro, the demo and the outro', async ({
    page,
  }) => {
    const view = demo(page);
    await pause(page);

    await clickTimelineAt(page, shareOf('recording'));
    await expect.poll(() => time(view)).toBeGreaterThan(segment('recording')?.start ?? 0);
    expect(await time(view)).toBeLessThan(segment('recording')?.end ?? 0);
    await expect(view).toHaveAttribute('data-scene', 'recording');

    for (const entry of SEGMENTS) {
      await clickTimelineAt(page, shareOf(entry.id));
      await expect(view).toHaveAttribute('data-scene', entry.id);
    }
  });

  test('dragging the timeline scrubs the video and every layer follows the same time', async ({
    page,
  }) => {
    const view = demo(page);
    await pause(page);
    const box = await timeline(page).boundingBox();
    const y = (box?.y ?? 0) + 10;
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * 0.05, y);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * 0.3, y, { steps: 8 });
    // While the pointer is down the video does not run on its own.
    await expect(view).toHaveAttribute('data-playing', 'false');
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) * 0.5, y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => time(view)).toBeGreaterThan(MASTER_DURATION_MS * 0.4);
    // The demo time is the master time minus where the demo starts.
    const master = await time(view);
    expect(await number(view, 'data-demo-time')).toBe(
      Math.max(0, master - (segment('recording')?.start ?? 0)),
    );
    await expect(page.getByTestId('hero-cards').locator('[data-card="brand"]')).toHaveCSS(
      'opacity',
      '0',
    );
  });

  test('a clicked zoom moment shows auto zoom, and the switch turns it off', async ({ page }) => {
    const view = demo(page);
    await pause(page);
    await clickTimelineAt(page, 0.28);
    await expect.poll(() => scale(view)).toBeGreaterThan(1.5);

    const toggle = page.getByRole('switch', { name: 'Auto zoom' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => scale(view)).toBe(1);
    await toggle.click();
    await expect.poll(() => scale(view)).toBeGreaterThan(1.5);
  });

  test('plays all ten chapters in order, then offers Replay in the same button', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const view = demo(page);
    const cards = page.getByTestId('hero-cards');
    for (const entry of SEGMENTS.slice(1)) {
      await expect(view).toHaveAttribute('data-scene', entry.id, { timeout: 30_000 });
      if (entry.id === 'headline') {
        await expect(page.getByTestId('hero-logo')).toHaveCount(0);
        await expect(cards.getByText('Record anything on your screen effortlessly')).toBeVisible({
          timeout: 8000,
        });
      }
      if (entry.id === 'recording') {
        await expect.poll(() => scale(view), { timeout: 20_000 }).toBeGreaterThan(1.5);
      }
    }
    await expect(cards.getByText(/scrim\.app$/)).toBeVisible();
    await expect(playButton(page)).toHaveAccessibleName('Replay', { timeout: 8000 });
    await expect(view).toHaveAttribute('data-playing', 'false');
    expect(await time(view)).toBe(DURATION);

    await playButton(page).click();
    await expect(view).toHaveAttribute('data-scene', 'opening');
    await expect(playButton(page)).toHaveAccessibleName('Pause');
    await expect(view).toHaveAttribute('data-playing', 'true');
  });

  test('pauses when the tab is hidden and resumes when it is shown', async ({ page }) => {
    const view = demo(page);
    await expect(view).toHaveAttribute('data-playing', 'true');
    const setVisibility = (state: 'hidden' | 'visible') =>
      page.evaluate((next) => {
        Object.defineProperty(document, 'visibilityState', { value: next, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await setVisibility('hidden');
    await expect(view).toHaveAttribute('data-playing', 'false');
    await setVisibility('visible');
    await expect(view).toHaveAttribute('data-playing', 'true');
  });

  test('does not start until the hero is on screen, and pauses when it leaves', async ({
    page,
  }) => {
    await pause(page);
    await playButton(page).click();
    const view = demo(page);
    await expect(view).toHaveAttribute('data-playing', 'true');
    await page.evaluate(() => {
      document.querySelector('#features')?.scrollIntoView();
    });
    await expect(view).toHaveAttribute('data-playing', 'false');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(view).toHaveAttribute('data-playing', 'true');
  });

  test('keeps its 16 by 9 shape and both controls reach 44 pixels', async ({ page }) => {
    const box = await demo(page).boundingBox();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);
    for (const control of [playButton(page), page.getByRole('switch', { name: 'Auto zoom' })]) {
      const size = await control.boundingBox();
      expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(size?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('sound', () => {
  // Counts the audio contexts the page makes, so a test can prove none exists before the toggle.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as {
        __audio: { made: number; closed: number };
        AudioContext: typeof AudioContext;
      };
      w.__audio = { made: 0, closed: 0 };
      const Real = w.AudioContext;
      w.AudioContext = class extends Real {
        constructor() {
          super();
          w.__audio.made += 1;
        }
        override close() {
          w.__audio.closed += 1;
          return super.close();
        }
      };
    });
    await page.goto('/');
  });

  const audio = (page: Page) =>
    page.evaluate(
      () => (window as unknown as { __audio: { made: number; closed: number } }).__audio,
    );
  const toggle = (page: Page) => page.getByRole('button', { name: 'Sound' });

  test('is off by default and makes no audio context while the video plays', async ({ page }) => {
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => time(demo(page))).toBeGreaterThan(1500);
    expect(await audio(page)).toEqual({ made: 0, closed: 0 });
  });

  test('turns on with a click, makes one audio context, and closes it when turned off', async ({
    page,
  }) => {
    const box = await toggle(page).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect((await audio(page)).made).toBe(1);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await audio(page)).toEqual({ made: 1, closed: 1 });
  });

  test('keeps the choice in memory only, with no storage and no cookie', async ({ page }) => {
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    expect(await page.context().cookies()).toEqual([]);
  });
});

test.describe('the chapter buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('jump to their chapter and mark the playing one with aria-current', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Chapters' });
    await expect(nav.getByRole('button')).toHaveCount(SEGMENTS.length);
    await pause(page);
    for (const entry of SEGMENTS) {
      await nav.getByRole('button', { name: entry.label, exact: true }).click();
      await expect(demo(page)).toHaveAttribute('data-scene', entry.id);
      await expect(nav.getByRole('button', { name: entry.label, exact: true })).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(nav.locator('[aria-current="true"]')).toHaveCount(1);
    }
  });

  test('can be used from the keyboard alone', async ({ page }) => {
    await pause(page);
    const edit = page.getByRole('navigation', { name: 'Chapters' }).getByRole('button', {
      name: 'Edit',
      exact: true,
    });
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(demo(page)).toHaveAttribute('data-scene', 'edit');
  });
});

test.describe('text in the hero video', () => {
  // For every visible piece of text on every slide: its colour is never its background, and the
  // contrast clears 4.5 to 1. The slides are sampled well inside their scene, after fades finish.
  for (const width of [320, 768, 1440]) {
    test(`is readable on every slide at ${String(width)} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await pause(page);
      for (const entry of SEGMENTS) {
        await clickTimelineAt(page, shareOf(entry.id));
        await expect(demo(page)).toHaveAttribute('data-scene', entry.id);
        const report = await page.getByTestId('hero-cards').evaluate((cards) => {
          const parse = (value: string) => {
            const match = /rgba?\(([^)]+)\)/.exec(value);
            const parts = (match?.[1] ?? '0,0,0,0')
              .split(/[ ,/]+/)
              .filter(Boolean)
              .map(Number);
            return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
          };
          const channel = (v: number) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          };
          const luminance = (c: { r: number; g: number; b: number }) =>
            0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
          const problems: string[] = [];
          let checked = 0;
          for (const element of cards.querySelectorAll<HTMLElement>('*')) {
            const hasText = [...element.childNodes].some(
              (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
            );
            if (!hasText) continue;
            let opacity = 1;
            for (
              let node: HTMLElement | null = element;
              node !== null && node !== cards;
              node = node.parentElement
            ) {
              opacity *= Number(getComputedStyle(node).opacity);
            }
            if (opacity < 0.95) continue;
            const text = parse(getComputedStyle(element).color);
            let background = { r: 255, g: 255, b: 255, a: 1 };
            for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
              const candidate = parse(getComputedStyle(node).backgroundColor);
              if (candidate.a >= 0.95) {
                background = candidate;
                break;
              }
            }
            const light = Math.max(luminance(text), luminance(background));
            const dark = Math.min(luminance(text), luminance(background));
            const ratio = (light + 0.05) / (dark + 0.05);
            checked += 1;
            const same =
              text.r === background.r && text.g === background.g && text.b === background.b;
            if (same || ratio < 4.5) {
              problems.push(
                `"${element.textContent.trim().slice(0, 30)}" ratio ${ratio.toFixed(2)}`,
              );
            }
          }
          return { checked, problems };
        });
        expect(report.problems, `slide ${entry.id}`).toEqual([]);
        // The slides that carry text have some. The app screens are checked once they have text.
        if (['headline', 'platforms', 'address'].includes(entry.id)) {
          expect(report.checked, `text on ${entry.id}`).toBeGreaterThan(0);
        }
      }
    });
  }
});

test.describe('the logo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Each point sits well inside its scene. Only the first slide carries the logo.
  const SCENES = SEGMENTS.map(
    (entry) => [entry.id, shareOf(entry.id), entry.id === 'opening' ? 1 : 0] as const,
  );

  for (const [scene, at, logos] of SCENES) {
    test(`is ${logos === 1 ? 'shown' : 'absent'} in the ${scene} scene`, async ({ page }) => {
      const view = demo(page);
      await pause(page);
      await clickTimelineAt(page, at);
      await expect(view).toHaveAttribute('data-scene', scene);
      await expect(page.getByTestId('hero-logo')).toHaveCount(logos);
    });
  }
});

test.describe('the headline in the hero video', () => {
  for (const width of [320, 375, 768, 1440]) {
    test(`sits on two lines that fit at ${String(width)} px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await pause(page);
      await clickTimelineAt(page, shareOf('headline'));
      await expect(demo(page)).toHaveAttribute('data-scene', 'headline');
      const lines = page.getByTestId('hero-cards').locator('[data-card="brand"] p > span');
      await expect(lines).toHaveCount(2);
      await expect(lines.nth(0)).toHaveText('Record anything on your');
      await expect(lines.nth(1)).toHaveText('screen effortlessly');
      const stage = await demo(page).boundingBox();
      for (const index of [0, 1]) {
        const box = await lines.nth(index).boundingBox();
        expect(box?.height ?? 0).toBeLessThan(((box?.width ?? 0) / 8) * 1.2 + 80);
        const text = await lines.nth(index).evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const rect = range.getBoundingClientRect();
          return { left: rect.left, right: rect.right, height: rect.height };
        });
        expect(text.left).toBeGreaterThanOrEqual((stage?.x ?? 0) - 1);
        expect(text.right).toBeLessThanOrEqual((stage?.x ?? 0) + (stage?.width ?? 0) + 1);
        // One line of text, so its height is about one line, never two.
        expect(text.height).toBeLessThan(((box?.height ?? 0) || 1) * 1.6);
      }
      // The two lines together sit in the middle of the video, both ways.
      const block = await page
        .getByTestId('hero-cards')
        .locator('[data-card="brand"] p')
        .boundingBox();
      expect(
        Math.abs(
          (block?.x ?? 0) + (block?.width ?? 0) / 2 - ((stage?.x ?? 0) + (stage?.width ?? 0) / 2),
        ),
      ).toBeLessThan(3);
      expect(
        Math.abs(
          (block?.y ?? 0) + (block?.height ?? 0) / 2 - ((stage?.y ?? 0) + (stage?.height ?? 0) / 2),
        ),
      ).toBeLessThan(3);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
});

test.describe('a hero that has not reached the screen yet', () => {
  test('stays on the logo card until it is scrolled into view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto('/');
    await page.evaluate(() => {
      document.querySelector('#features')?.scrollIntoView();
    });
    await page.waitForTimeout(2800);
    await expect(demo(page)).toHaveAttribute('data-scene', 'opening');
    await expect(demo(page)).toHaveAttribute('data-playing', 'false');
    await expect.poll(() => time(demo(page))).toBeLessThan(500);
  });
});

test.describe('the recording look of the demo', () => {
  test('the REC dot and label are red, like a recording light', async ({ page }) => {
    await page.goto('/');
    const rec = demo(page).locator('span', { hasText: 'REC' }).first();
    await expect(rec.locator('span').first()).toHaveCSS('background-color', 'rgb(255, 59, 48)');
    await expect(demo(page).getByText('REC', { exact: true })).toHaveCSS(
      'color',
      'rgb(255, 59, 48)',
    );
  });

  test('the timeline has segments, a ruler and a flag that follows the playhead', async ({
    page,
  }) => {
    await page.goto('/');
    for (const entry of SEGMENTS) {
      await expect(
        page.locator(`[data-segment]`).filter({ hasText: new RegExp(`^${entry.label}$`) }),
      ).toHaveCount(1);
    }
    for (let second = 0; second <= Math.floor(MASTER_DURATION_MS / 5000) * 5; second += 5) {
      const label = `0:${String(second).padStart(2, '0')}`;
      await expect(page.getByText(label, { exact: true }).first()).toBeAttached();
    }
    await pause(page);
    await clickTimelineAt(page, shareOf('edit'));
    await expect(timeline(page)).toHaveAttribute('aria-valuetext', /^Edit, 0:\d\d of 0:\d\d$/);
  });
});

test.describe('layout stability', () => {
  test('the page and the hero cause no layout shift while the demo runs', async ({ page }) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __shift: number };
      store.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as unknown as { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) {
            store.__shift += shift.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3500);
    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    expect(shift).toBeLessThan(0.001);
  });

  test('the demo keeps its 16 by 9 shape at every width', async ({ page }) => {
    await page.goto('/');
    const box = await demo(page).boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the demo shows a real first frame and the download button is a plain link', async ({
    page,
  }) => {
    await page.goto('/');
    const view = demo(page);
    await expect(view).toBeVisible();
    const box = await view.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(100);
    await expect(view.locator('svg text', { hasText: 'Team tasks' }).first()).toBeAttached();
    const button = page
      .locator('section[aria-labelledby="hero-title"] a[data-download-trigger]')
      .first();
    await expect(button).toHaveAttribute('href', 'https://github.com/oyedokunken/scrim/releases');
    await expect(button).toContainText('Download');
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the final frame and a static timeline, with no autoplay', async ({ page }) => {
    await page.goto('/');
    const view = demo(page);
    await expect(view).toHaveAttribute('data-scene', 'address');
    await expect(view).toHaveAttribute('data-playing', 'false');
    await expect(page.getByTestId('hero-cards').getByText(/scrim\.app$/)).toBeVisible();
    await expect(playButton(page)).toHaveAccessibleName('Replay');
    expect(await time(view)).toBe(DURATION);
    await page.waitForTimeout(1200);
    expect(await time(view)).toBe(DURATION);
    await expect(timeline(page)).toHaveValue(String(DURATION));
  });

  test('the controls still work when asked', async ({ page }) => {
    await page.goto('/');
    const view = demo(page);
    await page.getByRole('slider', { name: 'Video timeline' }).focus();
    await clickTimelineAt(page, 0.28);
    await expect.poll(() => scale(view)).toBeGreaterThan(1.5);
    await page.getByRole('switch', { name: 'Auto zoom' }).click();
    await expect.poll(() => scale(view)).toBe(1);
    await playButton(page).click();
    await expect(view).toHaveAttribute('data-playing', 'true');
  });
});

test.describe('the download button names the visitor system', () => {
  const noClientHints = () => {
    // Safari and Firefox send no client hints, so only the user agent string is available. A real
    // desktop has no touch points, whatever screen this test machine has.
    Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  };
  const cases: [string, string, string][] = [
    [
      'Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Download for Windows',
    ],
    [
      'macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Download',
    ],
    [
      'Linux',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Download',
    ],
    [
      'an Android phone',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Download',
    ],
    [
      'an iPhone',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Download',
    ],
  ];

  for (const [name, userAgent, label] of cases) {
    test(`for ${name}`, async ({ browser }) => {
      const context = await browser.newContext({ userAgent });
      const page = await context.newPage();
      await page.addInitScript(noClientHints);
      await page.goto('/');
      const button = page.locator('section a[data-download-trigger]').first();
      await expect(button.locator('span > span').first()).toContainText(label, {
        useInnerText: true,
      });
      await expect(button).toBeVisible();
      await context.close();
    });
  }

  test('an iPad asking for the desktop site gets the neutral button', async ({ browser }) => {
    const macUserAgent = cases[1]?.[1] ?? '';
    const context = await browser.newContext({ userAgent: macUserAgent });
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgentData', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    });
    await page.goto('/');
    await page.waitForTimeout(500);
    const label = page
      .locator('section a[data-download-trigger]')
      .first()
      .locator('span > span')
      .first();
    await expect(label).not.toContainText('for macOS');
    await context.close();
  });

  test('the button keeps its width when the label changes', async ({ browser }) => {
    const windows = cases[0]?.[1] ?? '';
    const widths: number[] = [];
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ userAgent: windows, javaScriptEnabled });
      const page = await context.newPage();
      await page.addInitScript(noClientHints);
      await page.goto('/');
      if (javaScriptEnabled) {
        await expect(
          page.locator('section a[data-download-trigger] span > span').first(),
        ).toContainText('Download for Windows');
      }
      const box = await page.locator('section a[data-download-trigger]').first().boundingBox();
      widths.push(box?.width ?? 0);
      await context.close();
    }
    expect(widths[0]).toBeGreaterThan(0);
    expect(Math.abs((widths[0] ?? 0) - (widths[1] ?? 0))).toBeLessThan(0.5);
  });
});
