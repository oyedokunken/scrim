# 0008. Windows code signing

Status: proposed

Verified on 2026-11-03 from the vendors' own pages. Where a page did not say, this record says
"not verified" instead of guessing. Rules, prices and eligibility change, so check the pages again
before applying or paying.

## Context

An unsigned Windows installer shows Microsoft Defender SmartScreen's "Windows protected your PC,
unknown publisher" screen, and the in-app updater has no publisher to check a downloaded update
against. Scrim is open source (MIT), has one maintainer, builds in GitHub Actions, and the
maintainer lives in Nigeria. The goal is that every Windows release is signed in CI, and that the
release workflow refuses to publish an unsigned installer once signing is required.

## What was verified

### SignPath Foundation (free code signing for open source)

Source: signpath.org/terms and docs.signpath.io/trusted-build-systems/github, read 2026-11-03.

- The certificate is issued to "SignPath Foundation". That name is the publisher Windows shows, not
  the maintainer's. Free subscriptions are provided through SignPath.io.
- Conditions for a project:
  - an OSI approved licence with no commercial dual licensing for any component (Scrim is MIT);
  - no malware or potentially unwanted programs, and no proprietary component;
  - the project is actively maintained and already released in the form to be signed;
  - its functionality is described on its download page;
  - binaries are a valid, automated build from the source in the repository (build scripts and CI
    configuration count as source), and only the team's own binaries are signed;
  - every release is approved manually before it is signed;
  - all team members use multi factor authentication for SignPath and for the repository host;
  - the team defines Authors, Reviewers and Approvers, and each signing request is approved by a
    team member the whole team trusts; changes from non committers are reviewed;
  - a "Code signing policy" is stated on the project's home page, using that term, naming the roles
    and including a privacy statement;
  - all signed binaries carry enforced metadata, including product name and version;
  - software must not change the user's system without warning, must offer uninstallation if it
    installs, and software that sends data to unspecified systems needs a privacy policy and an
    off switch.
- GitHub Actions integration: the official action `signpath/github-action-submit-signing-request`
  (v3). The workflow uploads the unsigned artifact with `actions/upload-artifact` v4 or later, then
  the action is given `organization-id`, `project-slug`, `signing-policy-slug`, the optional
  `artifact-configuration-slug`, `github-artifact-id` (the upload step's output), an API token and
  `wait-for-completion`, and `output-artifact-directory` for the signed result. SignPath needs the
  predefined GitHub.com trusted build system added to the organization and linked to the project,
  and an API token of a user with submitter permission stored as a repository secret. By default the
  upload is a zip, so the artifact configuration root must be `<zip-file>`.
- Not verified: the application form's fields and the review time (the pages that describe them did
  not show them), whether a public repository is a hard rule (Scrim is public anyway), and any
  signing quotas. The owner reads the form at signpath.org/apply before filling it in.

### Azure Artifact Signing (formerly Trusted Signing)

Source: Microsoft Learn quickstart and Q&A threads, read 2026-11-03.

- Microsoft's quickstart states that individual developers must be located in the United States or
  Canada, and that these geographic limits do not apply to Private Trust certificates, which are not
  trusted by SmartScreen for the public. Public Trust certificates are offered to organizations in the
  United States, Canada, the European Union and the United Kingdom.
- Q&A answers report that tenants outside those regions, including individuals in other countries,
  cannot start a new identity validation request, and give no timeline for other countries.
- Nigeria is not on the list. So this option is closed to the owner as an individual.
- Not verified: whether this changed after the date above. The Azure portal's identity validation
  page is the authority.

### A certificate from a commercial authority

- A standard OV code signing certificate typically costs about 150 to 300 US dollars a year. Since
  June 2023 its private key must live in certified hardware (a USB token or a cloud HSM), so a plain
  `.pfx` file in a CI secret is not normally issued.
- The authority validates the identity of an individual or an organization. Requirements for an
  individual in Nigeria were not verified.

### SmartScreen reputation

Source: Microsoft Learn (smartscreen reputation, code signing options), read 2026-11-03.

- A signature replaces "Unknown publisher" with a named publisher, but it does not switch the warning
  off. Microsoft says EV certificates no longer give instant reputation, and that paying extra for EV
  only to avoid SmartScreen is no longer justified: OV and EV build reputation the same way.
- Reputation grows with downloads and no one can buy or clear it. Reports differ on whether it is
  tied to the file or the publisher identity. Plan for the warning to remain on early releases even
  when signed. A signed build is still better: the publisher is named, the updater can check it, and
  security tools trust it more.

## Decision

Use SignPath Foundation, because it is the only option that is free, open to an individual in Nigeria
and designed for open source projects in GitHub Actions. Azure Artifact Signing is closed to the owner
today, and a commercial certificate costs money every year and still builds reputation slowly. If
Microsoft opens Azure to Nigeria, or a company in a supported country publishes Scrim, the pipeline
already supports a second provider.

Consequences the owner must accept:

- Windows shows "SignPath Foundation" as the publisher, not the owner's name.
- The project must publish a Code signing policy on its home page (README and website) naming the
  Author, Reviewer and Approver roles, and a privacy statement.
- Every release is approved by hand in SignPath before it is signed, and the owner must use multi
  factor authentication on SignPath and GitHub.
- The installer needs product name and version metadata, which electron-builder already writes.
- SmartScreen can still warn on early signed releases, so the website's help keeps a short line for
  that.

## How the pipeline uses it

- The release workflow builds the unsigned installer on a Windows runner, uploads it, submits it to
  SignPath with the official action, downloads the signed result, verifies the signature with
  `Get-AuthenticodeSignature`, and only then attaches it to the release.
- `latest.yml` and the blockmap are produced from the signed installer, because signing changes the
  file's hash and the updater rejects a mismatch.
- The repository variable `REQUIRE_WINDOWS_SIGNING` is `false` until the application is approved. When
  it is `true`, a missing or failed signing step fails the workflow, so an unsigned installer cannot be
  published.
- The updater checks the publisher of a downloaded update once a stable publisher name is set. An
  installed unsigned version has no check, so it accepts the first signed update. An installed signed
  version refuses an unsigned one.

## Status

The application has not been made. It is the owner's to submit; the steps are in the owner's release
checklist and in `docs/code-signing.md`. Until it is approved, releases stay unsigned and the website
keeps the full SmartScreen walkthrough.
