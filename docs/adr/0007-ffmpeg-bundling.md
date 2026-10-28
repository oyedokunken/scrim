# 0007. FFmpeg in the packaged app

Status: accepted for v1 (owner decision D7, taken by Agent B under the v1 plan)

## Context

The installed app must not depend on an FFmpeg the user happens to have. It needs FFmpeg and ffprobe
to make recordings playable, to recover crashed ones and, in Phase 3, to export. The licence matters
because Scrim ships the binary: a GPL build would put the whole app under the GPL's terms for
distribution, which a plain LGPL build does not.

## Decision

Ship a static, unmodified LGPL build of FFmpeg for Windows x64, taken from the BtbN FFmpeg-Builds
project, release branch 8.1, and pin it exactly.

- **Build.** `ffmpeg-n8.1.3-24-g92611900bb-win64-lgpl-8.1.zip` from the `autobuild-2026-10-27-18-38`
  release. The pin, with its SHA-256, lives in `apps/desktop/scripts/ffmpeg-pin.mts`.
- **Licence.** The build's own configuration shows `--enable-version3` and no `--enable-gpl` and no
  `--enable-nonfree`, so it is LGPL v3. It was checked by reading `ffmpeg -version`.
- **Encoders.** H.264 from Windows Media Foundation (`h264_mf`), which every Windows install has, with
  `h264_nvenc`, `h264_qsv` and `h264_amf` where the hardware exists and `libopenh264` as a software
  fallback. AAC from FFmpeg's own encoder. There is no libx264, which is GPL. A 3 second 1080p clip
  was encoded to H.264 and AAC with `h264_mf` and with `libopenh264`, and ffprobe read both back as
  `h264`, `yuv420p`, 1920 by 1080 and `aac`.
- **Fetching.** `apps/desktop/scripts/fetch-ffmpeg.mts` downloads the archive from the pinned URL,
  refuses it unless the SHA-256 matches, unpacks only `ffmpeg.exe`, `ffprobe.exe` and `LICENSE.txt`
  with Windows' own `tar.exe`, and writes `SOURCE.txt` with the build page and the FFmpeg source
  commit. It does nothing when the folder already holds this build. The binaries are never
  committed. The folder is `apps/desktop/resources/ffmpeg`.
- **Packaging.** The installer copies that folder into the app's resources as `ffmpeg`, outside the
  asar archive, because a program cannot run from inside an archive. `LICENSE.txt` and `SOURCE.txt`
  travel with the binaries, and the README's licence section names the build and links the source.
- **Choosing the path.** One function, `resolveFfmpegPaths`, returns the bundled files in a packaged
  app and the system FFmpeg, or `SCRIM_FFMPEG` and `SCRIM_FFPROBE`, in development. A packaged app
  ignores those variables, so nothing in the environment can swap the binary.

## Consequences

- The installer grows by about 135 MB per binary before compression. Two static binaries is the
  price of not depending on the system. If size matters later, a shared build with DLLs, or one
  binary that does both jobs, would be smaller.
- The pinned release tag can be removed upstream. Move the pin before it disappears, or mirror the
  archive. The hash check means a changed archive fails loudly, never silently.
- Anything that needs an encoder only a GPL build has, such as libx264, is an owner decision
  before it is used. Export should not need it: `h264_mf` and the hardware encoders cover H.264.
- macOS and Linux builds are out of scope for v1. The script says so and does nothing there.
