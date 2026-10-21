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
2. `bun scripts/release-version.ts 2.0.0-rc.4` writes the version to the root, compiler, HIL and ZPLC application manifests
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
2. Electron (IDE-028): open <https://releases.electronjs.org/schedule> and the `electron` dist-tags on npm, update
   `tools/ci/electron-support.json` (the supported majors, their end of support and the latest patch of each), and
   run `bun tools/ci/electron-support.ts --release`. It fails while the dependency of the ZPLC application is outside the supported
   majors or is not the latest patch of its line; change `packages/zplc-ide/package.json` and the lockfile, rebuild,
   and run the checks again. The check of the major line alone runs in every pull request.
3. Push the branch. CI (`.github/workflows/ci.yml`) must be green on the exact commit that will be tagged. The
   release workflow runs it again for the tagged SHA before it builds anything. The macOS and Windows unit tests
   and journeys run nightly (`.github/workflows/nightly-quality.yml`): read the last run of that workflow for the
   commit before tagging.

### 3. Rehearse

Actions, **Release Build**, **Run workflow**: choose the branch (any ref), the version, and leave **Rehearsal**
ticked. Every job runs, including the packaging, the signature and launch checks on each platform, the
installation of the `.deb` and `.rpm` and the launch of the AppImage in clean containers, the mount of the DMG,
the unpacking of the ZIP, the silent install of the Windows setup and the launch of the portable executable
(each on its own system), the firmware build of every board, the standalone CLI and MCP server, the bill of
materials and the notes. Nothing is published.

The Linux payload reproducibility check runs too and never blocks the run (REL-032): it is `continue-on-error`
and nothing waits for it. Read its job in the run before tagging; a failure there is a lead, not a stop.

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

The draft release has: the installers per platform, all named `zplc-<version>-<os>-<arch>.<ext>` (the Windows ones add `-setup-unsigned` or `-portable-unsigned`), the standalone `zplc-cli` and `zplc-mcp` executables, the
firmware images of every board (`zplc-runtime-<version>-<board>.<ext>`) with their manifest
`zplc-runtime-<version>.manifest.json`, the bill of materials, `SHA256SUMS` (all assets), the per-platform checksum
and evidence files, the notes and a title that says how complete the prerelease is. Check that every asset the
release should have is listed and that the signing state of each is the one you expect. A draft with no
firmware images is a draft whose firmware job failed: the images are all of the boards or none, so do not publish
it as a release that has them; the notes name the job. Each firmware image is labelled with the evidence level of
its board in the notes, and no board has a level above `cross-build` until a person records a hardware run.

### 6. Manual checks

These need a person at a real machine. Record the result in [Recorded runs](#recorded-runs).

- A DMG downloaded in a browser, opened on a Mac with Apple silicon (and an Intel Mac where one is available),
  following the first-run steps of the install page: Done, System Settings, Privacy and Security, Open Anyway.
- The Windows installer on Windows 11 with Smart App Control on and off: "More info", "Run anyway".
- For GA: the hardware records of gate 6 made on the draft's own firmware images (HIL-009).

By decision of the owner (2026-10-20, REL-016: "se puede simular en esta pc de linux"), these first-run checks are
simulated on a Linux machine, and the hardware records of gate 6 were closed on 2026-10-20 by emulation and software
review (`tools/hil/software-review/verdicts.json`). The simulation is not a real Mac or a real Windows machine and
never claims to be one:

```bash
# the installers of the draft's commit, built with electron-builder into a folder outside the tree, then:
DISPLAY=:<private display> bun tools/ci/release/simulate-first-run.ts --dist <folder with the installers>
```

It installs the Windows setup silently into a fresh Wine prefix and launches the installed application and the
portable file, launches the AppImage and the layout of the `.deb`, reads the `.deb`, the `.rpm` and the macOS zip as
files, and in each launched application checks the window title and the version, opens the first Learn lesson, builds
it and runs it in the native simulation. It writes a JSON record with the result of every step, and says which steps
it could not make: a clean container install (no Docker access), the Mach-O format of the macOS runtime, the launch
and the ad hoc seal of a macOS bundle, the DMG, the native folder dialog, and SmartScreen and Smart App Control. A real
Mac and a real Windows machine are still recommended for the GA release, and their rows below stay empty until a
person fills them. What the simulation cannot prove (that the pipeline alone makes the draft, from the run of its own
tag, and that nobody uploads an asset) is proven by a hosted run: REL-030.

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
| `scripts/release/firmware-images.ts` | collects one `west build` per board (refusing another board, version or commit, a dirty tree or the HIL trace), assembles every board into one set with its manifest, stages the learner-board images for the installers; `build` runs it on a machine with the Zephyr SDK | `scripts/release/firmware-images.test.ts`, `packages/zplc-ide/scripts/packaged-content.test.ts` |
| `scripts/release/udev-rules.ts` | the udev rule that the `.deb` and `.rpm` install, from `tools/hil/usb-ids.json` | `scripts/release/udev-rules.test.ts` |
| `packages/zplc-ide/scripts/packaged-content.ts` | the unpacked application holds the examples, the lessons and the notices | `packages/zplc-ide/scripts/packaged-content.test.ts` |
| `scripts/release-artifacts.mjs` | copies the assets of a platform, writes `SHA256SUMS` and the evidence file; merges checksum files | `scripts/release-artifacts.test.mjs` |
| `scripts/release/verify-bundle.ts` | reads the bundle of a platform as the files produced: every checksum, the evidence file for this run and the bill of materials; a step of each evidence job | `scripts/release/verify-bundle.test.ts` |
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
| Simulated first run of the installers, on Linux (REL-016) | 2.0.0-rc.3, installers built from the tree of commit `7f5d0f3c` | 2026-10-21 | recorded by script | 38 of 46 steps pass, 0 fail, 8 are not simulated. Simulated on Linux by owner decision 2026-10-20, not a real Mac or Windows machine. Linux: `.deb` and `.rpm` read as files, `.deb` layout and AppImage launched. Windows: setup installed silently, then installed and portable application launched, under Wine 11.20 in a fresh prefix, and uninstalled. In every launched application: title ZPLC, version 2.0.0-rc.3, first Learn lesson opened, built and run in the native simulation. macOS: the zip read as files only, never launched. Not simulated: a clean container install, the Mach-O format of the macOS runtime, the launch and ad hoc seal of a macOS bundle, the DMG, the native folder dialog, SmartScreen and Smart App Control. Script `tools/ci/release/simulate-first-run.ts`; record `tools/ci/release/first-run-records/2026-10-21.json`, which names the commit it ran at |
| Screen reader check of the main path and one Learn lesson (UX-028, LRN-037) | current build | 2026-10-20 | recorded by script | 18 of 18 steps pass (9 steps, English and Spanish). Linux, Chromium accessibility tree, recorded 2026-10-20; owner decision 2026-10-20 accepts this in place of NVDA/JAWS on Windows and VoiceOver on macOS. Not a run of a screen reader product; the deploy dialog was opened without a board. See [Screen reader check](docs/docs/development/screen-reader-check.md) and `docs/static/img/screen-reader-check/2026-10-20/results.json` |
