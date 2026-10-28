<p align="center">
  <img src="docs/assets/logo.svg" alt="Scrim logo" width="96" height="96" />
</p>

<h1 align="center">Scrim</h1>

<p align="center">
  <strong>Electron</strong> · <strong>React</strong> · <strong>TypeScript</strong> · <strong>Vite</strong> · <strong>Next.js</strong> · <strong>Prisma</strong> · <strong>PostgreSQL</strong> · <strong>FFmpeg</strong> · <strong>Vitest</strong> · <strong>Playwright</strong> · <strong>pnpm</strong> · <strong>Turborepo</strong>
</p>

<p align="center">
  A free, open source screen recorder and screenshot tool.<br />
  <a href="https://scrim.app">scrim.app</a> · <a href="https://github.com/oyedokunken/scrim/issues">Issues</a> · <a href="LICENSE">MIT license</a>
</p>

---

Scrim is a free, open source screen recorder and screenshot tool. It highlights the cursor, ripples every click, zooms in where you work, adds your face in a bubble, and exports an MP4 that plays everywhere. Windows comes first, with macOS and Linux installers following.

Scrim keeps recordings on your computer. Nothing is uploaded, there is no account, and exports have no watermark. The website collects only the name and email needed to count downloads and provide optional release notices.

## Technologies

| Area         | What it uses                                                                     |
| ------------ | -------------------------------------------------------------------------------- |
| Desktop app  | Electron, React, Vite (electron-vite), TypeScript, sandboxed renderer, typed IPC |
| Capture      | Chromium screen capture, `MediaRecorder`, a global mouse hook (uiohook-napi)     |
| Media        | FFmpeg (LGPL build, bundled), H.264 and AAC in an MP4                            |
| Shared logic | `@scrim/core` (zoom planner, camera, session format) and `@scrim/tokens`         |
| Website      | Next.js, React Hook Form, zod, Prisma 7, PostgreSQL, Nodemailer                  |
| Quality      | Vitest, fast-check, Playwright, axe, Lighthouse CI, ESLint, Prettier, knip       |
| Workspace    | pnpm workspaces and a catalog of exact pins, Turborepo, Husky, commitlint        |
| Hosting      | Vercel for the website, GitHub Releases for the installers                       |

## Features

- Cursor halo and click ripples
- Automatic zoom that follows the mouse
- Face camera in a bubble that dodges the cursor, and microphone support
- Pause and resume, with a floating recording control that never appears in the video
- Before and after comparison
- Non-destructive trim and cuts
- Gradient, pattern and image backdrops
- MP4 export with H.264 and AAC
- Full display, region and window screenshots, saved and copied to the clipboard
- Crash safe recording: a recording that is cut short can be recovered
- Windows today, macOS and Linux coming

## Use cases

- **Tutorials:** Show each step, with the clicks people need to copy.
- **Product demos:** Walk customers through a feature with your face on screen.
- **Teaching:** Record lessons students can pause and follow.
- **Bug reports:** Show exactly what went wrong instead of describing it.
- **Sales and support:** Answer questions with a quick, personal video.
- **Personal:** Help family with their PC, or save a moment from your screen.

## The desktop app

`apps/desktop` is an Electron app. The main process owns capture, files, FFmpeg and the typed IPC; the renderer is untrusted web content in a sandbox with a strict content security policy. A recording is saved in the app's own projects folder (`%LOCALAPPDATA%\Scrim\Projects` on Windows) and rendered into one finished MP4 in the folder you choose (Videos\Scrim by default). The original recording is never modified, so cursor effects, zoom, the camera bubble and the background can be changed and re rendered without recording again.

The app makes no network requests while recording, editing or exporting.

## The website

The landing page is a single Next.js project in `apps/landing`. It has these sections: hero with a live auto zoom demo, features (eight stacking cards), use cases, download, FAQ, contribute and contact, then a footer.

