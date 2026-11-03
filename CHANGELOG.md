# Changelog

All notable changes to Scrim are documented here.

## Unreleased

### Linux (1.2.0)

- Linux x64 builds as an AppImage and a deb package. X11 gets every feature. On Wayland, auto zoom and cursor effects are off, because Wayland does not let apps watch the mouse, and recording goes through the system screen sharing portal
- Both Linux files are signed with GPG: a detached `.asc` signature next to each, and a signed `SHA256SUMS.txt` for all three systems. The public key is `docs/scrim-release-key.asc`, and the website shows the two commands that verify a download
- The deb declares its dependencies, installs a desktop entry and icons, removes all of it on uninstall, and installs a small AppArmor profile so the Chromium sandbox works on Ubuntu 24.04. The sandbox is never turned off. The website help gives the AppImage steps for Ubuntu 24.04
- H.264 on Linux comes from the graphics chip through VA-API where there is one (the arguments now include the device and the upload), and from the libopenh264 software encoder otherwise. The bundled FFmpeg is the pinned LGPL build, now checked for its licence and a short test encode in CI. See ADR 0009
- A deb install shows "A new version of Scrim is out" with a link to the release page. The AppImage updates itself
- The download dialog asks which Linux package you want

### Added (desktop app)

- Electron app with a locked down baseline: sandboxed renderer, context isolation, a strict content security policy on the `app://` protocol, navigation and permission guards, one allowlisted link opener, a single instance lock, and Electron fuses checked in the packaged binary
- Typed IPC bridge with zod schemas on every channel, a settings store that recovers from a damaged file, and a local logger that never writes a path or a window title
- Recording engine: screen, camera and microphone as separate tracks streamed to disk, a mouse input log, pause and resume with a clock that excludes paused time, disk space checks, crash recovery, and plain error messages for a full disk, folder problems, unplugged devices, a removed display and a recorder crash
- Working files live in the app's own projects folder (`%LOCALAPPDATA%\Scrim\Projects`), so the folder you choose only receives finished exports and screenshots
- Area overlay: dim the screen, draw a region with handles, pick a window or the full screen, toggle camera and microphone, then a 3, 2, 1 countdown that cannot be skipped and can be turned off
- Floating recording pill with a blinking record dot, timer, pause, stop and a confirmed discard, hidden from capture
- Live camera bubble with a microphone level dot that snaps to corners, moves away from the cursor and records its positions as keyframes
- Screenshots of a region, a window or the full screen, saved as one PNG and copied to the clipboard, with a crop that is exact at every display scale
- Bundled LGPL FFmpeg build pinned by checksum, used for remux and verification
- Camera, audio and background pages with live previews, plus cursor and zoom pages
- Global shortcuts for start, stop and screenshot, and a first run check for camera and microphone
- App icon generated from the brand mark for every window, the installer and the tray
- Settings in two equal columns with green buttons, and an About card with the version, release date, last updated time and the computer name and system (shown only on that screen, never sent or logged)
- In-app update check from GitHub Releases: a Check for updates button, an optional check at start (off by default), a New update available pill, and an update window with the notes, size and a download progress bar. Nothing is downloaded or installed until you press Update now and then the restart. No check runs while recording, editing or exporting
- Shared session format in `@scrim/core` with a bubble keyframe list, window bounds, display ids and the edit list
- Stop now writes the finished MP4 to your recordings folder by itself. The finished page opens at once with a live preview, the video renders in the background with the percent and time left on the page and in the status bar, and a toast says where it was saved. Renders run one at a time, so you can start a new recording meanwhile. Cancel keeps the recording, a failed render shows the reason with Try again and Details, and a render that Scrim did not live to finish is offered again on the next launch

### Added

- Landing page: hero with a live auto zoom demo, eight stacking feature cards numbered 01/08 to 08/08, use cases, download, FAQ, contribute and contact sections
- Download dialog with React Hook Form and zod, system detection, and an error under each field
- Download API with origin check, honeypot, rate limit, hashed IP and release lookup
- Confirmation email for visitors, with a Support link, and a note email for the owner, both sent with Nodemailer
- Unsubscribe page and endpoint, POST only
- Floating back to top button styled as a recording, with a timer and progress ring
- Footer with the full white logo, a Show your Support button and a Built by popover with five social icons
- Header Download button at every width, and a Support button in the mobile menu
- Palette: green, butter, black and white, plus a record red for recording indicators

- Initial project documentation
- Repository development guidance
- Security reporting policy
- MIT license
- Project wiki overview
- Developer information in the README

### Changed

- External links now open in a new tab with `rel="noopener noreferrer"`
- Form errors show in red
- Footer social icons are green by default and black on hover, in a single row
- The footer legal lines are centered on phones
