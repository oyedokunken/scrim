import { chromium, type Page } from '@playwright/test';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Records for a number of seconds in a built or packaged Scrim with the camera, the microphone,
 * zoom and a background on, stops, and measures how long the working copy takes to make. It
 * prints one JSON line per recording with every stage the exporter logged. It touches no real
 * folder: the user data and the projects folder are made in a temporary folder.
 *
 *   node scripts/measure-render.mts <path to Scrim.exe> 10 30 120
 *
 * Needs a desktop session. The recording is of the real screen.
 */
const exe = process.argv[2];
// An optional app folder (for example `.`) lets this run the built app under a plain Electron.
const appDir =
  process.argv[3]?.startsWith('--app=') === true ? process.argv[3].slice(6) : undefined;
const lengths = process.argv.slice(appDir === undefined ? 3 : 4).map(Number);
if (exe === undefined || lengths.length === 0 || lengths.some((n) => !(n > 0))) {
  console.error('usage: measure-render.mts <Scrim.exe> <seconds> [seconds...]');
  process.exit(2);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Bridge {
  invoke(channel: string, input?: unknown): Promise<unknown>;
}
interface Job {
  id: string;
  phase: string;
  preview: boolean;
  progress: { frame: number; totalFrames: number; fraction: number; speed: number } | null;
  error: { code: string; message: string } | null;
}

function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
}

async function measure(seconds: number): Promise<Record<string, unknown>> {
  const work = mkdtempSync(join(tmpdir(), 'scrim-measure-'));
  const userData = join(work, 'user');
  const local = join(work, 'local');
  // The packaged app does not start in a user data folder that already exists, so it is made by the app.
  mkdirSync(work, { recursive: true });
  const settings = {
    firstRunDone: true,
    showWelcome: false,
    zoomOn: true,
    cameraOn: true,
    micOn: true,
    backgroundId: 'dots',
    frameRate: 30,
  };
  const child = spawn(
    exe ?? '',
    [
      ...(appDir === undefined ? [] : [appDir]),
      '--remote-debugging-port=0',
      `--user-data-dir=${userData}`,
    ],
    {
      env: { ...process.env, LOCALAPPDATA: local },
      // The packaged app only starts when it shares this console, so its few lines show up here too.
      stdio: 'inherit',
    },
  );
  let exited = '';
  child.on('exit', (code, signal) => {
    exited = `exit ${String(code)} ${String(signal)}`;
  });
  try {
    const portFile = join(userData, 'DevToolsActivePort');
    const until = Date.now() + 30_000;
    let port = 0;
    while (Date.now() < until && port === 0) {
      if (existsSync(portFile)) port = Number(readFileSync(portFile, 'utf8').split(/\r?\n/)[0]);
      await sleep(200);
    }
    if (port === 0) throw new Error(`no debugging port (${exited || 'still running'})`);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(port)}`);
    let main: Page | undefined;
    const deadline = Date.now() + 30_000;
    while (main === undefined && Date.now() < deadline) {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          const url = page.url();
          if (
            (url.includes('index.html') || url.startsWith('app://')) &&
            !/pill|region|recorder|bubble/.test(url)
          ) {
            main = page;
          }
        }
      }
      await sleep(200);
    }
    if (main === undefined) throw new Error('no main page');
    const page = main;
    await page.waitForFunction(() => 'scrim' in globalThis);
    const invoke = (channel: string, input?: unknown): Promise<unknown> =>
      page.evaluate(
        ([name, arg]) => (globalThis as unknown as { scrim: Bridge }).scrim.invoke(name, arg),
        [channel, input] as const,
      );

    const saved = await invoke('settings:set', settings);
    if (!(saved as { ok?: boolean }).ok && (saved as { ok?: boolean }).ok !== undefined)
      throw new Error(`settings failed: ${JSON.stringify(saved)}`);
    const started = await invoke('recording:start', {
      source: { kind: 'display' },
      camera: { enabled: true },
      mic: { enabled: true },
    });
    if (!(started as { ok: boolean }).ok)
      throw new Error(`start failed: ${JSON.stringify(started)}`);
    await sleep(seconds * 1000);
    const stopAt = Date.now();
    const stopped = await invoke('recording:stop');
    if (!(stopped as { ok: boolean }).ok)
      throw new Error(`stop failed: ${JSON.stringify(stopped)}`);
    const stopDoneMs = Date.now() - stopAt;

    const samples: { tMs: number; frame: number; of: number; speed: number }[] = [];
    let job: Job | null = null;
    const limit = Date.now() + Math.max(15 * 60_000, seconds * 12_000);
    while (Date.now() < limit) {
      job = (await invoke('export:latest')) as Job | null;
      if (job?.progress != null && job.preview) {
        samples.push({
          tMs: Date.now() - stopAt,
          frame: job.progress.frame,
          of: job.progress.totalFrames,
          speed: Math.round(job.progress.speed * 100) / 100,
        });
      }
      if (job !== null && job.preview && ['done', 'failed', 'cancelled'].includes(job.phase)) break;
      await sleep(1000);
    }
    const doneMs = Date.now() - stopAt;
    const logFile = join(userData, 'logs', 'scrim.log');
    const stages = existsSync(logFile)
      ? readFileSync(logFile, 'utf8')
          .split('\n')
          .filter((line) => /export/.test(line))
          .map((line) => line.replace(/^\S+\s+/, ''))
      : [];
    const previews = existsSync(join(userData, 'cache', 'previews'))
      ? readdirSync(join(userData, 'cache', 'previews'))
      : [];
    return {
      recordedSeconds: seconds,
      stopReturnedMs: stopDoneMs,
      phase: job?.phase ?? 'none',
      error: job?.error ?? null,
      stopToDoneMs: doneMs,
      realtimeFactor: Math.round((seconds * 1000 * 100) / Math.max(1, doneMs)) / 100,
      previewFiles: previews.length,
      progressSamples: samples.filter((_, i) => i % 15 === 0),
      stages,
    };
  } finally {
    killTree(child);
    await sleep(1500);
    try {
      rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      // A leftover temporary folder is harmless.
    }
  }
}

for (const seconds of lengths) {
  const result = await measure(seconds).catch((error: unknown) => ({
    recordedSeconds: seconds,
    failed: error instanceof Error ? error.message : 'unknown',
  }));
  console.log(JSON.stringify(result));
}
