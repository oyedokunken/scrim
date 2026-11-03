/**
 * Checks of a bundled FFmpeg that need no more than the text of `ffmpeg -version` and
 * `ffmpeg -encoders`. They run after the fetch on a machine that can start the binary (Linux CI),
 * so a pin moved to a GPL build, or to one without the software H.264 encoder, fails the build.
 */

/** Why a build is not LGPL, or undefined when its configuration shows no GPL or nonfree switch. */
export function licenceProblem(versionOutput: string): string | undefined {
  const configuration = versionOutput
    .split(/\r?\n/)
    .find((line) => line.startsWith('configuration:'));
  if (configuration === undefined) return 'ffmpeg -version printed no configuration line.';
  for (const flag of ['--enable-gpl', '--enable-nonfree']) {
    if (new RegExp(`${flag}(?![\\w-])`).test(configuration)) {
      return `The build was configured with ${flag}, so it is not LGPL.`;
    }
  }
  return undefined;
}

/** Why the build cannot make H.264 and AAC the way export needs, or undefined when it can. */
export function encoderProblem(encodersOutput: string): string | undefined {
  const names = new Set(
    encodersOutput
      .split(/\r?\n/)
      .map((line) => /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line)?.[1])
      .filter((name): name is string => name !== undefined),
  );
  if (names.has('libx264')) return 'The build has libx264, which is GPL.';
  if (!names.has('libopenh264')) return 'The build has no libopenh264 software H.264 encoder.';
  if (!names.has('aac')) return 'The build has no AAC encoder.';
  return undefined;
}
