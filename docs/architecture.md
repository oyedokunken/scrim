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

## Security notes for later milestones

- Any new session or partition must register the app protocol handler and the session hardening. The handler and the hardening are set up on the default session only, so a window with its own partition would load without them.
- User recordings are never served through `app://`. Playback needs a separate read-only scheme that is scoped to session folders.
- WebAssembly needs a `.wasm` content type, `'wasm-unsafe-eval'` in the policy, and an ADR before it is added.
- Links to the operating system privacy settings (M5) use a dedicated channel with fixed URLs. They do not widen the external link allowlist.
