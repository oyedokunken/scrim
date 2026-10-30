# Code signing

Why sign: an unsigned Windows installer shows a SmartScreen warning and a "Unknown publisher" prompt,
and the updater has nothing to verify an update against. This page covers the options, what the
pipeline does today, and what the owner must do. It was written on 2026-10-30 from the vendors' own
pages. Anything not confirmed is marked "not verified". Rules and prices change, so check each
page again before paying or applying.

## What is signed today

Nothing. The release workflow builds an unsigned NSIS installer. This change adds the pipeline, so
that adding secrets turns signing on and an unsigned build still works (with a warning in the job
summary and a `::warning::` annotation).

## Options for an open source project with one maintainer

### a) SignPath Foundation (recommended first step, free)

- Free certificates for open source projects. The certificate is issued to the SignPath
  Foundation, so Windows shows "SignPath Foundation" as the publisher, not the maintainer.
- Conditions (from signpath.org/terms, fetched 2026-10-30): an OSI approved licence with no
  commercial dual licensing, no malware or unwanted programs, the project is maintained and already
  released in the form to be signed, functionality is described on the download page, only your own
  binaries built from your own source, multi factor authentication for everyone on SignPath and the
  repository host, a defined author, reviewer and approver with approval of each signing request,
  a published "Code signing policy" on the home page with roles, the certificate attribution and a
  privacy statement, and verifiable builds from CI.
- Scrim meets the licence (MIT) and the CI build conditions. It still needs a code signing policy
  page and a first release in the signed form.
- Not verified: the application form steps and turnaround time (the terms page links to the form
  but does not describe it), whether a public repository is a hard rule (Scrim is public anyway),
  and any signing quotas.
- Integration: the official GitHub action `signpath/github-action-submit-signing-request` (pinned
  in the workflow at v3.0). Its inputs were read from its `action.yml`. SignPath signs a file you
  upload as a workflow artifact, and returns the signed file.
- Limits of this path: it signs the finished installer. The exe inside the installer is not signed,
  because it is built before the installer. SmartScreen and the updater look at the installer, so
  this is acceptable for a first release. Signing the inner files too needs a second SignPath
  request on `win-unpacked` before the installer is built, which can be added later. Signing after
  the build also changes the installer bytes, so `latest.yml` (the update feed, if the updater is
  enabled) must be regenerated with the new hash and size, or updates fail the hash check.

### b) Azure Artifact Signing (formerly Trusted Signing)

- Microsoft's managed signing service, from about 9.99 US dollars a month, integrated in
  electron-builder through `win.azureSignOptions` (not through signtool). It needs a paid Azure
  subscription (free and trial subscriptions are refused) and an identity validation.
- Not available to the owner as things stand: Microsoft's quickstart lists public trust signing for
  organizations in the USA, Canada, the EU and the UK, and for individual developers only in the
  USA and Canada. Nigeria is not on that list. Private trust certificates have no geographic limit
  but are not trusted by SmartScreen for the public. Onboarding was reported paused for other
  countries during the preview. Not verified: whether this changed after 2026-10-30. Check the
  identity validation page in the Azure portal.
- The pipeline already supports it (mode `azure`), so it is a drop in if Microsoft opens it up, or
  if a company in a supported country publishes the app.

### c) A certificate from a certificate authority

- Since June 2023 the private key of a code signing certificate must be held in FIPS 140-2 level 2
  or better hardware: a USB token or a cloud HSM. So a plain `.pfx` file in a secret is normally
  not issued any more. Certificates are now one year, and a longer term is a prepaid bundle.
- Cloud signing add ons let CI sign without a token. Example from SSL.com (pricing page read
  2026-10-30): a base certificate price plus an add on by yearly signings, 180 US dollars for 2,000,
  300 for 5,000, 500 for 10,000. The base price was not shown. Reseller listings for an EV cloud
  certificate were around 525 US dollars a year. Treat all of this as a rough guide. Not verified:
  current prices, whether an individual in Nigeria passes identity checks (most CAs ask for a
  government photo ID, address proof and a phone call, and some refuse individuals for EV).
- A paid certificate gives the maintainer's own name as publisher. EV certificates no longer give
  instant SmartScreen reputation as they once did. Not verified for 2026.
- The pipeline supports a certificate that exports to a `.pfx` (mode `pfx`). A cloud HSM that only
  signs through a vendor tool needs a small custom `sign` script for electron-builder (a
  `signtoolOptions.sign` hook). That is not written, because it depends on the vendor chosen.

## Recommendation

1. Apply to the SignPath Foundation. It is free and works from any country. Cost: the publisher
   shown is "SignPath Foundation", and each release needs a manual approval click.
2. Use Azure Artifact Signing only if it opens to individuals in Nigeria, or through a legal entity
   in a supported country.
