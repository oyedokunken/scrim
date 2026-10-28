# 0005. Reading the position of the window being recorded

Status: proposed, for Phase 4

## Context

Cursor effects and auto zoom need the mouse position in the pixels of the recorded video. For a
whole display that is the cursor position minus the display origin, times the display scale. For a
single window it is the cursor position minus the position of the window, and the window can move
and resize while recording. Scrim needs the window's rectangle over time.

Electron cannot give it. `desktopCapturer` returns a source id and a name for another application's
window, and no bounds. Nothing in Chromium exposes them either. Today a window recording therefore
records no mouse log. The session file says `input: { status: 'unavailable', reason:
'window-bounds-unsupported' }`, the app tells the user cursor effects are off for window recordings,
and recording a whole screen turns them back on. The rest of the pipeline is built and tested: a
bounds source interface, a recorder that writes `window-bounds.ndjson` and survives a crash, and the
conversion that places each mouse event relative to the window as it was at that moment. Only a
real source is missing.

Two things are ruled out. No script or helper process is used to read other applications' windows
(PowerShell, AppleScript, `xdotool` and similar), because that means shipping and running scripts
with elevated trust, and a policy that stops them is the right default. Nothing may work around a
system permission.

## Options

1. **A small N-API addon of our own**, one source file per platform behind one interface:
   `GetWindowRect` and `DwmGetWindowAttribute` on Windows, `CGWindowListCopyWindowInfo` on macOS,
   `XGetWindowAttributes` and `XTranslateCoordinates` on X11. Full control, no third party code in
   the process, polling or event hooks as each platform allows. Cost: native build and signing for
   three platforms in CI, and the maintenance that comes with it.
2. **An FFI library** (such as koffi) calling the same system APIs from TypeScript. No compiler
   needed on our side and the code stays in TypeScript, but it adds a runtime dependency with a
   native part, and a call layer into system libraries that we then have to keep correct.
3. **An existing package that reports the active or any window's bounds.** Quickest, but they are
   usually built around the focused window, not an arbitrary window by id, and they bring their own
   native code and release cadence.
4. **Do not follow windows, record the display and crop later.** The recording is a display with a
   crop region that the user draws, which is the region mode already built. Cursor effects work
   exactly. It does not follow a window that moves, which is the cost.

Per platform notes. Windows and macOS can do this with option 1 or 2. X11 can too. Wayland cannot:
the protocol deliberately hides the position of other clients' windows, and the portal does not
offer it. A window recording on Wayland keeps no mouse log, which is already true because the
global mouse hook does not work there either.

## Decision

Not made. The recommendation is option 4 as the default experience for Phase 4, with option 1 for
a later phase if following a moving window turns out to matter to users. It avoids a native
dependency now and loses nothing for recordings of a fixed region.

## Consequences

- Until a source exists, window recordings have no cursor effects and say so.
- Whichever option is chosen plugs into the existing `WindowBoundsSource` interface, so nothing
  else changes: the recorder, the file, the conversion and the saved log are done.
- A new dependency or a native build is a decision for the owner before it is added.
