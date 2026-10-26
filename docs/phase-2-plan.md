# Scrim Phase 2 execution plan

Status: draft for owner approval
Date: 2026-10-26
Owner: Oyedokun Kehinde
Suggested location in the repo: `docs/phase-2-plan.md`

This plan turns Phase 2 (the desktop app shell, capture, crash safe recording and recovery) into ordered milestones with tasks, files, tests and exit gates. The root working agreement still wins on any conflict. Where this plan proposes a change to that agreement, it says so and lists it under "Owner decisions".

---

## 1. How to use this document

- Work top to bottom. Each milestone has a goal, tasks, the files it touches, the tests it adds, acceptance criteria and an exit gate.
- A milestone is done only when every acceptance criterion is checked and `pnpm check` passes.
- Each task is one small commit or a short series of them. Commit messages follow Conventional Commits with a `desktop` scope, for example `feat(desktop): add single instance lock`.
- Spikes produce an ADR, not production code. Spike code lives under `spikes/` on a branch and is deleted or rewritten before merge.
- When a decision is made, record it in `docs/adr/` and update the build log in the working agreement.

---

## 2. Goal and scope

### 2.1 Goal

At the end of Phase 2, a person can install Scrim on Windows, macOS or Linux, open it, choose a region, a display or a window, toggle camera and microphone, press Start, pause and resume, press Stop, and find a complete, playable recording in the folder they chose. If the app or the computer crashes mid recording, the next launch offers to recover the session, and recovery produces a playable file.

### 2.2 In scope

- `apps/desktop` scaffold: Electron, electron-vite, React, strict TypeScript.
- Security baseline, locked by tests.
- Native window controls on all three systems, single instance lock, tray.
- Home screen: source picker, region selector, cursor style and zoom settings (stored only, applied in Phase 4), camera and mic toggles, destination folder.
- Capture of screen, camera and microphone as separate tracks, streamed to disk.
- Input log (mouse moves and clicks) with a recording clock that stays aligned across pause and resume.
- Session format on disk, clean close marker, recovery with remux.
- Handled error states: disk full, permission denied, device unplugged, display removed.
- Platform permission flows and first run guidance.
- Desktop CI: unit tests, Playwright Electron smoke tests, unsigned packaging on all three systems.

### 2.3 Out of scope (later phases)

- Export to MP4 with effects (Phase 3 and 4). Phase 2 only remuxes for recovery and for a playable raw file.
- Cursor halo, ripples, auto zoom rendering, backdrop, camera bubble compositing, trim and cut, before and after (Phase 4).
- Global shortcuts, screenshots, auto update, code signing, release automation (Phase 5).
- System audio capture. See Owner decisions.

### 2.4 Proposed change to the phase table

The working agreement places the input event log, face camera, microphone, and pause and resume in Phase 4. This plan moves their capture into Phase 2 and leaves their rendering in Phase 4.

Reason: the recording clock, track offsets and the session format must be designed together. If camera, mic and the input log are bolted on in Phase 4, the session format and the recovery code written in Phase 2 would have to change, and recordings made in between would need migration. Capturing everything now and rendering later keeps the "record, then render" model clean.

This needs owner approval (Decision D1).

---

## 3. Sequencing principle

Prove the risky parts before building the comfortable parts.

1. Scaffold and lock the security baseline (cheap, valuable, and every later milestone builds on it).
2. Run timeboxed spikes on capture performance, cursor hiding, export speed and the input hook. These can change the architecture.
3. Write ADRs from the spike results.
4. Build the product milestones on the decided architecture.

Desktop CI (M11) starts right after M1 and grows with each milestone.

---

## 4. Milestones at a glance

Estimates are working days for one engineer. With the team working in parallel on independent milestones, calendar time shrinks.

| ID  | Milestone                                           | Depends on     | Estimate           |
| --- | --------------------------------------------------- | -------------- | ------------------ |
| M0  | Phase 1 loose ends (parallel track)                 | none           | 3 to 5             |
| M1  | Desktop scaffold and security baseline              | Go ahead       | 3 to 4             |
| M2  | Spikes and ADRs                                     | M1             | 6 to 8 (timeboxed) |
| M3  | App shell: window, lifecycle, tray, single instance | M1             | 3                  |
| M4  | Typed IPC contract, settings store, logging         | M1             | 3                  |
| M5  | Permissions and platform detection                  | M4             | 2 to 3             |
| M6  | Home screen and source selection                    | M4, M5         | 4 to 5             |
| M7  | Capture and crash safe chunk writer                 | M2, M6         | 6 to 8             |
| M8  | Input log, recording clock, pause and resume        | M2, M7         | 4 to 5             |
| M9  | Session format and recovery                         | M7, M8         | 4                  |
| M10 | Error states and hardening                          | M7, M9         | 3                  |
| M11 | Desktop CI and packaging smoke                      | M1, then grows | 3 to 4             |

Rough total: 45 to 55 engineer days.

---

## 5. M0: Phase 1 loose ends (parallel track)

Goal: close what Phase 1 left open without blocking the desktop work.

### Tasks

