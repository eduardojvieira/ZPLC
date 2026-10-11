# Releasing ZPLC

This is the one checklist for a release: version bump, green CI, rehearsal, tag, draft, manual checks, publish,
and the channel updates that follow. A release is made by the pipeline (`.github/workflows/release.yml`); a person
bumps the version, tags, checks by hand on real machines, and publishes the draft. Nobody uploads an asset by hand.

## What never happens

- No paid service, certificate or credential is used. Adding one needs a decision of the owner (see
  [External services](#external-services-and-their-cost)).
- No release is created except as a **draft**, by the pipeline, from the run of its own tag.
- A rehearsal publishes nothing: no draft, no upload, no attestation.
- The installers are not signed with a paid identity and the macOS bundles are not notarized. The notes of every
  release say the signing state of each file; nothing in this repository claims more than a job of the run checked.
- AI and MCP never flash, deploy, force, RUN or STOP a device (`AGENTS.md`). Hardware records are made by a person.

## Checklist

### 1. Choose and bump the version

The root `package.json` is the only source of the product version (`VERSIONING.md`).

1. Pick the next version. Prereleases continue the `rc` sequence after `2.0.0-rc.3`: `2.0.0-rc.4`, `2.0.0-rc.5`, ...
   An `alpha`, `beta` or `preview` name sorts below `rc.3` under semantic versioning and the pipeline refuses it.
2. `bun scripts/release-version.ts 2.0.0-rc.4` writes the version to the root, compiler, HIL and Studio manifests
   and to the compiler version of the debug map. `bun run check:versions` must pass.
3. `CHANGELOG.md`: rename `## Unreleased` to `## 2.0.0-rc.4 - YYYY-MM-DD` and add an empty `## Unreleased` above it.
   The changelog holds only tagged versions: headings go from newest to oldest, and every heading older than the
   one being cut has its tag (`scripts/release/changelog.ts`; `scripts/release/changelog-untagged.json` lists the
   exceptions with their reasons, and it can only shrink). Read the section as the person who will install the
   release: its parts (What changed for you, Breaking changes, Migration, Known limits) are the first four parts
   of the notes, and Details for contributors is not (`scripts/release/release-notes.ts`, DOC-030).
4. `scripts/release/release-status.json`: add the entry of the version, with `completeness` (how complete this
   prerelease is: it becomes the title of the release) and `knownIssues`.
5. `scripts/release/channels.json`: set the state of each Windows channel to `live`, `submitted`, `refused` or
   `not yet submittable`. The notes print it as it is.
6. If the number of components of the bill of materials rose on purpose, `bun scripts/release/sbom.ts --update-floor`
   raises the recorded floor. It never lowers it; lowering it is a reviewed edit of `scripts/release/sbom-floor.json`.

### 2. Check locally and wait for green CI

1. `bun run release:rehearsal` runs the checks of the release workflow that need no runner: the versions, the
   changelog, the bill of materials, the tests of the release scripts and of the integrity bundle, the pins of the
   workflow actions, the repository hygiene and release-evidence validators, and the contract check.
2. Push the branch. CI (`.github/workflows/ci.yml`) must be green on the exact commit that will be tagged. The
   release workflow runs it again for the tagged SHA before it builds anything.

### 3. Rehearse

Actions, **Release Build**, **Run workflow**: choose the branch (any ref), the version, and leave **Rehearsal**
ticked. Every job runs, including the packaging, the signature and launch checks on each platform, the
installation of the `.deb` and `.rpm` in clean containers, the standalone CLI and MCP server, the bill of
materials and the notes. Nothing is published.

- Read the artifact `release-notes-rehearsal`: `notes.md`, `title.txt`, `run-results.json` and the merged
  `SHA256SUMS`. Every signing sentence must be backed by a check that the run executed.
- The bundles are the artifacts `release-bundle-<platform>-preview`.
- Record the run in [Recorded runs](#recorded-runs). One rehearsal and one tag release made entirely by the
  pipeline must be recorded before GA (REL-030).

### 4. Tag

Tag the commit that passed the rehearsal and push the tag:

```bash
git tag -a v2.0.0-rc.4 -m "ZPLC v2.0.0-rc.4"
git push origin v2.0.0-rc.4
```

The tag run builds each platform in jobs of its own. A failure on one platform does not stop the others; that
platform simply has no files in the draft and the notes say so.

### 5. Read the draft

The draft release has: the installers per platform, the standalone `zplc-cli` and `zplc-mcp` executables, the bill
of materials, `SHA256SUMS` (all assets), the per-platform checksum and evidence files, the notes and a title that
says how complete the prerelease is. Check that every asset the release should have is listed and that the
signing state of each is the one you expect.

### 6. Manual checks

These need a person at a real machine. Record the result in [Recorded runs](#recorded-runs).

- A DMG downloaded in a browser, opened on a Mac with Apple silicon (and an Intel Mac where one is available),
  following the first-run steps of the install page: Done, System Settings, Privacy and Security, Open Anyway.
- The Windows installer on Windows 11 with Smart App Control on and off: "More info", "Run anyway".
- For GA: the hardware records of gate 6 made on the draft's own firmware images (HIL-009).

### 7. Publish

Publish the draft in the GitHub interface. This is the only step that makes the release public.

### 8. Channels that follow a published release

None of these is automated yet; each needs an account of the owner (see the table below).

| Channel | What to do | State |
| --- | --- | --- |
| Homebrew tap | Update the cask with the new version and the SHA-256 of the `.zip` of each architecture (from `SHA256SUMS`) | not set up |
| Arch User Repository | Update `pkgver` and the checksums of the binary package | not set up |
| Microsoft Store | Build the MSIX, submit it, wait for certification | not submittable yet |
| winget | Submit the manifest that points at the signed installer, once SignPath signing is live | not submittable yet |

## The scripts a release uses

| Script | Does | Tested by |
| --- | --- | --- |
| `scripts/release-version.ts` | writes and checks the one product version | `scripts/release-version.test.ts` |
| `scripts/release/resolve-release.ts` | says whether a run publishes; refuses a prerelease that is not `rc.<n>` | `scripts/release/resolve-release.test.ts` |
| `scripts/release/changelog.ts` | the changelog holds only tagged versions | `scripts/release/release-records.test.ts` |
| `scripts/release/sbom.ts` | CycloneDX bill of materials from `bun.lock`, the manifests and `west.yml`; fails below the lockfile and the floor | `scripts/release/sbom.test.ts` |
| `scripts/release/licenses.ts` | third-party notices of the packages and fonts that ship, written while packaging | `scripts/release/licenses.test.ts`, `packages/zplc-ide/scripts/packaged-content.test.ts` |
| `scripts/release/binaries.ts` | standalone CLI and MCP server for each platform and architecture | `scripts/release/binaries.test.ts` |
| `packages/zplc-ide/scripts/packaged-content.ts` | the unpacked application holds the examples, the lessons and the notices | `packages/zplc-ide/scripts/packaged-content.test.ts` |
| `scripts/release-artifacts.mjs` | copies the assets of a platform, writes `SHA256SUMS` and the evidence file; merges checksum files | `scripts/release-artifacts.test.mjs` |
| `scripts/release/run-results.ts`, `scripts/release/release-notes.ts` | the title and the notes of the release, from what the run did | `scripts/release/run-results.test.ts`, `scripts/release/release-notes.test.ts` |

## Verifying a download

The notes and the install page give the commands. For a file in the current folder:

```text
Linux:    sha256sum --ignore-missing -c SHA256SUMS
macOS:    shasum -a 256 -c SHA256SUMS
Windows:  Get-FileHash .\<file> -Algorithm SHA256
All:      gh attestation verify <file> --repo eduardojvieira/ZPLC
```

An attestation proves where a file was built, not that it is safe, and it does not change the warnings of an
operating system.

## External services and their cost

Every service below costs nothing. A service that costs money, or needs an account that is not free, is not added
without a decision of the owner (S-2 of the spec: zero recurring cost).

| Service | Used for | Where | Cost | Account |
| --- | --- | --- | --- | --- |
| GitHub repository, Releases | source, drafts and published releases | the repository | none for a public repository | the owner's GitHub account |
| GitHub Actions hosted runners | CI and the release pipeline, on Linux, macOS and Windows, x64 and arm64 | `.github/workflows/*.yml` | none for a public repository | the same |
| GitHub artifact attestations (Sigstore public-good instance) | build provenance of each published asset | `actions/attest` in `release.yml` | none | the same |
| GitHub Pages | the documentation site | `.github/workflows/deploy-docs.yml` | none for a public repository | the same |
| GitHub release downloads | Electron binaries (electron-builder), the Zephyr SDK and west projects, the Bun runtime | the build and setup steps | none | none |
| npm registry | the packages that `bun install --frozen-lockfile` fetches | every job that installs | none | none |
| Python Package Index | `west` and the Zephyr Python packages in the firmware jobs | `ci.yml` | none | none |
| Docker Hub (anonymous pulls) | the `debian:13`, `ubuntu:24.04` and `fedora:latest` images in which the `.deb` and `.rpm` are installed | `release.yml` | none | none |
| Ubuntu package archive | `rpm`, `xvfb` and `gcc-multilib` on the runners | `apt-get` steps | none | none |
| Homebrew tap (a GitHub repository) | the cask for macOS | not set up | none | the owner's GitHub account |
| Arch User Repository | the binary package | not set up | none | an AUR account of the owner |
| Microsoft Store (Partner Center) | the MSIX channel on Windows | not submittable yet | none recurring; the owner checks that registration is still free when applying, and stops if it asks for payment | a Partner Center account of the owner |
| SignPath Foundation | signing of the NSIS and portable installers for open-source projects | not submittable yet | none; it is an application that may be refused | an application of the owner |
| winget community repository (a GitHub repository) | the winget manifest | not submittable yet | none | the owner's GitHub account |

## Recorded runs

REL-030 asks for one rehearsal and one tag release produced entirely by the pipeline before GA, and the manual
checks of step 6. Fill these in when they happen; an empty row is a check that has not been made.

| What | Version | Run or date | Who | Result |
| --- | --- | --- | --- | --- |
| Rehearsal (all jobs, nothing published) | not yet recorded | | | |
| Tag release (draft made by the pipeline) | not yet recorded | | | |
| First run of the DMG on a Mac with Apple silicon | not yet recorded | | | |
| First run of the DMG on an Intel Mac | not yet recorded | | | |
| Windows 11 installer, Smart App Control on | not yet recorded | | | |
| Windows 11 installer, Smart App Control off | not yet recorded | | | |
