# Scrim

Scrim is a free, open source screen recorder and screenshot tool for Windows, macOS and Linux. It highlights the cursor, ripples every click, zooms in where you work, adds your face in a bubble, and exports an MP4 that plays everywhere. The app keeps everything on the user's computer: nothing is uploaded, there is no account and there is no watermark. The only data Scrim collects is the name and email people give on the website before downloading, so downloads can be counted.

Owner: Oyedokun Kehinde (GitHub: oyedokunken). Repo: github.com/oyedokunken/scrim. License: MIT.

This file is the working agreement for anyone, human or AI, changing this repo. Read it fully before making changes. When a rule here conflicts with a habit or a default, the rule wins.

## Current phase

Phase 1 is the landing page only. Do not scaffold or touch `apps/desktop` until the owner says Phase 2 has started. The web and the desktop app are separate apps in one monorepo. They never import from each other. They share code only through `packages/*`.

| Phase | Scope |
| --- | --- |
| 1 | `apps/landing` (one full stack Next.js project: pages, API routes, Prisma, mail) and `packages/tokens`. Hosted on Vercel. |
| 2 | `apps/desktop` shell, native window controls, capture, crash safe recording to disk, recovery. |
| 3 | Basic MP4 export with FFmpeg, resolution and frame rate options, export failure handling. |
| 4 | Input event log, cursor halo, click ripples, auto zoom, before and after, backdrop, trim and cut, face camera, microphone, pause and resume. |
| 5 | Global shortcuts, screenshots, auto update, signing, release automation. |

## Hard rules

1. pnpm only. Never run npm or yarn. Versions are exact pins from the catalog. Never write `^` or `~` or `latest`.
2. No emojis and no em dashes anywhere: code, comments, UI copy, docs, commit messages.
3. No attribution to AI tools or agents, anywhere. That covers co-author trailers, "Generated with" lines, badges and credits that name any assistant (Claude, Devin and Codex are the ones in play) in commits, pull requests, issues, code comments, docs, the README and the website. This file is the only place those names appear, and only to define the rule. A commit hook and a CI check enforce it (see Conventions).
4. Colors are green `#004E52` as the main color and butter `#FBF8F4` as the secondary color, with neutral black `#000000` and white `#FFFFFF`, and greys derived from the black as a very small supporting set, plus one signal red used only for recording indicators (owner decision, 2026-10-26, replacing the earlier palette). Light theme only. There is no dark mode and none is to be added.
5. Font is Urbanist, self hosted through `@fontsource-variable/urbanist`. Icons are `lucide-react`, plus custom brand SVG components for operating systems and social networks, which lucide does not carry.
6. The desktop app makes no network requests during recording, editing or export. Its only permitted network use is an optional update check against GitHub Releases.
7. The website collects only what the download form needs: name, email, chosen system, app version, a hashed IP and a truncated user agent. No analytics, no third party scripts, no tracking cookies.
8. Secrets never enter the repo. This is an open source project. `.env*` files are ignored except `.env.example`, and all configuration is read through one validated `env.ts`. See "Open source hygiene and secrets".
9. A recording must never be lost. See "Reliability requirements".
10. The app window always has working minimize, maximize and close controls on all three platforms.
11. TypeScript strict. No `any`, no `@ts-ignore`, no non-null assertions in production code. Validate every boundary (IPC, files on disk, request bodies, environment) with zod.
12. Every change ships with tests. A bug fix starts with a failing test.
13. Do not weaken a security setting, a lint rule, a coverage threshold or a Lighthouse budget to make a change pass. Fix the cause.

## Product requirements

These come from studying a reference app (screenrecorderapp.vercel.app) and from the owner's use of it. Scrim must match its strengths and fix its failures. The reference is a source of feature ideas. Do not copy its layout, copy text, icons or screenshots.

### Headline claims (all six are required)

Cursor halo, click ripples, auto zoom that follows the mouse, face camera and microphone, pause and resume, before and after comparison, MP4 export, nothing uploaded, no watermark.

### Feature areas

| Area | Requirement |
| --- | --- |
| Auto zoom | On stop, zoom in around bursts of left clicks, pan with the cursor while zoomed, ease back out. User controls: zoom level (1.2 to 3), hold after click, smoothness, or off. Planned by `@scrim/core` `planZoom`, applied at export. The owner loves this feature, so quality matters most here. |
| One screen | One home screen: pick cursor style, set zoom, toggle camera and mic, press Start, drag a box over the region to record. Also support full display and single window. |
| Backdrop | Place the recording on a gradient, a pattern or the user's own image, with padding, rounded corners and a soft shadow. |
| Trim and cut | Drag ends to trim, cut segments from the middle, play back to check. Non destructive: the original file is never modified. Edits live in an edit list stored beside the recording. |
| Cursor | Styles: halo with ripples, halo only, ripples only, off. Rendered into the exported video from the input log. A live overlay shows the same effects while recording. |
| Face camera | Draggable bubble, snap to corners, size and shape options (circle, rounded square). Recorded as its own track and composited at export, so position and shape can still change in the editor. |
| Export | Resolution, frame rate, quality, keep or drop sound, file name, destination folder chosen by the user. MP4 with H.264 and AAC. |
| Shortcuts | Global start and stop. Defaults: Ctrl+Shift+R start, Ctrl+Shift+S stop and export (Cmd on macOS). Rebindable, with conflict detection. |
| Before and after | Side by side original and processed video in the editor. |
| Screenshots | Full display, region and window. PNG. Save to the chosen folder and copy to clipboard. This is a gap in the reference app and a Scrim differentiator. |

