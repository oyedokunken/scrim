/**
 * The one FFmpeg build the Windows app ships. It is an LGPL build (no GPL parts), static, from the
 * BtbN FFmpeg-Builds project, taken from the 8.1 release branch. H.264 comes from Windows Media
 * Foundation (`h264_mf`) and hardware encoders, and AAC from FFmpeg's own encoder. See ADR 0007.
 *
 * To update it: choose a release on the project's releases page, copy the file name and the
 * SHA-256 digest GitHub shows for it, and change the four values below. The script refuses any
 * download whose hash differs. Old autobuild tags are removed upstream after a while, so move the
 * pin before the tag disappears, or mirror the archive.
 */
export const FFMPEG_PIN = {
  tag: 'autobuild-2026-10-27-18-38',
  file: 'ffmpeg-n8.1.3-24-g92611900bb-win64-lgpl-8.1.zip',
  sha256: '4b999c5b938ee20dc1bd7be68cb09381ac425520e363a58b67e787402cb96022',
  /** The FFmpeg source commit this build was made from. */
  sourceCommit: '92611900bb',
} as const;

export const FFMPEG_URL = `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_PIN.tag}/${FFMPEG_PIN.file}`;
export const FFMPEG_BUILD_PAGE = `https://github.com/BtbN/FFmpeg-Builds/releases/tag/${FFMPEG_PIN.tag}`;
export const FFMPEG_SOURCE_URL = `https://git.ffmpeg.org/gitweb/ffmpeg.git/commit/${FFMPEG_PIN.sourceCommit}`;

/** The files copied into the app, from the `bin` folder of the archive. */
export const FFMPEG_BINARIES = ['ffmpeg.exe', 'ffprobe.exe'] as const;