- [ ] Fix the failing Playwright specs: `download.spec.ts`, `page.spec.ts`, `chrome.spec.ts`. Start each fix with the failing assertion reproduced locally, then fix the cause, never the assertion.
- [ ] Run Lighthouse CI on the production build (`next build` then `next start`). Record scores. Budgets: performance 95 mobile, accessibility 100, best practices 100, SEO 100.
- [ ] Check first load JavaScript stays under 100 kB gzipped now that react-hook-form and zod sit in the lazy dialog chunk. Confirm they are not in the main chunk.
- [ ] Update the privacy page to mention the owner notification email.
- [ ] Run `pnpm knip` and fix findings.
- [ ] Write `docs/architecture.md`, `docs/testing.md`, `docs/releasing.md` (first versions can be short).
- [ ] Add CI workflows that exist only on paper: `ci`, `landing-quality`, `commit-policy`, `secrets-scan`, `codeql`.
- [ ] Add issue and PR templates.
- [ ] Split Supabase into separate dev and prod projects.
- [ ] Decide on Decision D5 (optional download form).

### Acceptance

- [ ] Full Playwright suite green on CI.
- [ ] Lighthouse budgets enforced in CI and passing.
- [ ] No preview deployment can reach production data.

---

## 6. M1: Desktop scaffold and security baseline

Goal: an empty but correctly locked down Electron app that builds, runs and is tested.

### 6.1 Tasks

- [ ] Resolve exact versions for new dependencies under the 7 day release age and add them to the pnpm catalog: `electron`, `electron-vite`, `electron-builder`, `@vitejs/plugin-react`, `@electron/fuses`, `@playwright/test` (already present). Never write `^`, `~` or `latest`.
- [ ] Create `apps/desktop` with this layout:

```
apps/desktop/
  electron.vite.config.ts
  electron-builder.config.ts
  package.json
  tsconfig.json
  tsconfig.node.json
  tsconfig.web.json
  src/
    main/
      index.ts              app entry, lifecycle
      security.ts           webPreferences constant, session hardening
      windows/
        main-window.ts
      ipc/
        register.ts         registers handlers from the contract
      log.ts                local logger, no network
    preload/
      index.ts              contextBridge, typed window.scrim
    renderer/
      index.html
      src/
        main.tsx
        App.tsx
    shared/
      ipc-contract.ts       zod schemas for every channel
      types.ts
  tests/
    unit/
    e2e/
  resources/                icons per platform
```

- [ ] Add `@scrim/core` and `@scrim/tokens` as workspace dependencies. electron-vite bundles them. Keep all JS libraries in `devDependencies` so they are bundled. Native modules (later) go in `dependencies` and are unpacked from the asar.
- [ ] ESLint boundary rules for the desktop app:
  - renderer imports nothing from `main`, `preload`, `node:*` or `electron`.
  - preload imports only `electron` and types.
  - `shared` is environment neutral.
  - Neither app imports the other.
- [ ] Write the security constant and its test **first**.

### 6.2 Security constant

```ts
// src/main/security.ts
import type { WebPreferences } from 'electron';

export const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
} as const satisfies WebPreferences);
```

```ts
// tests/unit/security.test.ts
import { describe, expect, it } from 'vitest';
import { SECURE_WEB_PREFERENCES } from '../../src/main/security';

describe('security baseline', () => {
  it('locks the web preferences', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchInlineSnapshot();
  });
  it('is frozen', () => {
    expect(Object.isFrozen(SECURE_WEB_PREFERENCES)).toBe(true);
  });
});
```

The inline snapshot is the point: any change to the baseline shows up in review as a snapshot diff.

### 6.3 Session hardening (main process)

