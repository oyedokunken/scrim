# Scrim wiki

This wiki is a concise guide to the project structure, development phases and contribution workflow.

## Project overview

Scrim is a local-first screen recorder and screenshot tool. Windows comes first, with macOS and Linux installers following. Recordings remain on the user's computer and are rendered into MP4 exports with cursor effects, zoom, camera and audio support.

## Development phases

The project is being built incrementally:

1. Landing page and shared design tokens
2. Desktop shell, capture and recovery
3. MP4 export
4. Recording effects and editing
5. Shortcuts, screenshots and release automation

The website is live and the Windows desktop app is heading for its first release. Capture, recovery, screenshots, the overlay, the recording pill and the camera bubble are built. Export and editing are in progress.

## Repository structure

- `apps/landing`: Next.js website, download API, database and mail
- `apps/desktop`: Electron application (main process, sandboxed renderer, overlay, pill and bubble pages)
- `packages/core`: Pure recording, zoom, camera, export and editing logic
- `packages/tokens`: Shared design tokens
- `docs`: Architecture, testing, releasing and architecture decisions

## The landing page

- Sections: hero demo, features, use cases, download, FAQ, contribute, contact, footer.
- The download dialog (native `dialog`, React Hook Form, zod) posts to `/api/downloads`. The server checks the origin and a honeypot, rate limits by hashed IP, records the person and the download, and returns the file link from the latest GitHub Release.
- Emails (Nodemailer, any SMTP provider) go out after the response: a confirmation for the visitor and a note for the owner. Unsubscribe is a button that POSTs to `/api/unsubscribe`.
- Colors: green `#004E52`, butter `#FBF8F4`, black, white, and one record red for recording indicators. Errors use a darker red mixed from it.
- Every external link opens in a new tab through `SiteLink`.

## The desktop app

- **Process model.** The main process owns windows, capture, files, FFmpeg and the typed IPC. The preload is sandboxed and only passes named channels. The renderer is untrusted React UI.
- **Recording.** The screen, camera and microphone are recorded as separate tracks into the projects folder (`%LOCALAPPDATA%\Scrim\Projects` on Windows), with a heartbeat and a clean close marker. A mouse log and the camera bubble positions are saved beside them. After a crash the next launch offers Recover.
- **Record, then render.** The original recording is never changed. Cursor effects, auto zoom, the camera bubble, the background and cuts are drawn at export into one MP4 in the folder you choose.
- **Capture helpers.** The area overlay, the recording pill and the camera bubble are separate always on top windows hidden from capture, so they never appear in the video.
- **Screenshots.** One PNG per capture in Pictures\Scrim, also copied to the clipboard.
- **FFmpeg.** A pinned LGPL build is fetched at packaging time and installed beside the app.
- **Decisions.** See `docs/adr`.

## Local development

Install the pinned dependencies with `pnpm install`. For landing page work, configure a development environment from `.env.example` (a development database and an SMTP account or mail catcher), then run `pnpm db:generate` and `pnpm dev:landing`.

Run `pnpm dev` for the desktop app. Run `pnpm check` before submitting changes. The full requirements and architecture are documented in [CLAUDE.md](CLAUDE.md).

## Privacy and security

The desktop application does not send recording data to a server. The website collects only the information required for download counting and optional update notices. See [SECURITY.md](SECURITY.md) for reporting security issues.

## Related documentation

- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)
