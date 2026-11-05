// Encodes a short synthetic clip with the bundled FFmpeg and reads it back with ffprobe, the way
// the exporter does. It proves the software H.264 path (libopenh264, the only software encoder an
// LGPL build has) and AAC work on this machine, with no graphics chip needed. Run it in CI after
// the FFmpeg fetch:
//   node scripts/check-encode.mts [<folder with ffmpeg and ffprobe>]
// The folder defaults to resources/ffmpeg. It fails when the file is not H.264 in yuv420p at the
// requested size, or has no AAC track, and first when the build is not LGPL or lacks libopenh264.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encoderArgs } from '../src/main/export/encoders.ts';
import { verifyOutput } from '../src/main/export/verify.ts';
import { encoderProblem, licenceProblem } from './ffmpeg-licence.mts';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const SECONDS = 3;

/** The arguments of the clip: a test picture in the same raw format the exporter pipes, and a tone. */
export function clipArguments(output: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=s=${String(WIDTH)}x${String(HEIGHT)}:r=${String(FPS)}:d=${String(SECONDS)},format=bgr0`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${String(SECONDS)}`,
    ...encoderArgs('libopenh264', { bitrate: 4_000_000, fps: FPS }),
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    output,
  ];
}

export async function checkEncode(ffmpeg: string, ffprobe: string): Promise<string | undefined> {
  // The licence and the encoder list first: a wrong build should fail with that reason.
  const version = spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8' });
  const encoders = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  const problem = licenceProblem(version.stdout) ?? encoderProblem(encoders.stdout);
  if (problem !== undefined) return problem;
  const work = mkdtempSync(join(tmpdir(), 'scrim-encode-check-'));
  const file = join(work, 'clip.mp4');
  try {
    const made = spawnSync(ffmpeg, clipArguments(file), { encoding: 'utf8' });
    if (made.status !== 0) return `ffmpeg failed (exit ${String(made.status)}): ${made.stderr}`;
    const verdict = await verifyOutput(
      (command, args) => {
        const result = spawnSync(command, [...args], { encoding: 'utf8' });
        return Promise.resolve({
          code: result.status,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      },
      { ffmpeg, ffprobe },
      file,
      { width: WIDTH, height: HEIGHT, durationMs: SECONDS * 1000, audio: true, fps: FPS },
    );
    return verdict.ok ? undefined : verdict.problem;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const folder = resolve(process.argv[2] ?? join(here, '..', 'resources', 'ffmpeg'));
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const problem = await checkEncode(
    join(folder, `ffmpeg${suffix}`),
    join(folder, `ffprobe${suffix}`),
  );
  if (problem === undefined) {
    console.log(
      `Encode check passed: libopenh264 and AAC gave H.264 yuv420p ${String(WIDTH)}x${String(HEIGHT)}.`,
    );
  } else {
    console.error(`Encode check failed: ${problem}`);
    process.exitCode = 1;
  }
}