- [ ] Block navigation: `will-navigate` and `will-redirect` call `preventDefault()` unless the URL is the app's own page.
- [ ] Deny new windows: `setWindowOpenHandler(() => ({ action: 'deny' }))`.
- [ ] Deny webviews: `will-attach-webview` calls `preventDefault()`.
- [ ] Permission request handler: allow only `media` and `display-capture`, and only for the app's own origin. Deny everything else.
- [ ] Permission check handler: same allowlist.
- [ ] `shell.openExternal` only through one allowlisted IPC channel that validates the URL against a list of allowed hosts (GitHub repo, releases, docs).
- [ ] Strict CSP for the packaged renderer, set as a response header through `session.webRequest.onHeadersReceived` and as a meta tag:
      `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      The dev server gets a looser policy only when `!app.isPackaged`.
- [ ] Electron fuses at package time with `@electron/fuses`: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `EnableEmbeddedAsarIntegrityValidation` on, `OnlyLoadAppFromAsar` on, `EnableCookieEncryption` on.

### 6.4 Tests

- Unit: the security constant snapshot, the CSP string builder, the permission handler (table driven: permission name, origin, expected result), the URL allowlist for `openExternal`.
- E2E (Playwright Electron): app launches, window shows, `window.require` is undefined in the renderer, `process` is undefined in the renderer, navigation to an external URL is blocked, `window.open` returns null.

### 6.5 Acceptance

- [ ] `pnpm dev` opens an empty Scrim window on Windows.
- [ ] `pnpm check` passes with the desktop app included in turbo.
- [ ] Security tests pass and fail when any baseline value is changed.
- [ ] Packaged build (unsigned) runs on Windows locally.

### Exit gate

Owner reviews the security baseline once. After that, any change to it needs an ADR.

---

## 7. M2: Spikes and ADRs

Goal: answer the questions that can change the architecture, before building on top of it. Every spike is timeboxed. If a spike runs out of time, the result is "inconclusive" plus what was learned, and the fallback is chosen.

Reference machines (record exact specs in each ADR):

- Windows: a mid range laptop (owner's main machine).
- macOS: an Apple Silicon Mac (borrowed or CI runner for what CI can do).
- Linux: Ubuntu LTS on X11 and on Wayland (VM is acceptable for functional checks, not for performance numbers).

### 7.1 S1: Capture performance and cursor hiding (2 to 3 days)

Questions:

1. Can Chromium capture (desktopCapturer plus `setDisplayMediaRequestHandler`) with MediaRecorder hold 1080p at 60 fps and 4K at 30 fps without dropping frames?
2. Can the cursor be hidden in the captured stream on each platform?
3. Which MediaRecorder container and codec work best? Check `MediaRecorder.isTypeSupported` for, in order: `video/mp4;codecs=avc1`, `video/webm;codecs=h264`, `video/webm;codecs=vp9`, `video/webm;codecs=vp8`.
4. What CPU and memory does recording cost?

Method:

- Minimal spike app: pick a display, record 60 seconds with a 1000 ms timeslice, write chunks to disk through the main process.
- Play a high motion test pattern on screen (a moving frame counter) so dropped frames are measurable.
- Count delivered frames on the recording with `ffprobe -count_frames` and compare against the expected count.
- Sample CPU and memory every second from the main process (`app.getAppMetrics()`).
- Test the cursor: request `cursor: 'never'` in the video constraints and inspect the output. Record which platforms honor it.

Pass criteria:

- At least 98 percent of expected frames at 1080p60 and 4K30 on the Windows reference machine.
- Cursor hidden on Windows and macOS.
- Total CPU for the app under 30 percent of the machine at 1080p30.

Fallback if it fails: capture with a bundled FFmpeg child process (`ddagrab` or `gdigrab` with `draw_mouse 0` on Windows, `avfoundation` with `capture_cursor 0` on macOS, `x11grab` with `draw_mouse 0` on X11). Wayland stays on the portal through Chromium. Output: ADR 0001 "Capture backend".

### 7.2 S2: Export speed (3 days)

This belongs to Phase 3, but its result decides the raw recording format, so it runs now.

Candidates, each on the same 60 second 1080p30 test recording with a mock zoom, backdrop, rounded corners, shadow, cursor halo and camera bubble:

- **A. FFmpeg sandwich**: FFmpeg decodes to raw frames, a worker draws on OffscreenCanvas, a second FFmpeg encodes H.264 and muxes AAC.
- **B. WebCodecs**: `VideoDecoder` decodes, a worker draws on OffscreenCanvas, `VideoEncoder` encodes H.264 (hardware when available), a JavaScript MP4 muxer writes the file, audio is encoded and muxed by FFmpeg if `AudioEncoder` lacks AAC on that platform. Evaluate a maintained muxer library and pin it exactly.
- **C. FFmpeg filter graph**: zoom and crop via filters driven by camera keyframes, overlays via `overlay`. No canvas.

Measure: real time factor (output seconds per wall second), peak memory, output quality (visual check plus ffprobe), and whether hardware encoding was used. Note that H.264 encoder availability through WebCodecs differs by platform, especially on Linux; record what each platform reports from `VideoEncoder.isConfigSupported`.

Pass criteria: at least 1.0x real time for 1080p30 on the Windows reference machine.

Output: ADR 0002 "Export pipeline". It also states the preferred raw recording format, since decoding cost depends on it.

### 7.3 S3: Global input hook and coordinates (1 to 2 days)

Questions:

1. Does `uiohook-napi` build and load in packaged Electron on all three systems?
2. Do its coordinates match Electron's `screen` coordinates on Windows with mixed DPI monitors (for example 100 percent and 150 percent side by side)?
3. What is the event rate for mouse moves, and what does logging cost?
4. On macOS, what exactly is needed for permission (Accessibility, Input Monitoring) and how does the app detect it?

Method: log moves and clicks while moving across monitors, then overlay the logged points on a screenshot of each display to check alignment. Test `screen.screenToDipPoint` on Windows for the physical to DIP conversion.

Output: ADR 0003 "Input hook and coordinate mapping".

### 7.4 S4: Cursor data on Wayland (1 day, investigation only)

Question: can Scrim get cursor position on Wayland without a global hook? The ScreenCast portal has a cursor mode that delivers cursor position as stream metadata. Check whether Chromium's PipeWire capture path in Electron exposes it in any usable way.

Outcome is one of:

- Usable: plan Wayland cursor position support in Phase 4 (clicks will still be missing, so ripples stay off).
- Not usable: confirm the current rule (cursor effects and auto zoom off on Wayland, explained in plain words).

Output: a short note appended to ADR 0003.

### 7.5 ADR template

```md
# NNNN Title

Date: YYYY-MM-DD
Status: proposed | accepted | superseded by NNNN

## Context

What problem, what constraints, what the spike measured.

## Options

Each option with measured results.