- **Download dialog.** Every Download button opens a native dialog that asks for a name and email, picks the system from the visitor's computer (always changeable), and starts the download from the latest GitHub Release. The form uses React Hook Form with the shared zod schema and prints an error under each field.
- **Email.** Visitors get a confirmation email with the file link, first run help and a Support link. The owner gets a short note for each download. Mail is sent with Nodemailer after the response, so the visitor never waits on it.
- **Release notices.** Optional and off by default. Every email has a one step unsubscribe, done by POST only.
- **Links.** Every link to another site opens in a new tab.
- **Privacy.** No analytics, no cookies, no third party scripts.

## Project status

The website is live. The Windows desktop app is in its first release (v1), due 30 October 2026. macOS and Linux installers follow.

macOS and Linux: the packaging, FFmpeg pins, entitlements and release workflow are written, but only partly run. The Linux installers were built and their bundled FFmpeg was run in a Linux container. Nothing has run on a real Mac or a real Linux desktop yet. [docs/releasing.md](docs/releasing.md) lists exactly what is verified and gives a test checklist for each system.

| Phase | Scope                                         | State                          |
| ----- | --------------------------------------------- | ------------------------------ |
| 1     | Landing page and shared design tokens         | Done                           |
| 2     | Desktop shell, capture and recovery           | Done, being polished           |
| 3     | MP4 export                                    | In progress                    |
| 4     | Recording effects and editing                 | In progress                    |
| 5     | Shortcuts, screenshots and release automation | Shortcuts and screenshots done |

See [CHANGELOG.md](CHANGELOG.md) for what changed and [docs/](docs) for the architecture and the decisions behind it.

## Repository layout

```text
scrim/
├── apps/
│   ├── landing/            Next.js website, download API, Prisma, mail
│   └── desktop/            Electron app
│       ├── src/main/       main process: windows, IPC, recording engine, export
│       ├── src/preload/    sandboxed bridge
│       ├── src/renderer/   React UI and the overlay, pill and bubble pages
│       ├── src/recorder/   code shared by the capture pages
│       ├── src/shared/     typed IPC contract, settings, channel names
│       └── tests/          unit, e2e and acceptance
├── packages/
│   ├── core/               pure logic: session format, zoom, camera, input, export sizing
│   └── tokens/             palette, CSS variables, type scale
├── docs/                   architecture, decisions (adr), assets
├── .github/                workflows, issue templates
├── CLAUDE.md               the working agreement for contributors
└── pnpm-workspace.yaml     catalog of exact dependency pins
```

## Development

Requirements:

- Node.js 22.18 or newer
- pnpm 12.15.0
- For the website: a Postgres database (a local one, or a separate Supabase development project) and an SMTP account or mail catcher

Install dependencies:

```bash
pnpm install
```

Useful commands:

```bash
pnpm dev                # desktop app in development
pnpm dev:landing        # website
pnpm db:generate        # Prisma client
pnpm check              # lint, typecheck, test, build
pnpm test               # unit and property tests
pnpm test:e2e           # Playwright
pnpm knip               # unused code
pnpm package            # Windows installer (desktop)
```

Copy `apps/landing/.env.example` to a local environment file and use a development database. Never use production credentials locally. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Privacy

The desktop application does not send recordings or recording data to a server. The landing page stores the name, email, selected system, app version, a hashed IP, a truncated user agent and timestamps for download counting and optional update notices. See the [security policy](SECURITY.md) and the privacy page in the landing app for more information.

## Developer

- **Name:** Oyedokun Kehinde
- **Email:** oyedokunken@gmail.com
- **Portfolio:** https://www.oyedokun.dev/
- **GitHub:** https://github.com/oyedokunken
- **LinkedIn:** https://www.linkedin.com/in/oyedokunken
- **Support:** https://buymeamalt.com/@oyedokunken

## License

Scrim is available under the [MIT License](LICENSE).

## Links

- Website: https://scrim.app
- Source: https://github.com/oyedokunken/scrim
- Issues: https://github.com/oyedokunken/scrim/issues