### Output resolution

Exports never upscale, always use even dimensions (H.264 yuv420p requirement) and are capped at 3840 by 2160. Presets: source, 720p, 1080p, 1440p, 2160p. This logic lives in `packages/core/src/export/size.ts` and is already specified by tests. The owner has not yet confirmed the intended maximum, so treat 3840 by 2160 as the working ceiling.

## Reliability requirements

The reference app failed in two ways the owner hit personally. Scrim must not.

1. Never lose a recording. Chunks are streamed to disk in the user's chosen folder as they arrive, with periodic flush. The raw file is the source of truth. Export reads it and never deletes or modifies it.
2. Detect unfinished sessions on next launch (a session file without a clean close marker) and offer Recover. Recovery remuxes the raw file into a playable one.
3. Export writes to `<name>.mp4.partial`, verifies the result with ffprobe (codec, dimensions, duration within tolerance), then renames atomically. A failed export leaves the source untouched.
4. Export failures are visible and actionable: show the last lines of FFmpeg stderr, a button to open the source folder, and a one click retry with safer settings (software encoder, lower resolution).
5. The window has native minimize, maximize and close. The reference app had none. On Windows and Linux use the native frame or `titleBarOverlay`. On macOS use `titleBarStyle: 'hiddenInset'` so the traffic lights stay. Do not set `frame: false` without fully implementing and testing custom controls.
6. Closing the window during a recording asks for confirmation or keeps recording from the tray. It never silently discards.
7. Disk full, permission denied and device unplugged are handled states with clear messages, not uncaught exceptions.

## Repo layout

```
scrim/
  apps/
    landing/              Everything for the website, in one Next.js project. Phase 1.
      prisma/             schema.prisma and committed migrations/
      prisma.config.ts    Prisma 7 config (CLI reads DIRECT_URL here)
      src/app/            pages and API route handlers
      src/components/     UI
      src/lib/            pure and shared: platform detection, zod schemas, release asset matching
      src/server/         server only, imports 'server-only': env, db, mail, rate limit, releases
      src/emails/         email template functions (plain text and HTML)
      src/generated/      Prisma client output (gitignored)
      tests/              unit, integration, e2e
      docker-compose.yml  local and CI Postgres + Mailpit, throwaway credentials
      .env.example        every variable, placeholder values only
    desktop/              Electron + React + Vite. Phase 2 onward.
  packages/
    tokens/               Palette, CSS variables, contrast helpers. Shared by both apps.
    core/                 Pure TypeScript: session log schema, zoom planner, camera, export sizing, edit list.
  docs/
    architecture.md
    testing.md
    releasing.md
    adr/                  One file per decision, numbered.
  .github/
    workflows/            ci, e2e-desktop, landing-quality, commit-policy, secrets-scan, codeql, release
    ISSUE_TEMPLATE/
    dependabot.yml
    CODEOWNERS
    PULL_REQUEST_TEMPLATE.md
  .husky/                 pre-commit (lint-staged), commit-msg (commitlint)
  CLAUDE.md  README.md  CONTRIBUTING.md  SECURITY.md  CODE_OF_CONDUCT.md  LICENSE
  turbo.json  pnpm-workspace.yaml  package.json  tsconfig.base.json
  eslint.config.js  .prettierrc  .editorconfig  .nvmrc  .npmrc  .gitignore  commitlint.config.js  knip.json
```

Boundaries, enforced by ESLint `no-restricted-imports` and by knip:

- `apps/landing` and `apps/desktop` do not import each other. The website and the app are separate products that happen to share a repo.
- Inside `apps/landing`: anything under `src/server` imports `server-only` and is never imported by a client component. Shared code in `src/lib` has no Node, database or mail imports.
- `packages/core` is pure: no React, no Node, no Electron, no DOM. It must run in a browser, in Node and in a worker.
- `packages/tokens` has no runtime dependencies.
- Inside `apps/desktop`: the renderer imports nothing from `main` or `preload` and nothing from Node or Electron. `shared` is environment neutral. The sandboxed preload imports only `electron` and types.
- Packages are consumed as TypeScript source (exports point at `src/`). Next needs `transpilePackages`. electron-vite bundles them.

## Stack and pins

Single source of truth is the pnpm catalog. Packages reference versions as `catalog:`. These pins were resolved on 2026-10-24 under a 7 day minimum release age. Dependabot proposes updates and CI gates them. Do not bump by hand without reading the notes below.

