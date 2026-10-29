/* global document -- only used inside page.evaluate, which runs in the browser */
// Records the hero video of the landing page for the README.
//
// It starts the production site, drives the hero timeline frame by frame (the timeline is the
// only clock, so every layer is exactly in step), screenshots the video area at 30 frames a
// second, then asks FFmpeg for an MP4 and an optimised GIF. Run `pnpm build` first, then
// `pnpm demo:export` from the repository root. Needs an FFmpeg with libx264 (FFMPEG_PATH, or
// ffmpeg on the PATH). The files land in docs/media.

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const landing = resolve(here, '..');
const outDir = resolve(landing, '../../docs/media');
const PORT = 3199;
const URL = `http://localhost:${String(PORT)}/`;
const FPS = 30;
const DURATION_MS = 30_000;
const FRAMES = (DURATION_MS / 1000) * FPS + 1;
const GIF_LIMIT_BYTES = 8 * 1024 * 1024;
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(URL);
      if (response.ok) {
        return;
      }
    } catch {
      // Not up yet.
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error('The site did not start. Run pnpm build in apps/landing first.');
}

function run(args) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

async function capture(frameDir) {
  const browser = await chromium.launch();
  try {
    // Reduced motion keeps the video still, so the script is the only thing that moves it.
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(URL);
    await page.addStyleTag({ content: '[class*="controls"] { display: none !important; }' });
    const stage = page.getByTestId('hero-demo');
    await stage.scrollIntoViewIfNeeded();
    const slider = page.getByRole('slider', { name: 'Video timeline' });
    await page.evaluate(() => document.fonts.ready);
    for (let frame = 0; frame < FRAMES; frame += 1) {
      const timeMs = Math.min(DURATION_MS, Math.round((frame * 1000) / FPS / 10) * 10);
      await slider.fill(String(timeMs));
      await stage.screenshot({
        path: join(frameDir, `frame-${String(frame).padStart(4, '0')}.png`),
      });
      if (frame % 90 === 0) {
        console.log(`frame ${String(frame)} of ${String(FRAMES)}`);
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const frameDir = mkdtempSync(join(tmpdir(), 'scrim-hero-'));
  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(PORT)], {
    cwd: landing,
    stdio: 'ignore',
    shell: true,
  });
  try {
    await waitForServer();
    await capture(frameDir);
    if (readdirSync(frameDir).length < FRAMES) {
      throw new Error('Not every frame was captured.');
    }
    const input = ['-framerate', String(FPS), '-i', join(frameDir, 'frame-%04d.png')];
    run([
      ...input,
      '-vf',
      'scale=1600:900:flags=lanczos,format=yuv420p',
      '-c:v',
      'libx264',
      '-crf',
      '22',
      '-preset',
      'slow',
      '-movflags',
      '+faststart',
      join(outDir, 'scrim-hero.mp4'),
    ]);
    // A GIF has to stay small enough for the README, so it tries smaller sizes until it fits.
    for (const width of [960, 800, 640, 480]) {
      run([
        ...input,
        '-vf',
        `fps=12,scale=${String(width)}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
        '-loop',
        '0',
        join(outDir, 'scrim-hero.gif'),
      ]);
      const size = statSync(join(outDir, 'scrim-hero.gif')).size;
      console.log(`GIF at ${String(width)} pixels wide: ${(size / 1024 / 1024).toFixed(1)} MB`);
      if (size <= GIF_LIMIT_BYTES) {
        break;
      }
    }
    console.log(`Wrote ${join(outDir, 'scrim-hero.mp4')} and scrim-hero.gif`);
  } finally {
    server.kill();
    if (process.platform === 'win32' && server.pid !== undefined) {
      try {
        execFileSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
      } catch {
        // Already gone.
      }
    }
    rmSync(frameDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