## Decision

What we chose and why.

## Consequences

What gets easier, what gets harder, what we must watch.

## Evidence

Machine specs, commands, raw numbers, links to spike branches.
```

### Exit gate

ADRs 0001, 0002 and 0003 accepted by the owner. M7 and M8 do not start before this.

---

## 8. M3: App shell

Goal: a window that behaves like a real desktop app on all three systems.

### Tasks

- [ ] Window chrome:
  - Windows and Linux: native frame, or `titleBarStyle: 'hidden'` with `titleBarOverlay` colored from the tokens. Pick one per platform and test it.
  - macOS: `titleBarStyle: 'hiddenInset'` so the traffic lights stay.
  - Never `frame: false`.
- [ ] Minimum window size so the home screen never clips. Remember size and position per display, and restore only if that display still exists.
- [ ] Single instance lock with `app.requestSingleInstanceLock()`. A second launch focuses the existing window.
- [ ] Tray icon with: Show Scrim, Start recording, Stop recording (when recording), Quit.
- [ ] Close behavior:
  - Not recording: close quits on Windows and Linux, hides to the dock on macOS (platform convention).
  - Recording: show a dialog with "Keep recording in the tray", "Stop and save", and "Cancel". Never discard silently.
- [ ] Quit during recording (from tray, Cmd+Q, or system shutdown): stop the recorders, flush, write the clean close marker, then quit. Handle `before-quit` and, on Windows, `session-end`.
- [ ] Recording indicator in the tray icon (record red dot) while recording.

### Tests

- Unit: the close decision function `decideClose(state) -> 'quit' | 'hide' | 'ask'` is pure and table tested.
- E2E: minimize, maximize and close work; a second launch focuses the first window; closing during a fake recording shows the dialog.

### Acceptance

- [ ] Minimize, maximize and close work on Windows, macOS and Linux (CI for what it can cover, manual on real machines for the rest, with a checklist in the PR).

---

## 9. M4: Typed IPC, settings, logging

Goal: one typed, validated path between renderer and main, plus persistent settings and local logs.

### 9.1 IPC contract

```ts
// src/shared/ipc-contract.ts
import { z } from 'zod';

export const contract = {
  'settings:get': { input: z.void(), output: SettingsSchema },
  'settings:set': { input: SettingsPatchSchema, output: SettingsSchema },
  'sources:list': {
    input: z.object({ kinds: z.array(z.enum(['screen', 'window'])) }),
    output: z.array(SourceSchema),
  },
  'folder:choose': { input: z.void(), output: z.string().nullable() },
  'recording:start': { input: StartRequestSchema, output: StartResultSchema },
  'recording:pause': { input: z.void(), output: RecorderStateSchema },
  'recording:resume': { input: z.void(), output: RecorderStateSchema },
  'recording:stop': { input: z.void(), output: StopResultSchema },
  'recovery:list': { input: z.void(), output: z.array(RecoverableSessionSchema) },
  'recovery:run': {
    input: z.object({ sessionId: z.string().uuid() }),
    output: RecoveryResultSchema,
  },
  'recovery:dismiss': { input: z.object({ sessionId: z.string().uuid() }), output: z.void() },
  'permissions:status': { input: z.void(), output: PermissionStatusSchema },
  'permissions:request': { input: PermissionKindSchema, output: PermissionStatusSchema },
  'shell:open-external': { input: z.object({ url: AllowedUrlSchema }), output: z.void() },
  'shell:show-in-folder': { input: z.object({ path: z.string() }), output: z.void() },
} as const;