| Area | Pins |
| --- | --- |
| Toolchain | pnpm 12.15.0, Node 22 (engines `>=22.18.0`, Prisma 7 needs it), typescript 6.0.3, turbo 2.11.8, vite 8.3.4 |
| Desktop | electron 44.7.2, electron-vite 6.0.0, electron-builder 26.17.0, @vitejs/plugin-react 6.1.2 |
| Web and UI | react-hook-form 7.90.0, @hookform/resolvers 5.9.2, @fontsource/urbanist 5.3.0, next 16.4.2, react 19.3.1, react-dom 19.3.1, @types/react 19.3.0, @types/react-dom 19.3.0, lucide-react 1.57.0, @fontsource-variable/urbanist 5.3.0 |
| Data and mail (landing) | prisma 7.10.1, @prisma/client 7.10.1, @prisma/adapter-pg 7.10.1, nodemailer 10.1.1, @types/nodemailer 8.0.2, server-only 0.0.1 |
| Shared | zod 4.6.7, @types/node 24.19.2 |
| Tests | vitest 5.0.5, @vitest/coverage-v8 5.0.5, fast-check 4.10.2, @playwright/test 1.64.1, @axe-core/playwright 4.14.0, @lhci/cli 0.15.1, serve 14.2.6 |
| Quality | eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.2, eslint-plugin-react-hooks 7.1.1, globals 17.13.0, prettier 3.9.10, husky 9.1.7, lint-staged 17.6.0, @commitlint/cli 21.2.3, @commitlint/config-conventional 21.2.3, knip 6.41.0 |

Pin `prisma` to 7.10.1 explicitly. On npm the `latest` tag for `prisma` currently points at a release candidate of version 8, which must not be installed. Native and media dependencies arrive in Phase 2 and later (a global mouse hook such as uiohook-napi, a bundled FFmpeg binary). Pin them exactly when added, and apply the same 7 day rule.

Key `pnpm-workspace.yaml` settings:

```yaml
packages:
  - apps/*
  - packages/*

catalog:
  # every third party version, exact, listed once

minimumReleaseAge: 10080   # minutes, 7 days

allowBuilds:               # pnpm 12 syntax for install scripts
  electron: true
  esbuild: true
  sharp: true
  unrs-resolver: true
  electron-winstaller: false   # Squirrel installers, unused (we ship NSIS)
  # Add prisma or @prisma/engines here only if install reports them as ignored,
  # after reading what their install scripts do.
```

Root `package.json` has `"type": "module"`, `"packageManager": "pnpm@12.15.0"` and `engines` (`node >=22.18.0`). `.npmrc` sets `engine-strict=true` and `save-exact=true`.

## Commands

```
pnpm install            install with the lockfile policy checks
pnpm db:up              start local Postgres and Mailpit (Docker Compose)
pnpm db:generate        generate the Prisma client
pnpm db:migrate         create and apply a development migration (prisma migrate dev)
pnpm db:deploy          apply committed migrations (prisma migrate deploy), used by CI and releases
pnpm db:studio          browse local data
pnpm dev:landing        landing page dev server (needs db:up and a local .env)
pnpm dev                desktop app in dev mode (Phase 2+)
pnpm check              lint, typecheck, test, build via turbo. Run before every push.
pnpm test               unit and property tests with coverage
pnpm test:e2e           Playwright (landing) and Playwright Electron (desktop)
pnpm test:lighthouse    Lighthouse CI against the production build of the landing page
pnpm knip               unused files, exports and dependencies
pnpm format             prettier --write
pnpm package            electron-builder installers (Phase 2+)
```

Turbo tasks declare inputs and outputs, run in strict env mode, and cache `build`, `lint`, `typecheck` and `test`. `build`, `typecheck` and `test` depend on `db:generate`. E2E, Lighthouse, migration and package tasks are never cached.

## Architecture (desktop)

### Process model

- Main: window lifecycle, session hardening, IPC handlers, file system access, FFmpeg child processes, global shortcuts, global input hook, tray.
- Preload: sandboxed, CommonJS, dependency free. Exposes a typed `window.scrim` bridge through `contextBridge`. Channel names are string literals checked against the contract at compile time.
- Renderer: React UI. Treated as untrusted web content.

### Typed IPC

`src/shared/ipc-contract.ts` declares every channel with zod input and output schemas. The main process validates the sender (our own page only), the input and the output on every call. Add a channel in this order: contract, main handler, preload bridge, `ScrimApi` type, tests. Streaming data (chunks) uses a dedicated port or file handle, not repeated `invoke` calls.

