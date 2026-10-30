# Releasing Scrim

This page covers all three systems. It says plainly what has been run and what has not. GitHub Actions
could not run when it was written (billing), so no workflow here has ever run.

## What is verified and what is not

| Item                             | Windows                   | macOS                                                   | Linux                                                                                    |
| -------------------------------- | ------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Installer builds                 | yes, on a real machine    | not run                                                 | partly: `linux-unpacked` built from Windows; AppImage and deb built in a Linux container |
| Bundled FFmpeg runs              | yes                       | not run                                                 | yes, run in a Linux container (ffprobe, libopenh264 encode, AAC encoder present)         |
| App launches from the installer  | yes                       | not run                                                 | not run (no desktop session available)                                                   |
| Capture, input hook, permissions | yes                       | not run                                                 | not run                                                                                  |
| uiohook prebuilds shipped        | yes                       | yes, `darwin-x64` and `darwin-arm64` are in the package | yes, `linux-x64` is in the package                                                       |
| Release workflow                 | not run                   | not run                                                 | not run                                                                                  |
| Signing                          | none yet (SignPath later) | none (needs the owner)                                  | not needed                                                                               |

Unit tests cover the platform logic (Wayland and X11 detection, the macOS permission steps, the
installer configuration, the FFmpeg pins). They do not prove the app works on a Mac or on Linux.

## What the release produces

On a `v*` tag, `.github/workflows/release.yml` builds and publishes:

- Windows: `Scrim-Setup-<version>.exe` (NSIS, unsigned until SignPath is approved).
- macOS: `Scrim-<version>-mac-arm64.dmg` and `Scrim-<version>-mac-x64.dmg`, one per architecture
  because the bundled FFmpeg is per architecture.
- Linux x64: `Scrim-<version>-linux-x86_64.AppImage` and `Scrim-<version>-linux-amd64.deb`.
- `SHA256SUMS.txt` for every file above.

File names carry `x64`, `arm64`, `x86_64` or `amd64` because the website picks the installer by
extension and architecture (`apps/landing/src/lib/asset-match.ts`). Do not rename them.

## Order of a release

1. Land everything on `main` and make sure `pnpm check` passes locally.
2. Set the version in `apps/desktop/package.json` and update `CHANGELOG.md`.
3. Install the previous release on a clean machine and check that recordings still open.
4. Tag: `git tag v1.0.0 && git push origin v1.0.0`. The workflow first checks that the tag equals
   the desktop version and stops if it does not.
5. The three build jobs run. Each uploads its installers. The `publish` job writes
   `SHA256SUMS.txt` and creates the GitHub Release with generated notes.
6. Download each installer from the release page and run the checklist below on that system.
7. Only then tell people. The website reads the latest release, so it already offers the files.

The landing page deploys on its own and never builds installers. Run production database migrations
(`prisma migrate deploy`) before promoting a landing change, not as part of a desktop release.

## Checksums

`SHA256SUMS.txt` is in every release. To check a download:

- Windows PowerShell: `Get-FileHash <file> -Algorithm SHA256`
- macOS and Linux: `shasum -a 256 <file>` or `sha256sum <file>`

Compare with the line for that file.

## Bundled FFmpeg

Every platform ships an unmodified LGPL FFmpeg. No GPL build and no libx264 (ADR 0007). The pins
are in `apps/desktop/scripts/ffmpeg-pin.mts` (Windows) and `ffmpeg-targets.mts` (Linux, macOS).

- Windows x64 and Linux x64: the BtbN static LGPL builds from one release tag. Linux has
  `libopenh264` (software), VAAPI, NVENC and QSV for H.264, and AAC from FFmpeg. There is no
  `h264_mf` on Linux, so export must fall back to `libopenh264` or a hardware encoder there.
- macOS: no maintained prebuilt LGPL build exists to pin. `scripts/build-ffmpeg-mac.sh` builds the
  official source tarball (pinned by SHA-256) with the GPL and nonfree switches off and refuses a
  result whose configuration says otherwise. H.264 comes from VideoToolbox. This script has not
  been run on a Mac yet.

