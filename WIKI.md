# Scrim wiki

This wiki is a concise guide to the project structure, development phases and contribution workflow.

## Project overview

Scrim is a local-first screen recorder and screenshot tool for Windows, macOS and Linux. Recordings remain on the user's computer and are rendered into MP4 exports with cursor effects, zoom, camera and audio support.

## Development phases

The project is being built incrementally:

1. Landing page and shared design tokens
2. Desktop shell, capture and recovery
3. MP4 export
4. Recording effects and editing
5. Shortcuts, screenshots and release automation

The repository is currently in Phase 1. Desktop work should wait until Phase 2 begins.

## Repository structure

- `apps/landing`: Next.js website, download API, database and mail
- `apps/desktop`: Electron application for Phase 2 onward
- `packages/core`: Pure recording, zoom, camera, export and editing logic
- `packages/tokens`: Shared design tokens
- `docs`: Architecture, testing, releasing and architecture decisions

## Local development

Install the pinned dependencies with `pnpm install`. For landing page work, start the local services with `pnpm db:up`, configure a development environment from `.env.example`, and run `pnpm dev:landing`.

Run `pnpm check` before submitting changes. The full requirements and architecture are documented in [CLAUDE.md](CLAUDE.md).

## Privacy and security

The desktop application does not send recording data to a server. The website collects only the information required for download counting and optional update notices. See [SECURITY.md](SECURITY.md) for reporting security issues.

## Related documentation

- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [License](LICENSE)
