# Contributing to Scrim

Thanks for helping improve Scrim.

## Before you start

The website (`apps/landing`) and the Windows desktop app (`apps/desktop`) are both under active development, and they never import from each other. They share code only through `packages/*`. Read [CLAUDE.md](CLAUDE.md) for the complete project requirements and architecture, and `docs/adr` for the decisions behind them.

For a substantial change, open an issue first so the direction can be agreed before implementation.

## Development setup

Requirements:

- Node.js 22.18 or newer
- pnpm 12.15.0
- A Postgres database (local, or a separate Supabase development project)
- An SMTP account for Nodemailer, or a mail catcher such as Mailpit

Use pnpm only. Install dependencies with:

```bash
pnpm install
```

For landing page work, start the local services and configure a development environment:

```bash
pnpm db:generate
pnpm dev:landing
```

Copy `apps/landing/.env.example` to `.env` and point it at a development database. A mail catcher such as Mailpit works for mail. Never develop against the production database.

For desktop work, run `pnpm dev` (electron-vite). The packaged app is built with `pnpm package`, which fetches the pinned FFmpeg build first. Recordings made while developing go to the projects folder and must never be committed.

## Making changes

1. Create a branch with a `feat/`, `fix/`, `chore/` or `docs/` prefix.
2. Keep the pull request focused on one concern.
3. Add tests for every behavior change. Bug fixes should begin with a failing test.
4. Keep TypeScript strict and validate all external boundaries with zod.
5. Update directly related documentation.
6. Run `pnpm check` before opening a pull request.

Do not commit secrets, environment files, recordings, build output, database dumps or personal data. `.env.example` may contain placeholders only.

## Code conventions

- Use exact dependency versions from the pnpm catalog.
- Use named exports except where a framework requires a default export.
- Use kebab-case filenames.
- Use Urbanist and the shared design tokens for UI work.
- Use Lucide icons, plus the brand icons already in the landing app.
- Open every link to another site through `SiteLink`, so it opens in a new tab.
- Build forms with React Hook Form and zod. Do not use the HTML `required` attribute.
- Show errors in the red error color, and keep the record red for recording indicators.
- Keep the landing app and desktop app independent.
- Do not weaken security settings, lint rules, coverage thresholds or performance budgets.
- Do not add analytics, tracking cookies or third-party scripts.

## Testing and checks

Run the smallest relevant checks while working, then the complete check before submitting:

```bash
pnpm test
pnpm check
pnpm knip
pnpm format
```

Landing page changes should also pass the integration, end-to-end, accessibility and Lighthouse checks. Desktop changes must include unit tests and, for anything a person can see, an end to end test that drives the app's own pages (never the computer's mouse or keyboard). They must work in the installed app, not only in development. GitHub Actions may be unavailable, so run the checks locally and say which you ran in the pull request.

## Pull requests

Pull request descriptions should explain:

- What changed
- Why it changed
- How it was tested
- Screenshots or recordings for UI changes, when useful

Use Conventional Commits with a lowercase subject and an appropriate scope, such as:

```text
feat(landing): add download form
fix(core): clamp zoom center inside the frame
docs(repo): clarify local setup
```

Do not include secrets, personal data or tool attribution in commits, pull requests or issues.
