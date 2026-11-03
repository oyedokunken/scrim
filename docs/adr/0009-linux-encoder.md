# 0009. The H.264 encoder on Linux

Status: accepted for 1.2.0. Part of it is not yet run on a real Linux machine (see "Not verified").

## Context

ADR 0007 bundles an unmodified LGPL FFmpeg. An LGPL build has no libx264, because libx264 is GPL.
Windows gets H.264 from Windows Media Foundation (`h264_mf`), macOS from VideoToolbox. Linux has
neither, so it needs its own answer. The exporter (`apps/desktop/src/main/export/encoders.ts`)
already tries a list of encoders in order and keeps the first one that encodes a few real frames. It
does not use WebCodecs. It pipes raw pictures to FFmpeg, so the encoder is always an FFmpeg encoder.

## Decision

Use the same ordered probe on Linux. The Linux candidates, in the order the list already has them:

1. `h264_nvenc`, when an NVIDIA driver with the encode library is installed.
2. `h264_qsv`, on Intel hardware with the oneVPL runtime.
3. `h264_vaapi`, on Intel and AMD graphics through VA-API.
4. `libopenh264`, the software encoder. It needs no hardware, is LGPL compatible, and is what the
   Windows build already falls back to.

The Windows only entries (`h264_amf`, `h264_mf`) and `h264_videotoolbox` fail their probe on Linux
and are skipped. AAC comes from FFmpeg's own encoder.

VA-API needed arguments it did not have. `h264_vaapi` only works with a device and with pictures
uploaded to the graphics chip, so its arguments are now `-vaapi_device /dev/dri/renderD128 -vf
format=nv12,hwupload -c:v h264_vaapi ...`. A machine with no render node fails the probe in a
fraction of a second and the next encoder runs.

The build is the BtbN static LGPL build already pinned for Linux x64
(`apps/desktop/scripts/ffmpeg-targets.mts`, file
`ffmpeg-n8.1.3-24-g92611900bb-linux64-lgpl-8.1.tar.xz`, from the same release tag as Windows). The
fetch script checks its SHA-256 and writes `LICENSE.txt` and `SOURCE.txt` (build page, archive,
hash, the FFmpeg source commit) beside the binaries, and the installer ships them.

## What was verified (on a Windows machine, no Linux)

- The pinned archive was downloaded and hashed with `certutil`: SHA-256
  `75734a2604fbbf653256ac9d29bf88499d217b0c5c6d7c4a2a1f7b1f93073b55`, 137,850,376 bytes. It equals the
  pin. The pin is real, so Linux packaging does not stop on a missing pin.
- The `ffmpeg` binary was unpacked and its text read. The configuration has `--enable-version3`,
  `--enable-libopenh264`, `--enable-vaapi` and `--enable-libvpl`, `--enable-ffnvcodec`,
  `--disable-libx264`, `--disable-libx265`, `--disable-shared --enable-static`, and no
  `--enable-gpl` and no `--enable-nonfree`. So it is LGPL v3, it contains the `h264_vaapi`,
  `h264_nvenc`, `h264_qsv` and `libopenh264` encoders, and it has no libx264.
- The ELF needed libraries of `ffmpeg` are only glibc (`libc`, `libm`, `libdl`, `libpthread`, `librt`,
  `libmvec`, `libgcc_s`, the loader). It does not link libva at load time, so a machine without
  VA-API still starts it.
- The software path was run for real with the Windows build of the same pinned release, which has
  the same libopenh264 and AAC: `scripts/check-encode.mts` encoded a 3 second 1280 by 720 clip and
  ffprobe read H.264, yuv420p, 1280 by 720, AAC, with the licence and encoder list checks passing.
- Unit tests cover the encoder arguments (VA-API has its device and upload, none has libx264), the
  licence and encoder list checks, and the check script's clip.

## Not verified

- The Linux `ffmpeg` binary was never started, because there is no Linux machine here. The CI job
  runs `node scripts/check-encode.mts` on an Ubuntu runner with the fetched binary. Until that job
  has run, "libopenh264 works on Linux" rests on the Windows run above and on the Linux binary's
  configuration text.
- `h264_vaapi`, `h264_nvenc` and `h264_qsv` were not run, because no GPU was available. The VA-API
  arguments follow the FFmpeg documentation and are probed at run time, so a mistake shows up as a
  skipped encoder, not as a broken export. A real run on Intel or AMD hardware is on the manual
  checklist in `docs/releasing.md`.
- A machine with no graphics chip at all (a virtual machine without 3D) uses `libopenh264`. Its speed
  at 1080p30 was not measured on Linux.
- The minimum glibc version of the static binary was not checked. BtbN builds on a recent
  distribution, so very old systems may not start it.

## Consequences

- Software H.264 from libopenh264 is slower and gives larger files than libx264 at the same
  quality. Hardware encoders fix that where they exist. This is the price of staying LGPL.
- Cisco's patent licence for H.264 covers the prebuilt binaries Cisco publishes. Whether the
  libopenh264 inside the BtbN build is that binary or was compiled from source was not checked. The
  same question applies to the Windows build today. It is an owner decision, noted here so it is
  not forgotten.
- The pinned release tag can be removed upstream. Move the pin before that happens (docs/releasing.md).
- If a better software path is wanted later, the choices are an owner decision: a GPL build with
  libx264 (the app then ships under the GPL's terms for that binary), or WebCodecs in a worker.
