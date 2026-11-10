<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/scrim-logo-dark.svg" />
    <img src="docs/assets/scrim-logo.svg" alt="Scrim" height="64" />
  </picture>
</p>

<p align="center">
  <strong>Record anything on your screen effortlessly</strong>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
</p>

<p align="center">
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white" />
</p>

<p align="center">
  <img alt="FFmpeg" src="https://img.shields.io/badge/FFmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white" />
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" />
</p>

---

Scrim is a free, open source screen recorder and screenshot tool for Windows, macOS and Linux. It highlights the cursor, ripples every click, zooms in where you work, adds your face in a bubble, and exports an MP4 that plays everywhere.

Scrim keeps recordings on your computer. Nothing is uploaded, there is no account, and exports have no watermark. The website collects only the name and email needed to count downloads and send optional release notices.

## Contents

- [Download](#download)
- [Features](#features)
- [How it works](#how-it-works)
- [Shortcuts](#shortcuts)
- [Where your files go](#where-your-files-go)
- [Use cases](#use-cases)
- [Questions](#questions)
- [The project](#the-project)
- [Development](#development)
- [Contributing](#contributing)
- [Privacy](#privacy)
- [Code signing policy](#code-signing-policy)
- [Developer](#developer)
- [License](#license)

## Download

Choose your system on [www.usescrim.app](https://www.usescrim.app), or take the installer from the [Releases page](https://github.com/oyedokunken/scrim/releases).

| System  | File                                          | First run                                                                                         |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Windows | `.exe` installer for 64 bit Windows 10 and 11 | SmartScreen may warn until the installer builds reputation. Choose More info, then Run anyway.    |
| macOS   | `.dmg` for Apple Silicon and Intel            | Choose Open Anyway in Privacy and Security. Allow Screen Recording and Accessibility when asked.  |
| Linux   | AppImage and `.deb` for 64 bit Linux          | Make the AppImage executable and run it. On Wayland, cursor effects and auto zoom are turned off. |

Windows and Linux (64 bit) installers are published. The Linux build has had less testing than Windows. macOS will appear here once it has been tested on a real machine.

## Features

**Recording**

- Full display, a region you drag a box over, or a single window
- Cursor halo and click ripples, or either one alone
- Face camera in a bubble that dodges the cursor, and microphone support
- Pause and resume, with a floating recording control that never appears in the video
- Crash safe recording: a recording that is cut short can be recovered

**After you stop**

- Automatic zoom that follows the mouse, with zoom level, hold and smoothness controls
- Before and after comparison
- Non-destructive trim and cuts
- Gradient, pattern and image backdrops
- MP4 export with H.264 and AAC

**Screenshots**

- Full display, region and window, saved to a folder and copied to the clipboard

**Around it**

- A library of your recordings and screenshots
- Global shortcuts you can rebind
- An update check you control, off by default

## How it works

You pick what to record, press Start and work as usual. Scrim saves the raw screen video, the camera, the microphone and a log of mouse movement and clicks. When you stop, the cursor effects, the zoom, the camera bubble and the background are drawn into a finished MP4 from those parts. The original recording is never modified, so you can change the look and render again without recording again.

## Shortcuts

| Action            | Windows and Linux | macOS       |
| ----------------- | ----------------- | ----------- |
| Start recording   | Ctrl+Shift+R      | Cmd+Shift+R |
| Stop and save     | Ctrl+Shift+S      | Cmd+Shift+S |
| Take a screenshot | Ctrl+Shift+X      | Cmd+Shift+X |

Every shortcut can be changed in Settings, which warns about conflicts.

## Where your files go

- Finished videos: `Videos\Scrim` by default, or the folder you choose
- Screenshots: `Pictures\Scrim` by default
- Recordings in progress and their projects: `%LOCALAPPDATA%\Scrim\Projects` on Windows

## Use cases

- **Tutorials:** Show each step, with the clicks people need to copy.
- **Product demos:** Walk customers through a feature with your face on screen.
- **Teaching:** Record lessons students can pause and follow.
- **Bug reports:** Show exactly what went wrong instead of describing it.
- **Sales and support:** Answer questions with a quick, personal video.
- **Personal:** Help family with their PC, or save a moment from your screen.

## Questions

**Is Scrim free?** Yes. It is open source under the MIT license, with no account and no watermark.

**Does it upload my recordings?** No. Everything stays on your computer. The only network request the app can make is the optional update check.

**Why are cursor effects off on Linux Wayland?** Wayland does not let apps watch the mouse. Recording itself works. On X11 you get everything.

## The project

The desktop app (`apps/desktop`) is an Electron app. The main process owns capture, files, FFmpeg and the typed IPC. The renderer is untrusted web content in a sandbox with a strict content security policy. The website (`apps/landing`) is one Next.js project with the download dialog, the download API, Prisma and mail.

The app makes no network requests while recording, editing or exporting. Its only use of the network is the update check in Settings: it runs when you press Check for updates, or at start if you turn that on, it asks GitHub for the latest release details and sends nothing about you, and it downloads a new version only when you press Update now.

The Windows installer (version 1.0.0, marked a pre-release) is published on the [Releases page](https://github.com/oyedokunken/scrim/releases) and is the only build that has been tested on a real machine. The macOS and Linux builds, with their packaging, FFmpeg pins, entitlements and release workflow, are written and have been run only on Windows and in containers, so they are not published yet. [docs/releasing.md](docs/releasing.md) lists what is verified and gives a test checklist for each system.

| Phase | Scope                                         | State                          |
| ----- | --------------------------------------------- | ------------------------------ |
| 1     | Landing page and shared design tokens         | Done                           |
| 2     | Desktop shell, capture and recovery           | Done, being polished           |
| 3     | MP4 export                                    | In progress                    |
| 4     | Recording effects and editing                 | In progress                    |
| 5     | Shortcuts, screenshots and release automation | Shortcuts and screenshots done |

See [CHANGELOG.md](CHANGELOG.md) for what changed and [docs/](docs) for the architecture and the decisions behind it.

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
pnpm dev                # desktop app in dev mode
pnpm dev:landing        # website
pnpm db:generate        # Prisma client
pnpm check              # lint, typecheck, test, build
pnpm test               # unit and property tests
pnpm test:e2e           # Playwright
pnpm knip               # unused code
pnpm package            # installer for your system (desktop)
```

Copy `apps/landing/.env.example` to a local environment file and use a development database. Never use production credentials locally.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, and look for [good first issues](https://github.com/oyedokunken/scrim/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Privacy

The desktop application does not send recordings or recording data to a server. The only request it can make is the update check described above, which goes to GitHub and carries nothing about you. The landing page stores the name, email, selected system, app version, a hashed IP, a truncated user agent and timestamps for download counting and optional update notices. The website has no analytics, no cookies and no third party scripts. See the [security policy](SECURITY.md) and the privacy page in the landing app for more information.

## Code signing policy

Windows releases of Scrim are signed in GitHub Actions, from the source in this repository, with a
certificate of the [SignPath Foundation](https://signpath.org). Free code signing is provided by
[SignPath.io](https://signpath.io). Windows then names the SignPath Foundation as the publisher.
Signing is switched on release by release; an installer without a valid signature is not published
once signing is required (see [docs/code-signing.md](docs/code-signing.md)).

Team roles:

- Author and committer: [Oyedokun Kehinde](https://github.com/oyedokunken)
- Reviewer: [Oyedokun Kehinde](https://github.com/oyedokunken). Changes from other contributors are
  reviewed in pull requests before they are merged.
- Approver: [Oyedokun Kehinde](https://github.com/oyedokunken). Every release is approved by hand
  before it is signed.

Privacy: Scrim does not send recordings or recording data anywhere. The only network request the app
can make is the update check, which asks GitHub Releases for the newest version, only when you press
Check for updates or turn the check on at start. See the [privacy policy](https://www.usescrim.app/privacy).

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

- Website: https://www.usescrim.app
- Source: https://github.com/oyedokunken/scrim
- Issues: https://github.com/oyedokunken/scrim/issues