### Security baseline (tested)

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`. These live in one exported constant with a unit test so nobody weakens them silently.
- Strict CSP on the packaged renderer: `default-src 'none'`, scripts and styles from `'self'` only, no `unsafe-eval`, no `unsafe-inline`. Looser only for the dev server.
- Navigation is blocked, new windows are denied, webviews are denied.
- A permission handler allows only `media` and `display-capture`, and only for our own page.
- `shell.openExternal` is reached only through an allowlisted IPC channel.
- Single instance lock.

### Capture and the input log

- Capture the screen with the cursor hidden, using Chromium capture (`desktopCapturer` and `setDisplayMediaRequestHandler`), recorded with `MediaRecorder` into chunks streamed to disk. If benchmarks show Chromium capture cannot hold 4K at 30 fps or 1080p at 60 fps, spawn a bundled FFmpeg for capture instead, as the reference app does.
- Record the camera and microphone as separate tracks. Do not bake them into the screen video.
- A global input hook logs mouse moves and clicks with timestamps relative to the recording clock. The log is validated by `sessionLogSchema` (version 1) and saved beside the video as `.scrim.json`.
- Pause and resume: the recording clock excludes paused time. Event timestamps and track offsets must stay aligned across pauses. This needs a dedicated test.
- The live cursor overlay is a transparent, click through, always on top window with `setContentProtection(true)` so it is not captured twice. Effects in the saved video come from export time rendering.

### Record, then render

The original recording is never modified. Cursor halo, ripples, auto zoom, backdrop, camera bubble, trim and cuts are all rendered at export from: raw video, camera track, audio tracks, input log, and the edit list. Benefits: non destructive edits, before and after is cheap, and effects can be changed after recording.

Export pipeline (decision to confirm with a spike, recorded in an ADR): FFmpeg decodes the raw video to frames, a compositor draws zoom, backdrop, rounded corners, shadow, cursor effects and the camera bubble on an `OffscreenCanvas` in a worker, and a second FFmpeg encodes H.264 and muxes AAC into the `.partial` MP4. Target: at least real time for 1080p30 on a mid range laptop. If the spike fails, fall back to FFmpeg filter graphs driven by the camera keyframes.

### Platform notes

- Windows: unsigned builds trigger SmartScreen until signed. Apply to SignPath's free open source program.
- macOS: first recording needs the Screen Recording permission, and the global input hook needs Accessibility or Input Monitoring. Plan a first run permission guide. Notarization needs an Apple Developer account ($99 a year) and is optional at first. Entitlements: audio input, camera, JIT.
- Linux: AppImage and deb. On Wayland, global input hooks do not work, so cursor effects and auto zoom are disabled there and the UI says why in plain words. Recording itself should work through the PipeWire portal. X11 gets everything. Test both.
- Only `dependencies` get externalized by electron-vite. Keep all JS libraries in `devDependencies` so they are bundled. Native modules go in `dependencies` and are unpacked from the asar.

## Landing page (`apps/landing`, Phase 1)

One Next.js App Router project holds everything for the website: pages, API route handlers, the Prisma schema and migrations, the mail code and the tests. There is no separate backend service. It runs on a Node runtime (it is not a static export) and is hosted on Vercel. See "Hosting (Vercel)" below.

### Sections and order

Current state (owner decisions, 2026-10-26): the page has the hero (live zoom demo), features (eight stacking cards numbered 01/08 to 08/08), use cases, download (with "Need help?" first run help per system), FAQ in two columns, contribute, contact and a closing call to action, then the footer. The About section is hidden. The header pill holds the logo, five nav links and a Download button at every width. Support (the Buy me malt link) lives in the footer as "Show your Support" with a heart, in the mobile menu as "Support", and on the download success view and the confirmation email. The footer has a Built by popover with five social icons in one row, green by default and black on hover. Every link to another site opens in a new tab through `SiteLink`. The original list follows for reference.

1. Hero: one sentence on what Scrim does, one Download button labelled for the visitor's system, View source link.
2. Features: the headline claims and feature areas above, each with a real image or live demo.
3. Who it is for: tutorials, product demos, teaching, bug reports, sales and support, personal use.
4. Download: Windows, macOS, Linux, and first run help for each (SmartScreen, macOS Open Anyway and Screen Recording permission, Linux X11 versus Wayland note).
5. About: why Scrim exists, privacy stance, who builds it.
6. Contribute: repo link, how to run it, good first issues, link to CONTRIBUTING.md.
7. Contact: GitHub issues and one email address. No contact form.
8. Footer: license, source, release notes, privacy policy, Buy me malt link (see below).

Download is added beyond the original section list because the call to action needs a destination. FAQ is optional and decided later. Do not promote the owner's agency or any paid service on this site (see the Vercel note in Gotchas).

### Download flow

1. The visitor clicks Download. A modal opens. Use a native `<dialog>` opened with `showModal()` so focus trapping, Escape and the backdrop come for free.
2. Fields: name, email, system (preselected from detection, always changeable), a checkbox "Email me when a new version is out" (unchecked by default), and a hidden honeypot field. One plain sentence says what is stored, with a link to the privacy page.
3. The client validates with React Hook Form and the shared zod schema (no HTML `required`, an error under each field, shown in red), then POSTs JSON to `/api/downloads`.
4. The server validates again, checks origin, honeypot and rate limits, upserts the person by lower cased email, records a `Download` row, and resolves the file URL for the chosen system and architecture from the latest GitHub Release.
5. The response is `{ url, filename, version }`. The client starts the download and shows install help for that system.
6. After the response is sent, the server sends the confirmation email to the visitor and a short note to the owner (`contactInbox` in `site.config.ts`) with Nodemailer, scheduled with Next's `after()` so nobody waits on SMTP.

Failure behavior: never block a download because bookkeeping failed. If the database write or the email fails, still return the URL, log the failure without personal data, and surface it in monitoring. Validation errors and rate limits do return clear messages. Be honest in the copy: the form exists to count downloads, and release files on GitHub are public.

Without JavaScript the Download button is a plain link to the GitHub Releases page.

### Detecting the system

A pure function `detectPlatform(input)` in `src/lib/platform.ts` returns `{ os: 'windows' | 'macos' | 'linux' | 'unsupported', arch: 'x64' | 'arm64' | 'unknown' }`. It has table driven unit tests built from real user agent strings.

- Prefer `navigator.userAgentData` (platform, and `getHighEntropyValues(['architecture', 'bitness'])` where available). Fall back to `navigator.userAgent`.
- Run only on the client after hydration. Server render and first paint show a neutral "Download" that works for everyone, then upgrade to "Download for Windows" and so on. Reserve the button width so nothing shifts.
- macOS architecture cannot be detected reliably in Safari and Firefox. Default to Apple Silicon and show a visible "Intel Mac?" choice in the modal. Never lock the visitor into the guess.
- Phones and tablets: say Scrim is for desktop computers and offer "Email me the link", which reuses the same form and sends the download page link instead of a file.
- Linux: offer deb and AppImage and mention the X11 and Wayland limits.

### Data model

`apps/landing/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Os {
  WINDOWS
  MACOS
  LINUX
}