Cross build from Windows for a test (needs the build lock on the shared machine):

```
node scripts/fetch-ffmpeg.mts --target linux-x64 --out <scratch folder>
SCRIM_FFMPEG_DIR=<scratch folder> pnpm exec electron-builder --linux dir --x64 --config electron-builder.config.ts
```

`SCRIM_FFMPEG_DIR` defaults to `resources/ffmpeg`, so the Windows build is unchanged. On Windows,
AppImage fails with `EPERM` on a symlink unless Developer Mode is on, and deb needs `fpm`. Both
built fine in a Linux container from the `linux-unpacked` folder.

### Updating a pin

1. Choose a release at least 7 days old (the repo's release age rule).
2. Windows and Linux: copy the file name and the SHA-256 digest GitHub shows for the asset
   (`gh api repos/BtbN/FFmpeg-Builds/releases/tags/<tag> --jq '.assets[] | [.name,.digest]'`).
   Change `tag`, `file`, `sha256`, `sourceCommit` in `ffmpeg-pin.mts` and the matching Linux values in
   `ffmpeg-targets.mts`. Keep both on one tag.
3. macOS: change the version, URL and SHA-256 in `ffmpeg-targets.mts` and in `build-ffmpeg-mac.sh`.
   Download the tarball once and hash it yourself.
4. Check the licence: `ffmpeg -version` must show no `--enable-gpl` and no `--enable-nonfree`.
5. Run `pnpm test` (the pin tests check the shape) and update ADR 0007 and the README licence text.
6. Old upstream tags are deleted after a while. Move the pin before that happens.

## Signing and notarization

- Windows: unsigned until signing secrets exist, so SmartScreen warns. The pipeline is in place and
  turns on when the secrets are set. See `docs/code-signing.md` for the options, the secret names
  and the steps.
- macOS: needs an Apple Developer account (99 US dollars a year, owner). Put these in the repository
  secrets: `MAC_CSC_LINK` (base64 of the Developer ID Application certificate, a .p12),
  `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. The build
  notarizes only when the last three exist. Without them the disk image is unsigned and users must
  use right click, Open, or System Settings, Privacy and Security, Open Anyway. The hardened runtime
  and entitlements (JIT, microphone, camera) are already set in `build/entitlements.mac.plist`.
- Linux: nothing to sign.

## First signed release

1. Finish the owner steps in `docs/code-signing.md` and set the secrets in GitHub, then bump the
   desktop version and push the `v*` tag from the main repository.
2. Open the `windows` job. The "Decide how to sign" step must show the mode you expect (`pfx`,
   `azure` or `signpath`) and no UNSIGNED warning. With SignPath, approve the request when it
   arrives, or the job waits.
3. "Verify the signatures" must pass. If it fails, the release is not published: fix the cause and
   tag again.
4. Download the installer from the release. In PowerShell run `Get-AuthenticodeSignature` on it:
   Status Valid and the expected publisher. Compare `Get-FileHash` with `SHA256SUMS.txt`.
5. Install it on a clean Windows machine and check that SmartScreen shows the publisher. A new
   certificate can still warn until it builds reputation.
6. If an earlier release was signed with another certificate or publisher name, read "Publisher name
   and automatic updates" in `docs/code-signing.md` first.

## What needs the owner

- Fix GitHub billing so the workflows can run.
- Apple Developer account, and the five secrets above, for a signed macOS build.
- SignPath application for Windows signing.
- Confirm the maintainer string used in the deb (`electron-builder.config.ts`). It uses the GitHub
  no-reply address, not a personal email.
- A real Mac and a real Linux machine for the checklists below.

## Test on a Mac

1. `bash apps/desktop/scripts/build-ffmpeg-mac.sh`, then `resources/ffmpeg/ffmpeg -version` must show
   no gpl or nonfree.
2. `pnpm exec electron-builder --mac --dir --config electron-builder.config.ts` then open the app.
3. Native traffic lights show on the home window. Shortcuts show Cmd, not Ctrl.
4. Start a recording: macOS asks for Screen Recording. Grant it, quit Scrim, open it again, record.
5. Without Accessibility: the recording works and the app says cursor effects and auto zoom are off.
   With it: halo, ripples and zoom work.
6. Camera and microphone prompts appear and recording picks them up.
7. Export an MP4 and play it in QuickTime. Kill Scrim during a recording and check Recover.
8. Install the DMG on both an Apple Silicon and an Intel Mac if possible.

## Test on Linux

1. Install the deb (`sudo apt install ./Scrim-*-amd64.deb`) and run the AppImage on another machine
   (`chmod +x` first; it needs FUSE 2, or use `--appimage-extract-and-run`).
2. On an X11 session: record, check halo, ripples and zoom, export an MP4.
3. On a Wayland session: the portal asks which screen to share. Recording works. The app says cursor
   effects and auto zoom are off, and why.
4. Ubuntu 24.04 blocks unprivileged user namespaces for the sandbox. The deb installs an AppArmor
   profile for this. If the AppImage fails to start, run it with `--no-sandbox` and report it.
5. Check the global shortcuts, the tray icon and Recover after killing the process.

## Windows Security and Controlled folder access

Windows Controlled folder access (part of Ransomware protection) blocks apps it does not recognise
from writing to Pictures, Videos and Documents. An unsigned build is not recognised, so on a computer
with that setting on, saving a screenshot or a video into those folders fails with a permission error.

What Scrim does about it: it keeps the capture in its own folder in app data, tells the person plainly
where it went and why, and offers a button that opens the Windows Security page and one that chooses
another folder. The Library lists both places.

What makes it better for good: code signing. A signed installer and executable build reputation with
SmartScreen and make Windows Security more willing to trust the app. Signing needs a certificate or a
signing service (see `docs/code-signing.md` once it exists), so it is not part of this change.

## Publishing an update

The app checks GitHub Releases for a newer version (Settings, Updates). The check runs only when the
person presses Check for updates, or at start when they turned that on. An update is simply the
latest published release, so publishing one is the same as a release, with these steps in order.

1. Bump `version` in `apps/desktop/package.json` to a higher version than the last release. The
   updater compares versions, so an equal or lower one is never offered. Update `CHANGELOG.md`. The
   GitHub release body becomes the release notes in the update window, so write it for users.
2. Land it on `main`, then tag it: `git tag v1.1.0 && git push origin v1.1.0`. The workflow stops if
   the tag differs from the desktop version.
3. The workflow builds on all three systems, signs where secrets exist, and publishes. For the
   updater, the release must hold these files, and the workflow fails if one is missing:
   - `latest.yml` and `Scrim-Setup-<version>.exe` plus its `.blockmap` (Windows).
   - `latest-mac.yml`, with the `.zip` and `.dmg` of both architectures (macOS). The Mac updater
     installs from the zip. The two Mac builds each write a `latest-mac.yml`, so the publish job
     joins them with `apps/desktop/scripts/merge-mac-update-info.mts`.
   - `latest-linux.yml` and the `.AppImage` (Linux). A deb install is not updated in place.
4. Publish the release as a normal release, not a draft or a pre-release. `electron-updater` ignores
   drafts, and ignores pre-releases unless told otherwise.
5. Do not edit or replace a file on a published release. The update file stores the SHA-512 of each
   file, and a changed file is refused as a checksum error. Publish a new version instead.
6. Check from an older installed version: Settings, Check for updates. The New update available pill
   shows on the Settings item, Update now downloads, and Restart and install installs.

What is signed matters: on Windows, an unsigned build installs updates without a publisher check.
Once SignPath signs the installer, the updater verifies the publisher name before it installs.

What has not been tested: a real update on a real machine. The flow is tested against a local HTTP
server with a fake updater, and the real `electron-updater` is only exercised in a development run
pointed at a local feed. A signed, packaged update from a real GitHub release, and the Mac and Linux
update paths, have not been run. Do that with a throwaway release (deleted afterwards) on a real machine before
announcing a release that relies on it.