export type Channel = keyof typeof contract;
```

Rules:

- Adding a channel follows this order: contract, main handler, preload bridge, `ScrimApi` type, tests.
- The main process validates the sender frame (own page only), the input and the output on every call.
- `shell:show-in-folder` only accepts paths inside a known recording folder.
- Events from main to renderer (recorder state, disk warnings, device lost) use a separate typed event map, also validated.
- Chunk data never goes through `invoke`. It goes through a `MessagePort` (see M7).

### 9.2 Settings store

- [ ] Settings live in a JSON file in `app.getPath('userData')`, validated with zod on read. An invalid file is backed up and replaced with defaults, never crashing the app.
- [ ] Writes are atomic: write to a temp file, fsync, rename.
- [ ] Settings: destination folder, last source kind, cursor style, zoom level, hold after click, smoothness, zoom on or off, camera device, mic device, camera on, mic on, frame rate target.

### 9.3 Local logging

- [ ] A small logger writing to `app.getPath('logs')` with rotation. No network, ever.
- [ ] No personal data in logs: no file contents, no window titles beyond a hash, no full paths of user files (log the folder name only).
- [ ] "Open logs folder" in a Help menu so users can attach logs to issues.

### Tests

- Unit: every channel rejects invalid input; a forged sender is rejected; settings migration and invalid file recovery; atomic write leaves a valid file when interrupted (simulate by killing between write and rename).

---

## 10. M5: Permissions and platform detection

Goal: the app knows what it may do on this machine and explains what is missing in plain words.

### Tasks

- [ ] Platform info in main: OS, architecture, and on Linux the session type from `XDG_SESSION_TYPE` (`x11` or `wayland`).
- [ ] macOS:
  - Screen Recording status via `systemPreferences.getMediaAccessStatus('screen')`. If not granted, explain how to grant it and that a restart of Scrim is needed.
  - Camera and microphone via `systemPreferences.askForMediaAccess`.
  - Accessibility via `systemPreferences.isTrustedAccessibilityClient(false)`, with a button that prompts.
  - Entitlements for audio input, camera and JIT in the build config, plus the usage description strings.
- [ ] Windows: camera and mic privacy settings can block devices. Detect a `NotAllowedError` and link to the right Settings page through the allowlisted channel.
- [ ] Linux on Wayland: recording goes through the portal picker. Show a short note that cursor effects and auto zoom are off on Wayland, and why.
- [ ] First run permission guide: one screen per missing permission, in order, skippable, revisitable from Help.

### Tests

- Unit: permission state machine (unknown, denied, granted, restart needed) with table tests.
- E2E with mocked platform info: the guide shows the right screens.

---

## 11. M6: Home screen and source selection

Goal: the one screen where a recording starts.

### Tasks

- [ ] Home screen layout using tokens and Urbanist. Light theme only.
  - Source: Region, Display, Window.
  - Cursor style: halo with ripples, halo only, ripples only, off (stored, applied in Phase 4).
  - Zoom: on or off, level 1.2 to 3, hold after click, smoothness (stored).
  - Camera toggle and device picker, with a small live preview.
  - Mic toggle and device picker, with a live level meter.
  - Destination folder with a Change button.
  - Start button.
- [ ] Source list from `desktopCapturer.getSources` with thumbnails, refreshed on focus. Window titles shown to the user but never logged.
- [ ] Region selector:
  - One transparent, frameless, always on top overlay window per display, shown only during selection.
  - Drag a box, show its size in pixels, Enter to confirm, Escape to cancel.
  - Snap the box to even dimensions (needed later by H.264).
  - Decision for Phase 2: record the full display and store the region as a crop rectangle in the session. Cropping happens at export. This avoids live cropping cost and keeps the raw recording simple. Revisit if S1 shows full 4K capture is too costly for small regions.
- [ ] Device changes: listen to `navigator.mediaDevices` `devicechange` and refresh the lists.
- [ ] Keyboard access for every control, visible focus, axe clean.

### Tests

- Unit: region math (clamp to display, even dimensions, multi display coordinates, DPI scaling).
- Component tests for the home screen with mocked `window.scrim`.
- E2E: pick a display, toggle camera and mic, change folder (mocked dialog), start a fake recording.

---

## 12. M7: Capture and crash safe chunk writer

Goal: recording screen, camera and mic to disk so that nothing is lost, whatever happens.

Assumes ADR 0001 chose Chromium capture. If it chose FFmpeg capture, the screen track section changes; the session format, writer and recovery stay the same.

### 12.1 Pipeline

```
Renderer (recorder page)                  Main process
------------------------                  ------------
getDisplayMedia -> MediaRecorder(screen) --chunks--> MessagePort --> ChunkWriter(screen file)
getUserMedia    -> MediaRecorder(camera) --chunks--> MessagePort --> ChunkWriter(camera file)
getUserMedia    -> MediaRecorder(mic)    --chunks--> MessagePort --> ChunkWriter(mic file)
                                                                    SessionFile (heartbeat)
                                          uiohook ----------------> InputLogWriter (M8)