enum Arch {
  X64
  ARM64
}

model Person {
  id               String     @id @default(uuid()) @db.Uuid
  email            String     @unique
  name             String
  updatesOptIn     Boolean    @default(false)
  unsubscribeToken String     @unique @default(uuid())
  unsubscribedAt   DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  downloads        Download[]
}

model Download {
  id          String    @id @default(uuid()) @db.Uuid
  personId    String    @db.Uuid
  person      Person    @relation(fields: [personId], references: [id], onDelete: Cascade)
  os          Os
  arch        Arch?
  version     String
  ipHash      String
  userAgent   String?
  emailSentAt DateTime?
  createdAt   DateTime  @default(now())

  @@index([personId])
  @@index([createdAt])
  @@index([ipHash, createdAt])
}
```

- Emails are stored lower case. `ipHash` is HMAC-SHA256 of the IP with `IP_HASH_SECRET`. Raw IPs are never stored or logged. The user agent is truncated to 200 characters.
- Deleting a `Person` cascades to their downloads, which is how a deletion request is honored.
- Migrations live in `prisma/migrations`, are committed, and are reviewed like code. The first migration enables row level security on both tables with no policies. Prisma connects as the table owner and bypasses RLS, and the public Supabase Data API must not be able to read these tables.
- Prisma 7 setup: `prisma.config.ts` points the CLI at `DIRECT_URL`. At runtime the client is built with `@prisma/adapter-pg` using the pooled `DATABASE_URL` (Supabase transaction pooler, port 6543, `pgbouncer=true`). `DIRECT_URL` is the direct connection or the session pooler (port 5432). One client per process, kept on `globalThis` in development.
- No Supabase JavaScript client, anon key or service role key anywhere in this repo. Supabase is just managed Postgres here.

### API

All handlers set `export const runtime = 'nodejs'`, accept JSON only and are same origin only.

| Route | Purpose |
| --- | --- |
| `POST /api/downloads` | Validate, record, resolve the file URL, schedule the email. |
| `POST /api/unsubscribe` | Set `unsubscribedAt`. Called by the button on `/unsubscribe?token=...`. Never unsubscribe on GET, because link scanners prefetch GET requests. |
| `GET /api/health` | Liveness for an uptime monitor. No database details in the response. |

Handlers stay thin: parse, call a function in `src/server`, map the result to a response. Business logic lives in plain functions that tests call directly.

Release lookup runs on the server: fetch the latest GitHub Release, cache it for a few minutes, and match assets to system and architecture with a pure function (by extension and architecture, with tests). If no asset matches, or no release exists yet, return the Releases page URL and say so.

### Mail (Nodemailer)

- One SMTP transport per process, created lazily from env. Any SMTP provider works, so write no provider specific code.
- The sending domain needs SPF, DKIM and DMARC before launch, or mail lands in spam.
- Email 1, download confirmation: file link, version, first run help for the chosen system. Email 2, update notice: only for people with `updatesOptIn` and no `unsubscribedAt`. Every email carries an unsubscribe link and `List-Unsubscribe` headers. Templates are small functions that return plain text and HTML, with no template engine dependency.
- Escape the name and email in every HTML template, and test it.
- At most one confirmation per address per hour, so the form cannot be used to spam someone.
- Tests never use real SMTP. They use Mailpit.

### Abuse protection

- Honeypot, origin check, request size limit, strict zod schema (name 1 to 80 characters, email normalized and at most 254).
- Rate limit by `ipHash` using the `Download` table (for example 10 per hour). It works on serverless and on a single container with no Redis.
- No CAPTCHA at launch. If abuse appears, add a privacy friendly challenge then.

### Privacy and compliance

- Collected: name, email, chosen system and architecture, app version, hashed IP, truncated user agent, timestamps. Nothing else.
- Purpose: count downloads, send the download email, and send update notices to people who opted in.
- The update checkbox is unchecked by default and unsubscribing takes one step.
- A `/privacy` page in plain language states what is stored, why, how long, and how to request deletion. Retention is a decision for the owner (for example, delete `Download` rows after 24 months).
- The desktop app sends nothing to this server.
- The owner should review obligations under Nigeria's data protection law and under GDPR, since visitors come from anywhere. This file is not legal advice.

### Environment

Validated at boot by `src/server/env.ts` with zod. The app fails fast with a readable message when something is missing. Only `.env.example` is committed, with placeholders.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Supabase connection for the running app |
| `DIRECT_URL` | Direct or session pooler connection for migrations |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Mail transport |
| `MAIL_FROM` | Sender, for example `Scrim <hello@your-domain>` |
| `IP_HASH_SECRET` | Random 32 bytes used to hash IPs |
| `SITE_URL` | Public origin, used for links and origin checks |
| `GITHUB_REPO` | `oyedokunken/scrim`, for release lookups |
| `GITHUB_TOKEN` | Optional, raises GitHub API rate limits |

### Local development

`pnpm db:up` starts Postgres and Mailpit with Docker Compose using throwaway credentials. Mailpit catches all outgoing mail at `http://localhost:8025`. Alternatively point `DATABASE_URL` and `DIRECT_URL` at a separate Supabase development project. Never develop against the production database.

