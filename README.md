# Scrim

Scrim is a free, open source screen recorder and screenshot tool for Windows, macOS and Linux. It highlights the cursor, ripples every click, zooms in where you work, adds your face in a bubble, and exports an MP4 that plays everywhere.

Scrim keeps recordings on your computer. Nothing is uploaded, there is no account, and exports have no watermark. The website collects only the name and email needed to count downloads and provide optional release notices.

## Features

- Cursor halo and click ripples
- Automatic zoom that follows the mouse
- Face camera and microphone support
- Pause and resume
- Before and after comparison
- Non-destructive trim and cuts
- Gradient, pattern and image backdrops
- MP4 export with H.264 and AAC
- Full display, region and window screenshots
- Windows, macOS and Linux support

## Use cases

- **Tutorials:** Show each step, with the clicks people need to copy.
- **Product demos:** Walk customers through a feature with your face on screen.
- **Teaching:** Record lessons students can pause and follow.
- **Bug reports:** Show exactly what went wrong instead of describing it.
- **Sales and support:** Answer questions with a quick, personal video.
- **Personal:** Help family with their PC, or save a moment from your screen.

## Project status

The project is currently in Phase 1: the landing page. The desktop application will be developed in later phases.

| Phase | Scope                                         |
| ----- | --------------------------------------------- |
| 1     | Landing page and shared design tokens         |
| 2     | Desktop shell, capture and recovery           |
| 3     | MP4 export                                    |
| 4     | Recording effects and editing                 |
| 5     | Shortcuts, screenshots and release automation |

## Repository layout

```text
scrim/
├── apps/
│   ├── landing/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   └── schema.prisma
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── api/
│   │   │   │   ├── privacy/
│   │   │   │   └── page.tsx
│   │   │   ├── components/
│   │   │   ├── emails/
│   │   │   ├── lib/
│   │   │   └── server/
│   │   ├── tests/
│   │   ├── .env.example
│   │   └── package.json
│   └── desktop/
│       ├── build/
│       ├── src/
│       │   ├── main/
│       │   ├── preload/
│       │   ├── renderer/
│       │   └── shared/
│       ├── tests/
│       └── package.json
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── camera/
│   │   │   ├── edit/
│   │   │   ├── export/
│   │   │   ├── input/
│   │   │   └── zoom/
│   │   └── tests/
│   └── tokens/
│       ├── src/
│       └── tests/
├── docs/
│   ├── adr/
│   ├── architecture.md
│   ├── releasing.md
│   └── testing.md
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
├── CLAUDE.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── CHANGELOG.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## Development

Requirements:

- Node.js 22.18 or newer
- pnpm 12.15.0
- Docker for the local database and mail catcher

Install dependencies:

```bash
pnpm install
```

Useful commands:

```bash
pnpm db:up
pnpm dev:landing
pnpm check
pnpm test
pnpm test:e2e
pnpm test:lighthouse
```

Copy `apps/landing/.env.example` to a local environment file and use a development database. Never use production credentials locally. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Privacy

The desktop application does not send recordings or recording data to a server. The landing page stores the name, email, selected system, app version, a hashed IP, a truncated user agent and timestamps for download counting and optional update notices. See the [security policy](SECURITY.md) and the privacy page in the landing app for more information.

## Developer

- **Name:** Oyedokun Kehinde
- **Email:** oyedokunken@gmail.com
- **Portfolio:** https://www.oyedokun.dev/
- **Buy me a malt:** https://buymeamalt.com/@oyedokunken

## License

Scrim is available under the [MIT License](LICENSE).

## Links

- Source: https://github.com/oyedokunken/scrim
- Issues: https://github.com/oyedokunken/scrim/issues
