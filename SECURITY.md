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
- Website input is validated on the client and server
- Raw IP addresses are not stored or logged
- Secrets and credentials must never be committed