### Hosting (Vercel)

- Plan: Vercel Hobby. It is limited to non commercial personal use. Asking for donations is allowed under the current fair use guidelines. Advertising a product or service, or any payment to anyone involved in building or hosting the site, is not. Keep the owner's agency and every paid offer off this site, and do not use the update email list for marketing them. If that ever changes, move to Pro first.
- Vercel project root is `apps/landing`. Turn on the option to include source files from outside the root directory so the workspace packages resolve. Build with turbo, filtered to the landing, with `db:generate` first.
- Environment variables are set in Vercel and scoped by environment. Production uses the production Supabase database. Preview and Development use a separate dev database and a mail catcher or a sandbox SMTP account. A preview deployment must never touch production data.
- Place the functions in the Vercel region closest to the Supabase region, so database round trips stay short.
- Routes that send mail or use Prisma declare the Node runtime. Send mail with `after()`.
- Migrations are not part of the Vercel build. Run `prisma migrate deploy` against production with `DIRECT_URL` as a separate, deliberate step before promoting a deployment.
- Do not enable Vercel Analytics or Speed Insights. The site has no analytics by rule.
- Watch the Hobby usage limits (function invocations, data transfer, active CPU). A traffic spike on a free plan can pause the project, so keep an uptime check and know where the usage page is.

### Buy me malt

The link points to the owner's page at `https://buymeamalt.com/@oyedokunken`, where supporters buy the owner a malt (checkout is handled by the platform). The URL lives in one config file, `src/site.config.ts`. It is a plain outbound link that opens in a new tab with `rel="noopener noreferrer"`. Do not embed their widget or script, because the site loads no third party scripts.

### Hero direction

Make the hero a live demonstration, not a screenshot. Run the real `planZoom` and `sampleCamera` from `@scrim/core` on a scripted cursor path over a mock window, so the page itself shows auto zoom working. Expose a zoom-only subpath from core (for example `@scrim/core/zoom`) so the landing bundle does not pull in zod. This is the one memorable element. Everything else stays quiet.

### Quality bars

- Lighthouse on the production build, served with `next start`: performance at least 95 on mobile, accessibility 100, best practices 100, SEO 100. Budgets are enforced in CI and are not to be lowered.
- Axe: zero violations on desktop and mobile viewports, including with the modal open.
- First load JavaScript under 100 kB gzipped. Latin subset of Urbanist only, preloaded. Images in AVIF or WebP with explicit dimensions. No layout shift.
- Content readable without JavaScript. Visible keyboard focus. `prefers-reduced-motion` respected. One orchestrated motion moment at most, plus motion that responds to user action.
- Full metadata, Open Graph image, sitemap and robots.
- Security headers set in `next.config.ts`: a strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Privacy: no analytics, no cookies, no third party requests from the page. Download counts come from the `Download` table and from GitHub release statistics.

## Design system

- Palette (in `packages/tokens`, mirrored in `tokens.css`, kept in sync by a test):

| Name | Hex | Role |
| --- | --- | --- |
| Green | `#004E52` | Brand. Buttons, links, focus rings, key accents. |
| Butter | `#FBF8F4` | Page background. The most common surface. |
| Black | `#000000` | Text, the header and the footer. A neutral black. |
| White | `#FFFFFF` | Raised surfaces: cards, inputs, the download modal. |
| Record red | `#FF3B30` | A signal color for recording indicators only: the REC dot and the back to top button. Never for text on butter, never for buttons or links. Form errors use a darker red mixed from it with black (70 percent red), which clears 4.5 to 1 on white. |

- Green and butter are the main colors. Butter carries the page, green carries the brand, white lifts things off the page, black is for text. Greys support: they are for borders, dividers, secondary text and quiet fills, never for large areas.
- Greys are the black mixed into butter or white with `color-mix`, so they stay consistent. No separate grey hex values. Suggested steps: secondary text at 72 percent black, a border at 14 percent, a quiet fill at 8 percent.
- A test fails if CSS introduces a hex value outside the palette.
- Contrast is tested, with these measured ratios as the floor: black on white 21, black on butter 19.8, green on white 9.5, green on butter 9.0, white on green 9.5, butter on green 9.0, secondary text (72 percent black) on butter 9.0. Every pair above clears WCAG AAA. Never put black text on green, or green text on black, which are only 2.2. Use white or butter on green.
- Type: Urbanist only. Set a deliberate scale, line length under 80 characters, sentence case.
- Icons: lucide only, `aria-hidden` when decorative.
- Avoid generic AI looking patterns: tracked out all caps eyebrow labels, numbered markers where the content is not a sequence, one rounded card style repeated everywhere, gradient washes, fade and slide entrances on every section, accenting a single word in a headline.
- Copy: plain verbs, active voice, specific. Buttons say what happens ("Download for Windows"). Errors explain what went wrong and how to fix it. No filler, no hype.

