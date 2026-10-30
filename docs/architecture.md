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
