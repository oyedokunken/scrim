# Architecture

This file grows with the project. Phase 1 holds the website, and Phase 2 starts the desktop app. The working agreement in `CLAUDE.md` and the plan in `docs/phase-2-plan.md` come first when they conflict with anything here.

## Desktop security baseline

The baseline lives in a few small modules, each locked by tests:

- `src/main/security.ts` holds the web preferences for every window, snapshot tested.
- `src/main/csp.ts` is the one source of the Content Security Policy.
- `src/main/app-protocol.ts` serves the renderer from `app://scrim` and attaches the policy to every response.
- `src/main/renderer-target.ts` decides where the renderer loads from and returns the one allowed origin.
- `src/main/harden.ts` applies the session and web contents guards. The web contents guards run from `web-contents-created`, so every window gets them.
- `src/main/external-urls.ts` and `src/main/external-opener.ts` are the only way a link leaves the app.
- `apps/desktop/build/fuses.mts` holds the Electron fuses, verified against the packaged binary in CI.
- The permission handler and check allow exactly three permissions, and only for the app's own origin: `media` (camera and microphone), `display-capture`, and `fullscreen`, which lets the shared video player enter fullscreen. Every other permission is refused. A table driven test in `tests/unit/hardening.test.ts` pins the list.

Any change to these needs an ADR.

## Updates

The app can update itself from GitHub Releases with `electron-updater`. It is the one permitted use of the network (hard rule 6).

- `src/main/updates/update-controller.ts` is the flow, written against a small `UpdaterLike` interface so tests inject a fake or a local HTTP server. `real-updater.ts` is the only file that imports `electron-updater`.
- It checks only when the person presses Check for updates, or at start when the `autoCheckUpdates` setting is on (off by default). It never checks, downloads or installs while a recording or an export runs or the editor is open.
- `autoDownload` and `autoInstallOnAppQuit` are false. A download starts only from the Update now button, and the install happens only from the restart button.
- The only request is for the release metadata (`latest.yml`) and the file the person asked for. It carries no identifier. The release notes are turned into plain text before they reach the page.
- A failed check or download is classified (offline, blocked, checksum, signature) and leaves the installed app untouched, because nothing is installed before the restart.
- The update request uses the `electron-updater` session, set to the system proxy for that session only (see ADR 0006). Every other session stays on `--no-proxy-server`.
- A real signed update on a real machine has not been tested. See `docs/releasing.md`, "Publishing an update".

## Security notes for later milestones

- Any new session or partition must register the app protocol handler and the session hardening. The handler and the hardening are set up on the default session only, so a window with its own partition would load without them.
- User recordings are never served through `app://`. Playback needs a separate read-only scheme that is scoped to session folders.
- WebAssembly needs a `.wasm` content type, `'wasm-unsafe-eval'` in the policy, and an ADR before it is added.
- Links to the operating system privacy settings (M5) use a dedicated channel with fixed URLs. They do not widen the external link allowlist.
- No UI library that injects `<style>` tags at runtime (most CSS-in-JS libraries do). The packaged policy is `style-src 'self'`, so those styles would be blocked. Use plain CSS files, CSS modules or a build time extractor, and check the packaged build, because the dev server allows inline styles and hides the problem.

## The recording pill and its microphone and camera buttons

The pill is a small frameless window that stays on top, never takes focus (`focusable: false`, shown with `showInactive`) and is left out of the video with `setContentProtection(true)`. On Windows that flag sets `WDA_EXCLUDEFROMCAPTURE`, which hides the window from capture on Windows 10 version 2004 (build 19041) and later. On older Windows 10 builds the flag falls back to `WDA_MONITOR`, which shows the window as a solid black rectangle in the capture instead of hiding it, so the pill would appear as a black box in the video. macOS and Linux X11 hide it through their own capture exclusion where the compositor supports it. The e2e test `the pill never appears in the recorded video` checks that no pill pixels reach the file.

The microphone and camera buttons keep their state in the main process (`main/recording/media-state.ts`). The pill asks for a named state (`set-mic-muted`, `set-camera-enabled`), never "flip", so a repeated press is the same request. Main switches the live track on or off in the recorder page (`track.enabled`), so the recording carries on in step: a muted microphone records silence and a disabled camera records black frames. The bubble window is hidden while the camera is off. Each change is written to `toggles` in `session.json` on the recording clock, which leaves paused time out, and export reads that log to hide the bubble and silence the sound for those stretches. A device that was off before recording cannot be turned on mid recording.

## How a rendered video finds its project