## Open source hygiene and secrets

The repo is public. Assume anything committed is permanent and read by everyone.

- Never commit: `.env` files, API keys, SMTP credentials, database URLs, Supabase keys, signing certificates, Apple or Windows signing material, database dumps, recordings, or personal data.
- Commit: `.env.example` (placeholders only), `schema.prisma`, migrations, `docker-compose.yml` (local throwaway credentials), `CODEOWNERS`.
- Turn on GitHub secret scanning and push protection. CI runs gitleaks on every push and pull request.
- If a secret is ever committed, rotate it first. Rewriting history comes second and does not make a leaked secret safe.
- Production secrets live only in Vercel's environment settings and in GitHub Actions secrets.

Required `.gitignore` entries (the file must exist before the first commit):

```gitignore
# secrets and local config
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
*.p8
*.cer
*.mobileprovision
*.keystore
secrets/
certs/
credentials*.json
service-account*.json

# database, dumps and local data
*.sql.gz
*.dump
*.sqlite
*.db
.supabase/
supabase/.temp/
supabase/.branches/
dev-data/
apps/landing/src/generated/

# build output and caches
node_modules/
.pnpm-store/
.turbo/
.next/
out/
dist/
release/
coverage/
.lighthouseci/
playwright-report/
test-results/
*.tsbuildinfo
next-env.d.ts

# hosting
.vercel/

# editor and OS
.idea/
.DS_Store
Thumbs.db
*.log

# AI tool and agent state (no attribution policy)
.claude/
.cursor/
.codex/
.devin/
.windsurf/
.aider*

# raw recordings made while developing (landing demo media is allowed)
recordings/
*.scrim.json
*.webm
*.mp4
*.mkv
*.mov
!apps/landing/public/**
```

## Testing

Detailed in `docs/testing.md`. Summary:

| Layer | Tool | What it proves |
| --- | --- | --- |
| Unit | Vitest | Pure logic in `core`, `tokens`, desktop helpers and landing `src/lib` (platform detection with real user agent strings, release asset matching, email templates). Coverage gates on `core`: lines 95, functions 95, branches 90. |
| Property | fast-check | Planner keyframes are time ordered and scale bounded. Camera never leaves the frame. Export sizes are even, never upscale, deterministic. Edit list cuts never overlap or reorder. |
| Contract | Vitest + zod | IPC schemas reject stray input and malformed output. Request schemas for the website API reject bad names, emails and oversized bodies. |
| Integration | Vitest + Postgres + Mailpit | The download route against a real database and a mail catcher: records the person and the download, returns the right URL, rate limits, honeypot, idempotent upsert, unsubscribe, still returns the URL when mail fails, escapes HTML in emails. CI uses service containers. Never real Supabase or real SMTP. |
| Component | Vitest | Editor controls and state, where logic is non trivial. |
| E2E desktop | Playwright `_electron` | Launches; renderer has no Node access; only the typed bridge exists; navigation blocked; minimize, maximize, restore and close all work; recording survives a killed process and is recoverable; export golden test (below); no network requests during record, edit and export. |
| E2E landing | Playwright | The full modal flow with Mailpit: open, fill, submit, download starts, email arrives with the right link. OS detection with spoofed user agents (Windows, macOS, Linux, phone). Keyboard only use, Escape closes the modal and returns focus, mobile and desktop viewports. |
| Accessibility | @axe-core/playwright | Zero violations. |
| Performance | Lighthouse CI | Category scores and byte budgets. |
| Visual | Playwright screenshots | Hero and key sections do not regress. |
| Hygiene | knip, tsc, eslint | No dead code, no type errors, no boundary violations. |

Export golden test: generate a synthetic input with FFmpeg `lavfi` (`testsrc2` plus a sine tone), a scripted input log and an edit list, run the real export, then assert with ffprobe: H.264, yuv420p, AAC, even dimensions, requested resolution and frame rate, duration equals source minus cuts within tolerance, no `.partial` file left behind.

Crash recovery test: start a recording, kill the app process hard, relaunch, assert the Recover prompt appears and the recovered file is playable.

Linux E2E runs under `xvfb-run`. CI passes `--no-sandbox` to Electron on GitHub runners. Local runs keep the sandbox on.

## CI and releases

- `ci.yml`: install with frozen lockfile, generate the Prisma client, then lint, typecheck, test, build, knip, format check. Turbo runs only what changed. Concurrency cancels superseded runs. Workflow permissions default to read only.
- `e2e-desktop.yml`: matrix of ubuntu, windows and macos. Runs only when `apps/desktop`, `packages/**` or the workflow change.
- `landing-quality.yml`: starts Postgres and Mailpit as service containers, applies migrations with `prisma migrate deploy` to the throwaway database, runs integration tests, builds, starts `next start`, runs Playwright with axe, then Lighthouse CI against the running server. Runs only on landing, tokens or core changes.
- `commit-policy.yml`: on pull requests, scans commit messages, the PR title and the PR body for AI attribution (co-author trailers, "generated with" lines) and fails when it finds any.
- `secrets-scan.yml`: gitleaks on every push and pull request.
- `codeql.yml` and dependency review on pull requests.
- `release.yml`: on a `v*` tag, verify the tag matches the desktop version, build installers on all three OSes, publish to GitHub Releases with electron-builder. Windows signing through SignPath once approved. macOS signing and notarization only when the Apple secrets exist.
- Pin third party GitHub Actions by commit SHA and let Dependabot update them. Dependabot groups npm updates weekly.
- Production migrations are an explicit step (`prisma migrate deploy` with `DIRECT_URL`) run before a new landing version goes live. The app never migrates on startup.
- The landing deploys independently of installers. Landing changes never build or publish desktop artifacts.