3. Buy a CA certificate with a cloud HSM only if SignPath is refused or the maintainer wants their
   own name as publisher.

## Steps for the owner, in order

1. Turn on multi factor authentication on the GitHub account and on SignPath.
2. Publish a "Code signing policy" page on the website or in the README (roles: you as author,
   reviewer and approver; the line "Free code signing provided by SignPath.io, certificate by
   SignPath Foundation"; a privacy statement that the app sends nothing). The landing page is
   edited by the owner, so this change adds no page.
3. Make a first unsigned release so the project exists "in the form to be signed". Apply at
   signpath.org (the open source application).
4. After approval, in SignPath create: a project, a signing policy for release builds with manual
   approval, and an artifact configuration that signs the `.exe` in a zip or single file. Connect
   the GitHub trusted build system and install the SignPath GitHub app on the repository.
5. Add the repository secrets below. Do not put values in the repo.
6. Set `WIN_PUBLISHER_NAME` to the exact certificate subject common name that SignPath gives (for
   example `SignPath Foundation`), so the updater can check it.
7. Tag a release and approve the request in SignPath when it arrives. Follow "First signed
   release" in `docs/releasing.md`.

## Secret names the workflow reads

All come from GitHub Actions secrets, only on a tag build in `oyedokunken/scrim`. The decision code
(`apps/desktop/build/signing.mts`) turns signing off on pull requests, forks and branch builds.

| Provider                                         | Secrets                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SignPath (mode `signpath`)                       | `SIGNPATH_API_TOKEN`, `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`                                                     |
| Certificate file (mode `pfx`)                    | `WIN_CSC_LINK` (base64 of the .pfx or a URL), `WIN_CSC_KEY_PASSWORD`, `WIN_PUBLISHER_NAME`                                                                    |
| Azure Artifact Signing (mode `azure`)            | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, `WIN_PUBLISHER_NAME` |
| Updater publisher check (optional with SignPath) | `WIN_PUBLISHER_NAME`                                                                                                                                          |

The first provider whose secrets are all present wins, in the order pfx, azure, signpath. A half
filled set is ignored and the build is unsigned.

## What the pipeline does

- `apps/desktop/build/signing.mts` decides the mode from the environment. It is pure and tested.
- `electron-builder.config.ts` spreads `windowsSigningConfig(process.env)` into `win`. For `pfx` and
  `azure` electron-builder signs the app exe, the bundled `ffmpeg.exe` (copied as an extra
  resource), the Windows builds of the native mouse hook (`uiohook-napi.node`, found by file name
  because the package also ships macOS and Linux builds that signtool cannot sign) and the
  installer, with SHA-256 only and an RFC 3161
  timestamp (`http://timestamp.digicert.com`, or Microsoft's server for Azure) so signatures stay
  valid after the certificate expires.
- `apps/desktop/build/signing-cli.mts` runs first in the Windows job. It prints a warning and writes
  the job summary when nothing will be signed. It never fails the build.
- The "Verify the signatures" step runs `build/verify-signature.mts` (Get-AuthenticodeSignature) on
  the installer and, for pfx and azure, the app and FFmpeg. It fails the release when signing was on
  and a file is unsigned, invalid, not timestamped or signed by another subject.
- The `publish` job writes `SHA256SUMS.txt` for every asset and checks it with `sha256sum --check`.

## Publisher name and automatic updates

The updater accepts an update only if the installer signature subject matches `publisherName`
(electron-builder writes it into `app-update.yml`, and `verifyUpdateCodeSignature` is on when a
publisher name is set). So:

- Changing the certificate, the provider or the publisher name breaks updates for installed
  copies, because the old app still expects the old subject.
- To move safely: make a bridge release signed with the OLD certificate whose
  `WIN_PUBLISHER_NAME` lists both names (electron-builder accepts several names), wait until most
  people have it, then switch to the new certificate. Tell people on the website that users on very
  old versions must download once by hand.
- Moving from unsigned to signed is safe: unsigned builds do not check anything.
- With SignPath the publisher is the foundation's name, and it stays the same across releases.

## macOS

Needs a Developer ID Application certificate and notarization (Apple Developer Program, 99 US
dollars a year). The `macos` job already reads `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, and the build notarizes only when all exist.
Nothing more is set up here. Without them the disk image is unsigned.

## Linux

No signing is needed now. Publish checksums (`SHA256SUMS.txt`). Signing the checksum file with a GPG
key would let people verify authorship, and can be added later.

## Checksum next to the Download button

The website could show the SHA-256 of the file beside the Download button. The release lookup in
`apps/landing/src/server` already fetches the latest release. It could also fetch the asset
`SHA256SUMS.txt`, pick the line for the matched file, and return it as `sha256` in the response of
`POST /api/downloads` for the dialog to show with the PowerShell and `shasum` commands. This change
does not touch the landing page.
