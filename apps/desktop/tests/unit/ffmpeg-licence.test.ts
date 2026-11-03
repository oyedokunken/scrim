import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encoderProblem, licenceProblem } from '../../scripts/ffmpeg-licence.mts';
import { clipArguments } from '../../scripts/check-encode.mts';
import { ffmpegSourceFor, LINUX_X64_PIN } from '../../scripts/ffmpeg-targets.mts';

// The configuration line of the pinned Linux build, read from its binary (see ADR 0009).
const LINUX_CONFIGURATION =
  'configuration: --prefix=/ffbuild/prefix --enable-version3 --disable-debug --enable-libopenh264 --enable-vaapi --disable-libx264 --disable-libx265 --disable-shared --enable-static';

describe('licenceProblem', () => {
  it('accepts the pinned Linux configuration', () => {
    expect(
      licenceProblem(`ffmpeg version n8.1.3\n${LINUX_CONFIGURATION}\nlibavutil 60.`),
    ).toBeUndefined();
  });

  it('refuses a build with the GPL or nonfree switch', () => {
    expect(licenceProblem('configuration: --enable-gpl --enable-libx264')).toContain(
      '--enable-gpl',
    );
    expect(licenceProblem('configuration: --enable-version3 --enable-nonfree')).toContain(
      '--enable-nonfree',
    );
  });

  it('does not mistake a longer switch name for the GPL switch', () => {
    expect(licenceProblem('configuration: --enable-gplv3-extras')).toBeUndefined();
  });

  it('refuses output with no configuration line', () => {
    expect(licenceProblem('ffmpeg version 8')).toContain('no configuration');
  });
});

describe('encoderProblem', () => {
  const line = (flags: string, name: string) => ` ${flags} ${name.padEnd(20)} description`;

  it('accepts libopenh264 and aac', () => {
    const output = [
      line('V.....', 'libopenh264'),
      line('A....D', 'aac'),
      line('V....D', 'h264_vaapi'),
    ].join('\n');
    expect(encoderProblem(output)).toBeUndefined();
  });

  it('refuses libx264, a missing software encoder and a missing AAC encoder', () => {
    expect(
      encoderProblem(
        [line('V.....', 'libx264'), line('V.....', 'libopenh264'), line('A....D', 'aac')].join(
          '\n',
        ),
      ),
    ).toContain('GPL');
    expect(encoderProblem(line('A....D', 'aac'))).toContain('libopenh264');
    expect(encoderProblem(line('V.....', 'libopenh264'))).toContain('AAC');
  });
});

describe('the Linux FFmpeg pin', () => {
  it('names the source of the exact build for the source offer', () => {
    const source = ffmpegSourceFor('linux-x64');
    expect(source.kind === 'download' && source.sourceUrl).toContain(LINUX_X64_PIN.sourceCommit);
  });
});

describe('the encode check clip', () => {
  const args = clipArguments('out.mp4');

  it('uses the software encoder and AAC, never libx264', () => {
    expect(args).toContain('libopenh264');
    expect(args).toContain('aac');
    expect(args.join(' ')).not.toContain('libx264');
  });

  it('feeds the encoder the raw format the exporter pipes', () => {
    expect(args.join(' ')).toContain('format=bgr0');
  });

  // Runs the real encoder when the Windows or Linux build is fetched into resources/ffmpeg.
  const folder = fileURLToPath(new URL('../../resources/ffmpeg/', import.meta.url));
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  it.skipIf(!existsSync(folder + exe))('passes against the fetched build', () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../../scripts/check-encode.mts', import.meta.url)), folder],
      { encoding: 'utf8' },
    );
    expect(result.stdout).toContain('Encode check passed');
    expect(result.status).toBe(0);
  });
});