## Conventions

- No attribution. Commit messages, pull request text and issues never contain `Co-Authored-By` trailers or "Generated with" lines for any AI tool or agent. `commitlint.config.js` carries a local rule that rejects them, and `commit-policy.yml` enforces the same on pull requests. Switch off attribution in any assistant's own settings as well. Agent state folders are gitignored. The `CLAUDE.md` filename exists only so tooling finds this file, and tools are not named anywhere else.
- Conventional Commits, enforced by commitlint. Scopes: `desktop`, `landing`, `core`, `tokens`, `ci`, `deps`, `docs`, `repo`. Subject in lower case, 72 characters at most. Example: `feat(core): clamp zoom center inside the frame`.
- Branches: `feat/`, `fix/`, `chore/`, `docs/` prefixes. Squash merge. `main` is protected and always releasable.
- Small pull requests with one concern. The template asks: what changed, why, how it was tested, and screenshots for UI.
- Files in kebab case. Named exports. Default exports only where a framework requires them.
- Comments explain why, not what. Public functions in `core` carry a short doc comment.
- Architecture decisions go in `docs/adr/NNNN-title.md` with context, decision, consequences. Existing and planned: Electron over Tauri and Flutter, record then render, export pipeline spike, monorepo tooling.
- Never commit recordings, `.env` files or build output.

## Definition of done

- `pnpm check` passes locally and in CI with zero warnings.
- New behavior has tests, and the coverage and Lighthouse gates still pass.
- No security setting, boundary rule or budget was loosened.
- UI changes meet the design rules, work by keyboard, and pass axe.
- Docs and ADRs updated if a decision changed. No em dashes, no emojis.
- For landing work: migrations are committed and reviewed, `.env.example` is updated, the diff contains no secrets, and the privacy page matches what is collected.
- For desktop work: tested on at least Windows or Linux locally, and the macOS and the other OS paths are covered by CI or flagged for testing.

## Gotchas already found

- pnpm 12 uses `allowBuilds` (a map of package to true or false). The old `onlyBuiltDependencies` list is not enough: install fails until `electron-winstaller` is explicitly set to false.
- With `minimumReleaseAge: 10080`, brand new releases are refused. On 2026-10-24 that ruled out electron 45.0.0, vite 8.3.5, typescript-eslint 8.72.0 and knip 6.43.0, so the pins sit one step behind latest. Choose pins at least 8 days old.
- typescript-eslint 8.71.2 peers on `typescript >=4.8.4 <6.1.0`, so TypeScript stays on 6.0.3 until typescript-eslint supports 7.
- electron-vite output is CommonJS when the desktop `package.json` has no `"type": "module"`. The sandboxed preload must be CommonJS, so keep it that way and do not import zod or Node modules in preload.
- Electron 44 typings have no `webContents.getLastWebPreferences()`. Assert isolation through the exported constant in a unit test, and through the working `contextBridge` bridge in E2E.
- The desktop app needs a solution style `tsconfig.json` that references `tsconfig.node.json` and `tsconfig.web.json`, run with `tsc -b`, so typescript-eslint's project service finds the right config per file.
- Inside Playwright `evaluate` callbacks, do not name the Playwright page `window`. It shadows the browser global in types.
- `electron-builder` needs icons in `apps/desktop/build` (`icon.ico`, `icon.icns`, `icon.png`). Without them it falls back to the default Electron icon.
- Prisma 7 requires Node `^22.18.0`, a `prisma.config.ts`, the `prisma-client` generator with an explicit `output`, and a driver adapter (`@prisma/adapter-pg`). The npm `latest` tag for `prisma` points at a version 8 release candidate, so pin 7.10.1.
- Supabase has two connection types that are not interchangeable. Runtime queries use the transaction pooler on port 6543 with `pgbouncer=true`. Migrations use the direct connection or the session pooler on port 5432. Running migrations through the transaction pooler is the most common failure.
- Prisma connects as the table owner and bypasses row level security. Enable RLS with no policies on every table so the public Supabase Data API cannot read them.
- Nodemailer needs the Node runtime. Set `runtime = 'nodejs'` on any route that sends mail. Send after the response with `after()`.
- Vercel's Hobby plan is limited to non commercial personal use. Its current guidelines say asking for donations is not commercial use, but advertising a product or service, or payment to anyone involved in building or hosting the site, is. Keep the owner's agency and any paid offer off the site, or move to Pro.

## Open decisions

Ask the owner before building around any of these.

1. Maximum export resolution. Working ceiling is 3840 by 2160.
2. SMTP provider and the sending domain (SPF, DKIM, DMARC).
3. Supabase project: a dedicated project for Scrim, its region, and the plan.
4. Data retention period and the text of the privacy page.
5. Domain name, logo and app icon, and the public contact email.
6. Whether to apply for SignPath and whether to buy an Apple Developer account at launch.