```

- [ ] Recording runs in a dedicated hidden renderer (the recorder page), not in the home screen renderer, so UI work never competes with capture. It uses the same security baseline.
- [ ] `setDisplayMediaRequestHandler` on the session supplies the chosen source, so no Chromium picker appears (except the system portal on Wayland, which is required).
- [ ] Camera and mic are separate `MediaRecorder` instances with their own files. Never mixed into the screen video.
- [ ] Timeslice of 1000 ms for every recorder.
- [ ] Container and codec chosen from the `isTypeSupported` list decided in ADR 0001.

### 12.2 Chunk transport

- [ ] A `MessageChannelMain` per track. The renderer posts each chunk as an `ArrayBuffer` in the transfer list, so it is moved, not copied.
- [ ] Each message carries `{ track, seq, byteLength, mediaTimeMs }`. The writer checks `seq` is contiguous and logs gaps.
- [ ] Backpressure: the writer reports queued bytes. Above a threshold (for example 64 MB), the UI warns. This should never happen on a healthy disk, so it is a signal of a slow disk or a stuck write.

### 12.3 ChunkWriter

- [ ] Opens the file with `fs.promises.open(path, 'a')`.
- [ ] Appends chunks in order. Calls `filehandle.sync()` at most every 2 seconds and on pause and stop.
- [ ] Updates the session file heartbeat after each sync with the byte count per track.
- [ ] On stop: final sync, close, then mark the track complete in the session file.
- [ ] Pure core (ordering, gap detection, sync scheduling) separated from the fs adapter so it is unit testable with a fake file.

### 12.4 Disk space

- [ ] Before start: check free space with `fs.promises.statfs` on the destination. Refuse to start below a floor (for example 2 GB) with a clear message.
- [ ] During recording: check every 10 seconds. Warn below a soft floor. Below a hard floor, stop and save cleanly, and tell the user why.

### 12.5 After stop

- [ ] Remux each track with FFmpeg (`-c copy`) into a file with correct duration and index, keeping the original raw file. This needs the bundled FFmpeg, so it is added here rather than in Phase 3:
  - Pin the FFmpeg build exactly, note its license (LGPL build preferred, document the choice in an ADR), and unpack it from the asar.
  - Spawn with an argument array, never a shell string.
- [ ] Show the result: file location, duration, size, "Show in folder".

### 12.6 Tests

- Unit: ChunkWriter ordering, gaps, sync schedule, heartbeat contents (fake clock, fake file).
- Integration: record 10 seconds of a synthetic canvas stream through the real writer to a temp folder, then verify with ffprobe.
- E2E (Playwright Electron, Windows CI): start, wait, stop, assert files exist and are playable.
- Kill test: start recording, kill the process with SIGKILL after 5 seconds, assert the raw file has at least 3 seconds of valid media (feeds M9).

### Acceptance

- [ ] A 30 minute 1080p30 recording on the Windows reference machine finishes with no dropped chunks and a playable file.
- [ ] Killing the app mid recording loses at most the last 2 seconds.

---

## 13. M8: Input log, recording clock, pause and resume

Goal: every mouse event lines up with the video frame it belongs to, including across pauses.

### 13.1 One clock

- [ ] The main process owns the recording clock, based on `process.hrtime.bigint()`.
- [ ] The recorder renderer uses `performance.now()`. Measure the offset between the two clocks at start with a short ping exchange (send main time, reply with renderer time, take the sample with the smallest round trip). Store the offset and its uncertainty in the session file.
- [ ] Record each track's start time on the main clock from the recorder's `start` event, corrected by the offset.

### 13.2 Pause and resume

- [ ] `MediaRecorder.pause()` and `resume()` on every recorder at once.
- [ ] Store pause intervals on the main clock: `[{ pausedAt, resumedAt }]`.
- [ ] Media time for any main clock instant: elapsed time since start minus the total of paused time before that instant.
- [ ] Input events that happen while paused are dropped.
- [ ] A pure function `toMediaTime(mainTime, startTime, pauses)` lives in `@scrim/core`, with property tests:
  - monotonic: later main time never gives earlier media time;
  - paused instants map to the pause boundary;
  - total media duration equals wall duration minus paused time.

### 13.3 Input log

- [ ] Load `uiohook-napi` in main, only while recording.
- [ ] Log mouse moves (coalesced to at most 120 Hz), left, right and middle clicks (down and up), and wheel events, with display id and coordinates converted as ADR 0003 decided.
- [ ] Write events as newline delimited JSON to `input.ndjson` during recording, flushed with the video tracks. This survives crashes.
- [ ] On stop: read the NDJSON, convert to media time, validate with `sessionLogSchema` (version 1), write `<name>.scrim.json`. Keep the NDJSON until the JSON is written and verified.
- [ ] If the hook is unavailable (Wayland, macOS permission missing), record without it and mark `input: 'unavailable'` with a reason in the session file. The UI tells the user that cursor effects will be off for this recording.
- [ ] No keyboard events are logged. Ever. This is a privacy rule; add it to the working agreement.

### 13.4 Tests

- Property tests for `toMediaTime`.
- Unit: NDJSON to session log conversion, coalescing, dropping paused events, schema validation.
- Integration: a recording with two pauses; a scripted mouse path; verify that logged media times match the frames where the on screen marker appears (within one frame at 30 fps).

---

## 14. M9: Session format and recovery

Goal: a recording can always be found, understood and recovered.

### 14.1 Session folder (proposed, confirm in ADR 0004)

```
<destination>/
  <name>.scrim/
    session.json          metadata, heartbeat, clean close marker
    screen.raw.webm       raw screen chunks (extension per ADR 0001)
    camera.raw.webm       optional
    mic.raw.webm          optional
    input.ndjson          raw input events, removed after successful conversion
    <name>.scrim.json     validated input log (session log v1)
    edits.json            edit list (empty in Phase 2)
    screen.webm           remuxed playable copy (or .mp4 per ADR 0001)
