# Security policy

## Supported versions

Security fixes are made against the latest version on the `main` branch and the latest published release. Older releases may not receive security updates.

## Reporting a vulnerability

Please do not report security vulnerabilities in a public issue.

Use GitHub's private vulnerability reporting for this repository when it is available. Include:

- A clear description of the vulnerability
- The affected component and version or commit
- Reproduction steps or a proof of concept
- The likely impact
- Any suggested mitigation

Please avoid including personal data or secrets in the report. Reports are reviewed as soon as practical. The issue will be kept private while it is investigated, and a fix or mitigation will be coordinated before public disclosure where appropriate.

## Security expectations

Scrim is designed with these boundaries:

- Recordings stay on the user's computer
- The desktop app makes no network requests during recording, editing or export
- Website input is validated on the client and server with the same zod schema
- Download and unsubscribe requests are same origin only, JSON only and size limited, with a honeypot and a rate limit per hashed IP
- Unsubscribing is a POST, never a GET, so link scanners cannot unsubscribe anyone
- Email templates escape every visitor supplied value
- The site sets a strict Content Security Policy with no `unsafe-eval`, plus HSTS and related headers
- The site loads no analytics or third party scripts and sets no cookies
- Every link to another site opens in a new tab with `rel="noopener noreferrer"`
- Raw IP addresses are not stored or logged
- Secrets and credentials must never be committed

### Desktop app

- The renderer is treated as untrusted web content: `contextIsolation` and `sandbox` are on, `nodeIntegration` is off, and these settings live in one tested constant
- A strict Content Security Policy is served from the packaged `app://` protocol, with no `unsafe-eval` and no inline script or style
- Every IPC channel has a zod schema for its input and output, and the main process checks the sender before it answers
- Navigation is blocked, new windows and webviews are denied, and only the `media` and `display-capture` permissions are granted, only to the app's own pages
- Links open in the browser only through one allowlisted channel with exact URLs
- The packaged binary has the Electron fuses set, and a test reads them back
- The renderer never sees the file path of a recording or the technical text of an error
- The bundled FFmpeg is run with an argument array and no shell, and its checksum is pinned
- Working files stay on the user's computer. Discarding a recording moves it to the Recycle Bin after a confirmation
- The app sends nothing to the website or to any other server