A video in the Library must lead back to the working files it was rendered from, or Edit has nothing to open. Three links are tried in order:

1. export.json in the project folder. Every render writes it with the path of the video and the project id (the session id). The Library follows it first, and a rename in the Library rewrites it, so a renamed video keeps its project.
2. The comment tag inside the MP4, scrim-project:<session id>, written by the exporter with ffmpeg -metadata. It is read with ffprobe only for videos that no project claimed, and cached by path and modified time. It survives a moved or renamed file and a lost export.json.
3. For videos rendered before ids were stored: the file name equals the session name, or the name followed by a number.

A video that none of these link has no project (the working files were deleted or moved). Edit stays disabled and says why. Raw recordings are never modified by any of this.

## Disabled controls explain themselves

Every disabled control gives a plain reason. The shared Button takes disabledReason: while disabled it becomes ria-disabled (still focusable, clicks ignored) and shows the reason on hover and keyboard focus, described through ria-describedby. Escape hides it. Segmented, Tile, Switch and Select take the same prop. A control with no reason keeps the native disabled attribute.

## The platform interface and Linux

Scrim for Linux is an adaptation: the screens, the editor, auto zoom planning, effects, export, the Library, Settings and recovery are the same code on every system. Only what differs per system sits behind `Platform`, in `apps/desktop/src/main/platform/platform.ts`.

- `createPlatform({ platform, env })` is pure and returns one adapter. `currentPlatform()` builds it once from the real process, and `setPlatformOverride` lets tests swap it. The rest of the main process asks the adapter and does not read `process.platform` for these questions.
- The adapter says where working files, recordings and screenshots live (`folders`), how capture works (`capture.mode`: `enumerate` or `portal`), which area chooser to use (`capture.areaChooser`: `overlay` or `still-frame`), whether the mouse hook can work, whether global shortcuts may fail to register, whether `setContentProtection` hides a window from capture, whether the tray needs an indicator host, whether there is a share sheet, whether the taskbar can carry a recording dot, and the Chromium switches to set before ready.
- Windows is the reference adapter and behaves exactly as before. macOS gets the generic adapter, which keeps what the existing macOS files do. A real macOS adapter is a new branch in `createPlatform` and nothing else has to change.
- The page learns what it needs through the `platform:info` channel (`src/shared/platform-info.ts`): file manager name, share sheet, cursor effects and the plain words to show when they are off. Until the answer arrives the page assumes Windows.

Linux behavior:

- Working files: in the app's user data folder (`~/.config/Scrim/Projects`). Recordings go to `Videos/Scrim`, screenshots to `Pictures/Scrim`, from the XDG folders. Paths show with forward slashes, and the file manager is called Files.
- X11: everything works as on Windows, including the mouse hook for auto zoom and cursor effects, global shortcuts and the overlay area chooser.
- Wayland: capture goes through the system screen sharing portal (PipeWire). Per the Electron `desktopCapturer` documentation, on Linux with PipeWire `getSources` returns a single source, a request for both types comes back as a window capture, and a cancelled picker denies the request. So the portal shows its own picker, `portal-capture.ts` keeps the one source and its still picture, and `setDisplayMediaRequestHandler` hands that source to the recorder without asking again. The area chooser becomes a still frame chooser: Scrim's own full screen window shows the still and the person drags the box (`still-area.ts`), because Wayland does not let an app cover other apps. `WebRTCPipeWireCapturer` and the Ozone hint are set before ready (`platformSwitches`). The mouse hook reports `unavailable` with reason `wayland`, so auto zoom and cursor effects are off and the Record, Zoom and Cursor pages say why. Manual zoom moments in the editor still work. Global shortcuts may not register, Settings says so, and the tray menu starts and stops.
- No window can be hidden from capture. `live-windows-policy.ts` decides what to do instead: the camera bubble shows while the person centres themselves, then hides right before capture (the camera is still recorded and drawn at export), the pill stays outside a region or is not shown for full screen and window recordings, and a system notification says how to stop. The chooser and countdown close and the app waits longer (`capture.settleMs`) before the first frame.
- No share sheet, so Share is hidden. There is no taskbar dot, and the tray icon and tooltip carry the recording state. On GNOME the tray needs AppIndicator support, and when there is no tray the close policy minimizes instead of hiding.

What is covered only by unit tests with fakes: every adapter branch, the portal capture, the still frame logic, the live windows policy and the page gating. What needs a real Ubuntu 24.04 run on X11 and on Wayland is listed in the release notes for 1.2.0.