```

### 14.2 session.json schema (sketch)

```ts
const SessionFileSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  app: z.object({ version: z.string(), os: OsSchema, arch: ArchSchema }),
  source: z.object({
    kind: z.enum(['region', 'display', 'window']),
    displayId: z.string().optional(),
    crop: RectSchema.optional(),
    scaleFactor: z.number().positive(),
  }),
  tracks: z.array(
    z.object({
      kind: z.enum(['screen', 'camera', 'mic']),
      file: z.string(),
      mimeType: z.string(),
      startedAt: z.number(),
      bytesWritten: z.number().int().nonnegative(),
      complete: z.boolean(),
    }),
  ),
  clock: z.object({ rendererOffsetMs: z.number(), uncertaintyMs: z.number().nonnegative() }),
  pauses: z.array(z.object({ pausedAt: z.number(), resumedAt: z.number().nullable() })),
  input: z.union([
    z.object({ status: z.literal('recorded'), file: z.string() }),
    z.object({
      status: z.literal('unavailable'),
      reason: z.enum(['wayland', 'permission', 'error']),
    }),
  ]),
  heartbeatAt: z.string().datetime(),
  cleanClose: z.boolean(),
});
```

- [ ] Written atomically (temp file, fsync, rename) on every heartbeat.
- [ ] `cleanClose: true` is written only after every track is complete and the input log is converted.

### 14.3 Recovery

- [ ] Scrim keeps an index of recent session folders in `userData` (paths only), so it can find sessions in any destination folder.
- [ ] On launch: scan the index for sessions with `cleanClose: false` whose process is not running.
- [ ] Offer Recover, Show in folder, or Dismiss. Dismiss never deletes anything.
- [ ] Recover:
  1. Remux each raw track with FFmpeg `-c copy` into a playable file. For a truncated last chunk, FFmpeg stops at the last valid frame; that is expected.
  2. Convert `input.ndjson` up to the last complete line.
  3. Close any open pause interval at the heartbeat time.
  4. Write `cleanClose: true` with a `recovered: true` flag.
- [ ] Recovery never modifies the raw files.

### Tests

- Fixtures: truncated raw files cut at random byte offsets (property test: recovery always yields a playable file or a clear "nothing recoverable" result, never a crash).
- E2E: kill during recording, relaunch, see the offer, recover, verify playable output with ffprobe.

### Acceptance

- [ ] 20 consecutive kill and recover runs on CI with zero failures.

---

## 15. M10: Error states and hardening

Goal: every expected failure has a clear message and a next step. No uncaught exceptions reach the user.

| Situation                      | Detection                                 | What the user sees                                             | What Scrim does                                 |
| ------------------------------ | ----------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| Disk nearly full               | statfs check                              | Warning with free space left                                   | Keeps recording                                 |
| Disk full                      | statfs or write error `ENOSPC`            | "The disk is full. Your recording was saved up to this point." | Stops, flushes, closes cleanly                  |
| Folder not writable            | `EACCES`, `EPERM` on start                | "Scrim cannot write to this folder. Choose another one."       | Does not start                                  |
| Folder removed (USB unplugged) | write error `ENOENT`, `EIO`               | "The folder is no longer available."                           | Stops, keeps what was written                   |
| Camera unplugged               | track `ended` event                       | "Camera disconnected. Screen recording continues."             | Closes camera track, keeps screen and mic       |
| Mic unplugged                  | track `ended` event                       | Same pattern                                                   | Same pattern                                    |
| Display removed                | screen `display-removed` or track `ended` | "The display you were recording was disconnected."             | Stops and saves                                 |
| Screen permission revoked      | `NotAllowedError`                         | Permission guide                                               | Does not start                                  |
| Input hook fails               | load or runtime error                     | Note that cursor effects are off                               | Records without input log                       |
| Renderer crash                 | `render-process-gone`                     | "Recording stopped unexpectedly. It was saved."                | Main closes writers, marks session for recovery |
| Main process crash             | none (process dies)                       | Recovery offer on next launch                                  | M9                                              |

- [ ] A global error boundary in the renderer and `uncaughtException` and `unhandledRejection` handlers in main that log and show a friendly message.
- [ ] Every error string lives in one copy file, uses plain words and says what to do next.

### Tests

- Each row above has a test that injects the failure through the fs adapter or a fake media track.

---

## 16. M11: Desktop CI and packaging smoke

Goal: every pull request proves the desktop app still builds, passes tests and starts on all three systems.

### Tasks

- [ ] `.github/workflows/ci.yml` gains the desktop app in `pnpm check` (lint, typecheck, unit tests, build).
- [ ] `.github/workflows/e2e-desktop.yml`: matrix of `windows-latest`, `macos-latest`, `ubuntu-latest` (with `xvfb-run` on Linux). Runs Playwright Electron smoke tests. Capture tests that need a real screen use a synthetic canvas stream on CI.
- [ ] Packaging smoke: build unsigned installers (NSIS on Windows, dmg on macOS, AppImage and deb on Linux) on each runner. Upload them as workflow artifacts with a short retention. Do not publish releases.
- [ ] Commit policy and secrets scan already apply to the whole repo.
- [ ] Turbo: `package` and `test:e2e` are never cached.

### Acceptance

- [ ] Green matrix on main.
- [ ] Installers from CI install and launch on a clean Windows machine and a clean Mac (manual check, recorded in the PR).

---

## 17. Testing strategy for Phase 2

| Layer                 | Tool                          | What it covers                                                                                      |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Pure logic            | Vitest, fast-check            | Region math, close decisions, permission states, `toMediaTime`, ChunkWriter core, schema conversion |
| Main process adapters | Vitest with fakes             | fs errors, statfs, FFmpeg argument building                                                         |
| Renderer components   | Vitest with a DOM environment | Home screen, permission guide, recovery dialog                                                      |
| App level             | Playwright Electron           | Launch, security checks, start and stop, kill and recover                                           |
| Media checks          | ffprobe in tests              | Duration, codec, frame count, dimensions                                                            |
| Manual                | PR checklist                  | Real hardware on each system, window controls, permissions, multi monitor                           |

Rules:

- Every bug fix starts with a failing test.
- No test uses the network.
- Coverage thresholds for `apps/desktop` match the rest of the repo and are not lowered.

---

## 18. Definition of done for Phase 2

- [ ] All milestones M1 to M11 accepted.
- [ ] ADRs 0001 to 0004 accepted.
- [ ] A 30 minute recording with camera, mic and two pauses works on Windows, macOS and Linux X11.
- [ ] Recording on Linux Wayland works, with the input log marked unavailable and the UI explaining why.
- [ ] Kill and recover works 20 out of 20 times on CI.
- [ ] Window controls work on all three systems.
- [ ] The desktop app makes zero network requests (verified by a test that fails on any request from main or renderer during a recording).
- [ ] No keyboard input is ever logged.
- [ ] Docs updated: `docs/architecture.md` desktop section, `docs/testing.md`, README "Run the desktop app", build log in the working agreement.

---

## 19. Risk register

| Risk                                                         | Likelihood           | Impact                               | Mitigation                                              | Owner of the check |
| ------------------------------------------------------------ | -------------------- | ------------------------------------ | ------------------------------------------------------- | ------------------ |
| Chromium capture cannot hold 4K30 or 1080p60                 | Medium               | High                                 | S1 benchmark, FFmpeg capture fallback                   | S1                 |
| Cursor cannot be hidden in Chromium capture on some platform | Medium               | High                                 | S1 checks per platform, FFmpeg capture there            | S1                 |
| Export slower than real time                                 | Medium               | Medium                               | S2 compares three pipelines, WebCodecs included         | S2                 |
| `uiohook-napi` fails to build for the pinned Electron        | Low to medium        | High                                 | S3 on all three systems, prebuilt binaries, pin exactly | S3                 |
| Coordinate mismatch on mixed DPI Windows setups              | Medium               | High (zoom lands in the wrong place) | S3 alignment test, DIP conversion, tests                | S3                 |
| Wayland share of Linux users grows                           | High                 | Medium                               | S4 investigation, clear UI note                         | S4                 |
| macOS permission friction                                    | High                 | Medium                               | First run guide, restart prompts                        | M5                 |
| Clock drift between tracks on long recordings                | Low to medium        | Medium                               | Offset measurement, 30 minute test, check drift at end  | M8                 |
| Testing gaps on macOS and Linux (owner works on Windows)     | High                 | Medium                               | CI matrix, borrowed hardware for release candidates     | M11                |
| FFmpeg license and binary size                               | Low                  | Medium                               | LGPL build, ADR, size budget for installers             | M7                 |
| SmartScreen and Gatekeeper warnings                          | Certain until signed | Medium                               | Phase 5 signing, first run help on the site             | Phase 5            |

---

## 20. Owner decisions

| ID  | Decision                                                                                   | Needed before | Recommendation                                      |
| --- | ------------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------- |
| D1  | Move capture of camera, mic, input log and pause into Phase 2 (rendering stays in Phase 4) | M7            | Yes                                                 |
| D2  | Maximum export resolution                                                                  | Phase 3       | Keep 3840 by 2160                                   |
| D3  | System audio capture: in scope or not, and when                                            | M7            | Defer to Phase 4; support differs a lot by platform |
| D4  | Session folder layout (section 14.1)                                                       | M9            | Accept, record in ADR 0004                          |
| D5  | Make the download form optional with a "just download" link                                | Launch        | Yes, it fits the no account promise                 |
| D6  | Domain, SMTP provider, Supabase plan                                                       | Launch        | Separate dev and prod projects first                |
| D7  | FFmpeg build and license                                                                   | M7            | LGPL build, documented in an ADR                    |
| D8  | Add "no keyboard events are ever logged" to the hard rules                                 | M8            | Yes                                                 |

---

## 21. Suggested first two weeks

**Week 1**

1. Day 1: resolve and pin desktop dependencies; create `apps/desktop`; security constant and its test.
2. Day 2: session hardening, CSP, permission handler, openExternal allowlist; their tests.
3. Day 3: Playwright Electron smoke test; add desktop to turbo and CI; fuses in the package step.
4. Day 4 and 5: S1 capture benchmark on Windows; start S3 input hook on Windows.

**Week 2**

1. Day 6: S1 on macOS and Linux (CI or borrowed hardware); cursor hiding results.
2. Day 7 to 9: S2 export spike, all three candidates on the Windows reference machine.
3. Day 9: S4 Wayland investigation.
4. Day 10: write ADRs 0001 to 0003; owner review.

In parallel, another engineer takes M0 and then M3 and M4, which do not depend on the spikes.

---

## 22. Appendix: commit plan examples

```
feat(desktop): scaffold electron app with electron-vite and react
test(desktop): lock secure web preferences with a snapshot test
feat(desktop): block navigation, new windows and webviews
feat(desktop): add permission handler for media and display capture
feat(desktop): add strict content security policy for packaged builds
ci(desktop): run electron smoke tests on windows, macos and linux
docs(adr): record capture backend decision
feat(core): add toMediaTime with pause aware mapping
feat(desktop): stream recorder chunks to disk through message ports
feat(desktop): offer recovery for unfinished sessions on launch
fix(desktop): convert input hook coordinates to dip on windows
```

Messages carry no attribution lines, no co author trailers naming tools, no emojis and no em dashes. The commit hook enforces this.
