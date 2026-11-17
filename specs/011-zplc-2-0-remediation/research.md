# Research: ZPLC 2.0 Remediation

**Feature**: 011-zplc-2-0-remediation  
**Date**: 2026-10-08  
**Status**: Decisions proposed for owner review; open questions listed in section 12  
**Companion**: `spec.md` in this directory

This file records the decisions behind `spec.md`: what was chosen, why, what was rejected, and on what evidence. It follows the layout of `specs/009-native-runtime-sim/research.md`.

## How to read the evidence marks

Web facts carry the verification level given by the research that collected them on 2026-10-08:

- **[P]** primary source (vendor documentation, vendor source code, vendor announcement)
- **[S]** secondary source (independent testing, third-party reports)
- **[I]** inference from verified facts
- **[N]** not verified

Code facts are cited as `path:line` at commit `b379d82`, with the same prefixes as the spec: `IDE/` is `packages/zplc-ide/`, `COMPILER/` is `packages/zplc-compiler/src/`, `CORE/` is `firmware/lib/zplc_core/`, `APP/` is `firmware/app/`. If decision D-05 rewrites history, that commit gets a new SHA; the mirror made before the rewrite keeps `b379d82` resolvable and the citations stay valid, because the removed files are not in the baseline tree. The research pages were read through a fetch tool that summarises, so quotations are as that tool returned them.

## Contents

1. Zero-cost distribution: macOS
2. Zero-cost distribution: Windows
3. Zero-cost distribution: Linux
4. Integrity, firmware images, flashing and updates
5. Headless primitive library for the component kit, and the dependency justification
6. Staying on Electron
7. Rewriting the compiler's semantic middle
8. One scheduler core, the safe state and the control link
9. Learning-mode design
10. What "nothing descoped" changes
11. Departures from the baseline direction, and contradictions in the evidence
12. Open questions

---

## 1. Zero-cost distribution: macOS

### Decision

Ship an ad-hoc signed and sealed application bundle for each architecture. Offer it through a personal Homebrew tap as the primary channel and as a DMG and ZIP on GitHub Releases as the second. Do not notarize. Remove every Apple credential from the pipeline. (Spec: REL-001 to REL-006; owner decision D-01 for quarantine handling.)

The electron-builder settings are:

| Setting | Value | Why |
|---|---|---|
| `mac.identity` | `"-"` | Explicit ad-hoc signing; do not rely on a fallback |
| `mac.binaries` | `Contents/Resources/native-runtime/zplc_runtime` | The bundled native runtime is signed with the bundle |
| `mac.hardenedRuntime` | `true` | Keeps the hardened-runtime protections [I]; needs the two entitlements below |
| Entitlements | `com.apple.security.cs.allow-jit`, `com.apple.security.cs.disable-library-validation` | The first is what a current Electron application needs; the second because, under hardened runtime, library validation rejects pre-signed Electron frameworks that carry a different team identity [P] |
| `mac.notarize` | `false` | No Developer ID exists |
| `mac.gatekeeperAssess` | `false` | Already set |
| `dmg.sign` | `false` | A signed disk image matters only for notarization |
| Targets | `dmg`, `zip` | The ZIP feeds Homebrew |

If the hardened-runtime variant fails the launch test on either architecture, the fallback is `mac.hardenedRuntime: false`, which the current preview path already passes on the command line (`IDE/scripts/package-mac-release.mjs:161`). If `identity: "-"` does not sign on the pinned electron-builder version, the fallback is an `afterPack` hook that runs `codesign --force --deep --sign -`.

### Rationale

- A Developer ID certificate and notarization need the paid Apple Developer Program, and the fee waiver excludes individuals [P]. Owner decision S-2 rules that out.
- Apple-silicon Macs refuse to run unsigned code, and an ad-hoc signature is sufficient for the system to run it [P]. Today's preview path disables signing (`IDE/scripts/package-mac-release.mjs:153-161`), leaving only the linker signature, which seals no resources; third-party projects on electron-builder 26 report exactly this as "damaged, move to Trash" [S]. That is the current failure.
- A properly ad-hoc signed bundle can be approved by the user through System Settings, Privacy and Security, Open Anyway [P]. A broken or missing signature cannot [S].
- An ad-hoc signed application that is not quarantined launches with no dialog on macOS 26.6.1 [S]. Homebrew quarantines every cask download with no opt-out [P], so a cask either removes the flag itself in `postflight` (option A) or the user follows the Open Anyway steps (option B).
- The existing `afterPack` hook only clears extended attributes (`IDE/scripts/after-pack.mjs`, read while writing this file), so it does not already provide the signing fallback.
- Sources conflict on whether electron-builder 26 falls back to ad-hoc signing by itself, so the setting is explicit and CI asserts `Signature=adhoc`.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Apple Developer Program, Developer ID, notarization (the release review's recommendation) | 99 USD per year; excluded by S-2. It remains the only route to the normal "downloaded from the Internet" dialog [P]. |
| Unsigned bundle (today) | Does not open on Apple silicon [S]. |
| `curl \| sh` installer as the main channel | Avoids quarantine [S] but is the delivery pattern of ClickFix malware; macOS 26.4 and later may warn "Possible malware, Paste blocked" when the command is pasted [S]. Allowed only as a documented alternative that verifies the SHA-256 (REL-006). |
| Asking users to run `xattr -dr com.apple.quarantine` | Works [S]; asks the user to perform a security bypass by hand. |
| Homebrew formula instead of a cask | Formula downloads are not quarantined [P by source summary], but the application would live in the Cellar and the approach is not idiomatic for a graphical application. |
| A sponsor or fiscal host that notarizes on the project's behalf | Possible in principle [S]; not investigated; would make releases depend on a third party. |
| Web build as the only macOS channel | Loses the native runtime; see decision D-07. |

### What must be said to users

Every prompt-free route works by avoiding the quarantine flag, so Gatekeeper's first-run check does not run. Apple's guidance is that overriding these settings "is the most common way that a Mac gets infected with malware" [P]. Homebrew removed its own flag because it "intentionally bypasses macOS security mechanisms" [P]. Option A is permitted in a personal tap today [P] and is against the spirit of that decision. The install page states this, gives the pinned SHA-256 and the attestation command, and leaves the choice to the user.

### Sources

- Apple membership comparison [P]: https://developer.apple.com/support/compare-memberships/
- Developer ID requires a paid account holder [P]: https://developer.apple.com/developer-id/
- Fee waivers exclude individuals [P]: https://developer.apple.com/help/account/membership/fee-waivers/
- Ad-hoc signature sufficient on Apple silicon [P]: https://developer.apple.com/documentation/macos-release-notes/macos-big-sur-11_0_1-universal-apps-release-notes and https://developer.apple.com/forums/thread/767774
- Open Anyway flow, current for macOS 27 [P]: https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac and https://developer.apple.com/news/?id=saqachfa
- Behaviour of ad-hoc, unsigned and quarantined applications on macOS 26.6.1 [S]: https://eclecticlight.co/2026/08/11/how-can-you-run-code-that-hasnt-been-notarised/
- electron-builder 26 macOS options [P]: https://www.electron.build/v26/docs/mac ; no automatic ad-hoc fallback [P]: https://www.electron.build/v26/docs/features/code-signing/code-signing-mac ; contrary third-party reports [S]: https://github.com/electron-userland/electron-builder/issues/9529
- "Damaged" reports for unsealed arm64 bundles [S]: https://github.com/zachduda/Empanadas.io-App/pull/44 , https://github.com/vsitzmann/deckwerk/pull/25
- Homebrew quarantine code [P]: https://github.com/Homebrew/brew/blob/main/Library/Homebrew/cask/download.rb ; tap trust [P]: https://docs.brew.sh/Tap-Trust ; removal of `--no-quarantine` [P]: https://brew.sh/2025/11/12/homebrew-5.0.0/ , https://github.com/Homebrew/brew/issues/20755 ; third-party taps not checked for signing [P]: https://github.com/orgs/Homebrew/discussions/6482
- Quarantine by download path [S]: https://eclecticlight.co/2025/12/08/who-decides-to-quarantine-files/ ; Terminal paste warning [S]: https://www.bleepingcomputer.com/news/security/apple-adds-macos-terminal-warning-to-block-clickfix-attacks/

Not verified [N]: behaviour of a non-quarantined ad-hoc application on macOS 27; whether Homebrew's upgrade approval ever applies to an ad-hoc signed application; the exact dialog rc.3 shows today.

---

## 2. Zero-cost distribution: Windows

### Decision

The owner decided this on 2026-10-08 (owner decision S-5, binding). Windows uses both free channels, in this order:

1. The Microsoft Store: an MSIX package built with the electron-builder `appx` target and re-signed by Microsoft (REL-007), called supported only after Web Serial and the native simulator child process are proven inside the package (REL-008).
2. SignPath Foundation signing for the NSIS and portable installers on GitHub Releases (REL-009).
3. A winget manifest that points at the signed installer (REL-010).

The unsigned NSIS installer, with the "More info, Run anyway" steps documented, remains only as the fallback until each channel is live (REL-038). Each platform publishes independently (REL-015).

No outside approval can delay 2.0.0 GA. This is a design default chosen when the spec was written, not part of S-5 (which fixes only the channels and their order), and the owner may revise it. What the project owes is the package, its test and its submission (REL-007, REL-009). The fallback of REL-038 applies to prereleases and to GA alike: a pending, refused or failed listing or application never delays GA, the release notes state each channel's state (live, submitted, refused or not yet submittable), and a refusal returns the channel question to the owner.

### Rationale

- Store registration is free for individual accounts, Microsoft signs the package, and Store applications are "never subject to SmartScreen download warnings" [P]. electron-builder's `appx` target needs no certificate and supports arm64 [P].
- SignPath Foundation signs qualifying open-source projects at no charge under its own name; MIT qualifies as an OSI licence [P for the terms, I for the fit].
- An unsigned installer gets "Windows protected your PC" with a "Run anyway" path [P], and is blocked with no per-application bypass on machines where Smart App Control is on [P]. Reputation restarts at zero with every unsigned version [P].
- Buying a certificate would not remove first-download warnings either: extended-validation certificates lost instant reputation in 2024 [P].
- The current workflow expects an exportable certificate file (`.github/workflows/release.yml:347-357`), which public authorities stopped issuing in June 2023, and publishing needs all three platforms (`release.yml:525`, `:605`). That coupling is why rc.3 was uploaded by hand.
- The order follows from the evidence: the Store is the only free channel with no download warning [P]; a signed installer serves workstations that cannot use the Store [I]; winget is placed after signing because installs of unsigned installers through it are reported to fail [S].
- Inside the Store package two things are untested: enumerating serial ports through Web Serial, and starting `zplc_runtime.exe` as a child process [N]. REL-008 therefore gates the word "supported", not the submission.

### Alternatives considered

| Alternative | Why rejected or deferred |
|---|---|
| Microsoft Store only | Leaves machines without Store access, and a failure of REL-008 would leave no signed channel. |
| SignPath Foundation only | Depends on one acceptance decision; the publisher shown is "SignPath Foundation", and SmartScreen reputation still has to build [P]. |
| Azure Artifact Signing | About 9.99 USD per month; individuals only in the USA and Canada [P]. Excluded by S-2. |
| Certum open-source certificate | A yearly fee (secondary sources). Excluded by S-2. |
| winget with an unsigned installer | Open 2026 reports of installs stopping at the Mark-of-the-Web step [S]; S-5 places winget after signing. |
| Scoop bucket, Chocolatey | Possible and free; small audiences; not needed for GA. |
| Unsigned installer as the permanent channel | Blocked under Smart App Control; kept only as the fallback of S-5. |

### Sources

- Free Store registration for individuals [P]: https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account
- Store signing and SmartScreen [P]: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options , https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- electron-builder `appx` target [P]: https://www.electron.build/v26/docs/appx
- SignPath Foundation terms and GitHub integration [P]: https://signpath.org/terms , https://docs.signpath.io/trusted-build-systems/github
- Smart App Control [P]: https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003
- Key storage rule for code-signing certificates: https://www.electronjs.org/docs/latest/tutorial/code-signing
- winget policies and open reports: https://learn.microsoft.com/en-us/windows/package-manager/package/repository [P], https://github.com/microsoft/winget-pkgs/issues/385483 [S]

Not verified [N]: Web Serial, the native runtime child process and project file access inside an MSIX package (REL-008 exists to test this); whether SignPath accepts a single-maintainer project and how long it takes; whether the Store's individual account wording ("not in relation to their business") fits ZPLC.

---

## 3. Zero-cost distribution: Linux

### Decision

Keep the `.deb`, `.rpm` and AppImage on GitHub Releases, fix the `.deb` by removing its custom dependency list, add an AUR binary package, and ship a udev rule for serial access in the `.deb` and `.rpm` (REL-011 to REL-014).

### Rationale

- The custom `depends` list (`IDE/electron-builder.yml:114-120`) names `gconf2`, `gconf-service` and `libappindicator1`, which exist only in old Debian and Ubuntu releases (package indexes checked 2026-10-08); the electron-builder defaults do not need them.
- AppImages need FUSE 2, which Ubuntu no longer installs by default, and Ubuntu 24.04 restricts the user namespaces Chromium's sandbox uses [S]. The `.deb` avoids both, so the docs recommend it first.
- Serial access on Linux otherwise needs group membership (`dialout`, or `uucp` on Arch) and a new login [S]; a `uaccess` udev rule removes that step.

### Alternatives considered

| Alternative | Why rejected or deferred |
|---|---|
| Flathub | Requires building entirely from source with no network during the build [P]; serial needs the broad `--device=all` permission [P]. A large, continuing packaging job. |
| An apt and rpm repository on GitHub Pages | Pages sites are limited to 1 GB and about 100 GB of traffic per month [P]; four packages of about 100 MB leave room for one version only. Worth it when users ask for `apt upgrade`. |

### Sources

- Debian and Ubuntu package indexes: https://packages.debian.org/search?keywords=gconf2 , https://packages.ubuntu.com/search?keywords=libappindicator1
- AppImage on Ubuntu [S]: https://itsfoss.com/cant-run-appimage-ubuntu/
- Serial group access [S]: https://support.arduino.cc/hc/en-us/articles/360016495679-Fix-port-access-on-Linux
- Flathub requirements [P]: https://docs.flathub.org/docs/for-app-authors/requirements ; Flatpak device permissions [P]: https://docs.flatpak.org/en/latest/sandbox-permissions.html
- GitHub Pages limits [P]: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

Not verified [N]: the exact udev rule ordering (to be confirmed against the systemd documentation before shipping); AUR packaging rules.

---

## 4. Integrity, firmware images, flashing and updates

### Decision

- Keep `SHA256SUMS` and GitHub build provenance attestations, extend them to firmware images and CLI binaries, and document one verification command (REL-017).
- Attach prebuilt firmware for every board to each release (REL-022), and provide a browser flashing page for the ESP32-S3 and a UF2 download for the Raspberry Pi Pico (REL-024).
- Replace automatic update with an in-application notice that links to the release (REL-021).

### Rationale

- Attestations give "unfalsifiable provenance and integrity guarantees" and "are not a guarantee that an artifact is secure" [P]. They do not change Gatekeeper, SmartScreen or Smart App Control behaviour [I], and the docs must say so.
- CI already cross-builds all six boards and discards the results (`.github/workflows/ci.yml:281`). Publishing them removes the Zephyr toolchain from a newcomer's first hour.
- Web Serial is available in Chrome and Edge on all desktop systems [P], so an ESP32-S3 can be flashed from a docs page by a person's click, which satisfies `AGENTS.md` rule 7. The Pico needs only a file copy in boot mode.
- macOS automatic update requires a signed application, and an ad-hoc signature has no stable identity; Homebrew, the Store and the AUR update their own packages. A notice is about thirty lines, works for every format, and has no signing requirement.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| `electron-updater` now | Needs a signed macOS application; would work only for some formats; adds a dependency for a partial result. Revisit if a signing sponsor appears. |
| Flashing from inside Studio | Flash is a physical operation that Studio and AI tools must not start; a separate page with a human click keeps the boundary clear. |
| Documentation only (no prebuilt firmware) | Keeps the largest adoption barrier after the installer. |

### Sources

- Attestations [P]: https://docs.github.com/en/actions/concepts/security/artifact-attestations ; verification command [P]: https://cli.github.com/manual/gh_attestation_verify
- Web Serial availability [P]: https://developer.chrome.com/docs/capabilities/serial ; browser support data [P]: https://github.com/mdn/browser-compat-data/blob/main/api/Serial.json

Not verified [N]: the merged-binary layout and flasher manifest the ESP32-S3 build must produce; this is the first task of REL-024.

---

## 5. Headless primitive library for the component kit, and the dependency justification

### Decision

Build the owned kit in `IDE/src/ui/` on **React Aria Components**, styled with Tailwind 4 tokens (UX-001 to UX-004). Before committing, run a one-week spike that builds the tree, the data grid, menu and context menu, dialog and combo box in the gallery, measures the bundle, and runs them under the chosen test environment. If the spike fails, the fallback is Base UI plus a tree library and a table library.

### Rationale

- The application has one shared primitive today (`IDE/src/components/Modal.tsx`) against 134 buttons, 121 inputs and 18 selects styled one at a time, five ways of building an overlay and three focus systems. The missing layer is the cause of the inconsistent interface, so a library is needed, not more hand-written components.
- The two widgets that define an IDE are a tree with drag and drop (the project navigator) and a virtualised table (Watch, I/O map, variables, tasks). React Aria Components ships both; the other headless options do not.
- `IDE/PRODUCT.md:81` commits the product to keyboard operation and WCAG AA. This library has the strongest keyboard and screen-reader behaviour of the candidates.
- It includes a locale-aware number field, combo box and autocomplete (symbol picker, command palette), and built-in internationalisation, which fits the English and Spanish requirement.

### Candidates compared

| Candidate | Strength | Weakness for this product |
|---|---|---|
| **React Aria Components** (1.22.0) | Tree, virtualised table and grid list, number field, combo box, i18n, strongest accessibility | Verbose API; styling through render props and data attributes; no first-class context menu or menu bar found; toast maturity to confirm |
| Base UI (1.8.0) with shadcn-style recipes | Fastest to stand up; context menu, menu bar, combo box, toast, number field | No tree and no data grid: two more libraries and their accessibility to own, on the two most important widgets; recipes bring the generic look the review criticised |
| Radix Primitives (1.7.0) | Mature and widely known | No tree, grid or combo box |
| Ark UI | Tree view and splitter | Smaller community; no grid |
| Full kits (Mantine, MUI, Fluent, Ant) | Everything on day one | Impose their own look and density |
| Stay hand-written | No dependency | It is the current failure |

The gaps of the chosen library are covered without another dependency: the menu bar is the native Electron application menu (UX-014), and a context menu is a menu in a popover at the pointer.

### Dependency justification (`AGENTS.md` rule 5, constitution rule 8)

Each row is a concrete need; nothing is added for convenience. Licences are as published by each project and must be confirmed when the dependency is added.

| Dependency | Kind | Need it meets | Why not avoid it | Exit |
|---|---|---|---|---|
| React Aria Components | Runtime, renderer | UX-001: accessible tree, grid, menus, dialogs, fields | Hand-building these accessibly is the work that failed | The kit wraps it; application code never imports it directly (UX-002) |
| Two open-licensed font families (a UI sans such as IBM Plex Sans, and JetBrains Mono) | Bundled asset | UX-006: one typeface on all systems; the current stack names fonts that cannot be redistributed | No font files are shipped today | Replaceable through the font tokens |
| An Electron end-to-end runner (Playwright) | Development only | VF-008: journeys on the real application | The existing hand-written protocol script is 134 KB and covers one path | Tests are plain scripts; the runner can be swapped |
| A DOM test environment and Testing Library | Development only | VF-007: render tests | No DOM library is installed, which is why no component is tested | Development only |
| An accessibility lint plugin and an automated accessibility checker | Development only | UX-024, UX-026 | Contrast and labelling defects went unnoticed | Development only |
| A formatter (Prettier; `clang-format` for C) | Development only | VF-017 | Lines of 3,420 characters cannot be reviewed | Development only |
| A local search plugin for the docs site | Docs site | DOC-018 | The site has no search | Docs only |
| A browser flasher for ESP32 (for example ESP Web Tools) | Docs site | REL-024 | Flashing without a toolchain | Docs only |

No dependency is added for automatic update, state management, IPC schemas (zod is already a dependency) or the application itself beyond the first two rows.

### Sources

Library versions come from the npm registry queried on 2026-10-08. Feature facts were checked by web search on that date, not against package source [S]: https://react-aria.adobe.com/useContextMenu , https://react-spectrum.adobe.com/releases , https://unpkg.com/@base-ui/react@1.6.0/docs/index.md

Not verified [N]: the current state of Playwright's Electron support; whether the chosen DOM environment runs React Aria Components faithfully. Both are exit criteria of the spike.

---

## 6. Staying on Electron

### Decision

Stay on Electron for 2.x. Do not migrate to Tauri. Keep the option open by placing project files, serial access and the runtime behind typed service interfaces in the main process (IDE-001).

### Rationale

| Need | Electron today | Tauri 2 |
|---|---|---|
| Serial | Web Serial in the renderer (`IDE/src/uploader/webserial.ts:136`) | No Web Serial in WKWebView or WebKitGTK; a Rust serial layer and a rewritten transport |
| Compiler, Tool API, MCP server | TypeScript in the main process | No Node runtime; a sidecar per platform, which gives back much of the size saving |
| Native runtime supervision | A tested supervisor (`IDE/electron/nativeSimulationSupervisor.ts`) | Would port well |
| Rendering of Monaco and React Flow | One engine everywhere | Three engines to test |
| Security boundary | Hardened and tested (`IDE/electron/main.ts:284-290`, `IDE/electron/security.ts`) | A good model, but the existing boundary and its tests are discarded |
| Signing | The costs in sections 1 and 2 | The same certificates and the same warnings |
| Installer size | 91 to 138 MB | Much smaller before sidecars |

Size is the only gain, and what blocks professional use is trust and correctness, which cost the same on both.

One correction to the baseline: it gives two reasons, Web Serial and the File System Access pickers. After IDE-001 the application no longer uses those pickers, so the second reason disappears; the first, together with the Node-based toolchain and the single rendering engine, is sufficient. Firefox 151 gained Web Serial behind an add-on prompt [P], which does not help Tauri, whose macOS and Linux engines are WebKit.

### Alternatives considered

- **Tauri 2 now:** rejected for the reasons in the table.
- **A hosted web build instead of a desktop application:** loses the native runtime and supervision; kept as an additional channel under decision D-07.

### Sources

Web Serial API [P]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API ; Firefox 151 release notes [P]: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/151 ; Tauri sidecar and updater documentation: https://v2.tauri.app/develop/sidecar/ , https://v2.tauri.app/plugin/updater/ . The Tauri size estimate for ZPLC is the reviewer's own [I].

---

## 7. Rewriting the compiler's semantic middle

### Decision

Keep the lexer, parser, syntax tree, assembler and container. Replace `symbol-table.ts` and `codegen.ts` (about 3,600 lines) with a semantic pass: scoped symbols, a type checker with the IEC conversion rules, a typed intermediate representation, one memory layout shared by code and debug map, and instance-relative code for function blocks. Keep the assembly text as a printed view of the output (CMP-060). First apply five stopgaps that take days, not weeks: make error markers fail the build, pass compiler messages through the Tool API, build the debug map from the generator's table, fix `FOR`, `RETURN` and `CASE`, and guard the division edge case.

Bundle every change that breaks the binary contract into one final ABI revision before GA: 64-bit and double-precision arithmetic, float comparison, the size table and layouts of the communication blocks, the STRING layout, stack-depth metadata, the build identity in the container, and configurable I/O image sizes (the list is in the risks of the CMP workstream). No GA artifact exists yet, so one incompatibility now is cheap, and spec 010's rule (an ABI change is an explicit incompatibility) is met by CMP-052. Because the contract changes in many places between now and the freeze, a single number would let two prereleases carry the same ABI number with different opcodes or layouts, and a compiler from one and firmware from the other would misbehave instead of failing; a draft counter prevents that.

Three points of ownership and timing follow from that:

- **The VM work for the language belongs to CMP.** The operations that CMP-015, CMP-023, CMP-024 and CMP-041 need (64-bit and double-precision arithmetic, bounds and null-reference faults, indirect calls) are designed once with the ABI revision and delivered with the compiler requirement that needs them. RT keeps the rules they must obey: bounds, stack effects, defined results on every platform, a test per opcode.
- **A draft counter until the freeze, then one frozen integer (design default).** Until the conformance matrix is closed (spec section 8, gate 1), every contract change increments a draft counter that the compiler writes into each artifact and each firmware image reports in its handshake; the loader and Studio refuse a mismatch and show both numbers, so a mixed pair fails loudly. The final integer is assigned and frozen at that point, and a CI check compares the generated contract (VF-012) with the frozen file and fails on any difference (CMP-052). Each prerelease before the freeze says that programs must be rebuilt and boards reflashed after an update. Alternatives considered: one number that changes once at the end (rejected: a mixed pair cannot be detected), a separate version per field of the contract (rejected: more machinery than a solo maintainer needs), and no version check in prereleases (rejected: it contradicts spec 010's rule that an ABI change is an explicit incompatibility).
- **Prerelease tags continue the `rc` sequence after `2.0.0-rc.3`** (REL-031). An alpha, beta or preview name would sort below `rc.3` under semantic versioning, so the release title, not the tag, says how complete a prerelease is.

### Rationale

- There is no semantic analysis and no type checker at all: the only type logic distinguishes STRING and REAL to choose an opcode (`COMPILER/compiler/codegen.ts:1998-2033`).
- There are 78 places where an error becomes an assembly comment (36 in `codegen.ts`, 42 in the standard library templates), and nothing reads them.
- The symbol table is one global map (`COMPILER/compiler/symbol-table.ts:132`), which is why two functions cannot share a parameter name and why the debug map, built from a second table, disagrees with the code.
- Function blocks are inlined at each call with absolute addresses (`codegen.ts:1664-1691`); there is no instance pointer, which is the structural reason nested instances, arrays of instances and interface dispatch cannot work.
- About 55 of 120 programs executed in the review gave a wrong result or a fault, across integers, reals, structures, enumerations, strings, initial values and function blocks. These are not independent bugs; they share the missing type information.

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Patch `codegen.ts` in place | Every numeric and aggregate fix needs the type of every expression. Adding types to a generator that prints text is the same rewrite with more risk and no intermediate form to test. |
| Adopt another open-source compiler (MATIEC, STruC++, RuSTy, IronPLC) | None targets the ZPLC VM. MATIEC and STruC++ generate C or C++, which gives up downloading a small verified program without reflashing. The OpenPLC editor and compiler and Beremiz are under GPL-family licences (as reported by the review's web research), while ZPLC is MIT. |
| Rewrite the whole compiler | The lexer and parser are readable and correct in structure; their gaps are grammar additions (CMP-030 to CMP-033). |
| Reject 64-bit types until later (the review's recommendation) | A removal under owner decision S-1; see section 10. |

### Sources

Code locations above; the review's execution results; competitor facts from https://github.com/Autonomy-Logic/STruCpp , https://raw.githubusercontent.com/beremiz/matiec/master/readme , https://github.com/ironplc/ironplc , https://github.com/PLC-lang/rusty (three re-fetched by the reviewer, the rest as reported).

---

## 8. One scheduler core, the safe state and the control link

### Decision

Extract task admission, ordering, scan phases, deadline handling, the fault latch and the safe state from `CORE/src/hal/zephyr/zplc_scheduler_zephyr.c` into portable C99, over a port interface of about eight functions (monotonic time, wait until, one lock, read inputs, write outputs, non-volatile read and write, watchdog arm and feed, log). Use it from Zephyr, the POSIX host runtime and the WASM runtime, and make the single-task mode a one-task configuration of it (RT-008, RT-018, IO-013).

The scheduler core carries five safety decisions, each stated in the spec and recorded here with its alternatives.

1. **Start policy after a reset (D-13). Recommended default A: always STOP after any reset or power-up.** The first draft recommended B (automatic RUN after power-up when a person had enabled it for the device). Review changed the default because B conflicts with constitution rule 4 (`.specify/memory/constitution.md:16-18`), with principle P9 and with spec 010's safety boundary (`specs/010-zplc-2-0-foundation/spec.md:58-59`); choosing it would first require the owner to amend the constitution. Option B stays described for an owner who needs automatic restart after a power dip: automatic RUN only after a clean power-on reset cause, only on a device where a person enabled it beforehand, and never after a brown-out, pin, software, watchdog or fault reset (RT-021 distinguishes those causes). This is an owner decision whose default changed.
2. **Safe state on STOP, at boot and across a deploy (RT-023).** Without it the outputs are undefined between the old program stopping and the new one starting, and between reset and the first scan. Alternative: apply the safe state only on faults (rejected: a commanded STOP would leave outputs at their last values).
3. **Forces end with their session (COM-020, design default).** The device releases forces set by a session when it ends, times out or loses its link, and the outputs then follow the program. The alternative is that forces persist until a person clears them; it is rejected as the default because an energised forced output could outlive the engineering link, and P9 names communication loss among the events that must not leave physical control to chance. A force that must survive can be set again in a new session.
4. **Watchdog policy by state (RT-020, design default).** The firmware's own rule is that the hardware watchdog is enabled only in a board profile after hardware has verified reset timing and safe outputs (`firmware/zephyr/Kconfig:100-103`, `CORE/src/hal/zephyr/zplc_scheduler_zephyr.c:409-413`), so RT-020 enables it only where a hardware record exists. While paused or at a breakpoint it is kept fed by the control path (or a stated board policy), because a long breakpoint must not reset the board; in a latched fault it stays armed and resets the board into STOP with the cause recorded, so that a reset does not erase the fault.
5. **Frame authentication on network transports (COM-021).** Every frame carries a message authentication code under the session key that covers the sequence number; a bad code or a replayed or out-of-order sequence is dropped and counted. Authenticating only the opening of a session was rejected: it would let an attacker on the plant network inject or replay download, RUN/STOP and force frames inside an authenticated session. A TLS tunnel for the whole link remains possible where a board has a hardware entropy source (COM-016); it is heavier on small boards, so the per-frame code is the minimum. This is design reasoning with no external source [I].

### Rationale

- The POSIX host re-implements dispatch with one common interval and counted, not latched, deadline misses (`firmware/apps/posix_host/src/native_runtime_session.c:148-163`, `:1951-2029`). Program replacement resets variable memory on the host and not on Zephyr. A program can therefore pass in simulation and behave differently on a board.
- The learning mode has a simulation track and a hardware track that grade the same scenario. That only makes sense if both run the same scheduling rules.
- The 46 scheduler tests that exist can run against every port once the logic is portable, which is also the port conformance suite a later non-Zephyr port needs (decision D-06).

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep two implementations and align them by hand | This is today's state; they have already drifted. |
| Use Zephyr `native_sim` as the simulator | Spec 009's research rejected it for the first increment because of build, orchestration and debugger overhead; that reasoning still holds for a desktop application installed by learners. |
| Defer to 2.1 (the runtime review's suggestion) | Leaves principle P3 unmet in the release that introduces a graded course on two tracks. |

### Sources

`specs/009-native-runtime-sim/research.md` section 1; `.specify/memory/constitution.md:16-18`; `specs/010-zplc-2-0-foundation/spec.md:58-59`; `firmware/zephyr/Kconfig:100-103`; code locations above.

---

## 9. Learning-mode design

### Decision

1. **Entry.** Learn is reachable from the Welcome screen, the activity rail and the Help menu, with no project open (LRN-001). Studio manages a course workspace so that starting a lesson needs no manual copy.
2. **One course, two tracks.** Simulation and Hardware are properties of a lesson, not two courses (LRN-009, LRN-011). The hardware boards are the Raspberry Pi Pico and the ESP32-S3.
3. **Lessons are data packages** with a schema-validated manifest, text per language, starter, solution, reference scenario and plant mapping (LRN-027). Lesson ids come only from the manifests (LRN-028).
4. **Grading** runs the reference scenario from the lesson package, pinned by content hash, against the learner's program (LRN-022). Times and values quoted in the text are data fields rendered into it, so text and scenario cannot disagree (LRN-025).
5. **Live plants and a generic I/O faceplate** run against the simulation on its virtual clock (LRN-017 to LRN-019); recorded replay stays (LRN-020).
6. **The serial-backed scenario port is adopted, with limits** (HIL-002, HIL-003, LRN-024).
7. **Educator basics without accounts:** a printable outline, a verifier for exported progress, a classroom setting (LRN-033).
8. **The course outline comes first.** The curriculum fixes twelve modules, not lesson counts. The outline, with every planned lesson per module, is written when the ten existing lessons are placed (LRN-007) and before any new lesson; the table and LRN-008 imply a floor of 17 lessons, and the outline is the basis for sizing.
9. **Module 10 runs in simulation against loopback endpoints that Studio starts itself (COM-009, LRN-030).** The course must work offline (LRN-030), and the only existing doubles are test doubles for CI in `tools/connectivity/` (fake Azure and AWS endpoints and broker configuration), which the installed application does not contain. The spec therefore requires a Modbus TCP server and an MQTT broker inside the installed application, derived from those doubles. This is new product code that adds size to the package that owns COM-009 and to the package that writes module 10, and the owner has not decided it; it is an open question (section 12, question 11) and the spec states the default. Alternatives: make module 10 hardware-only (rejected as the default: it leaves a hole in the Advanced level of the simulation track), recorded replay (rejected: not interactive), or require the learner to install a broker (rejected: it breaks the no-terminal, offline principle P8).

### Rationale

- Today Learn is a bottom-panel tab that exists only when a project is open (`IDE/src/App.tsx:49-55`), with ten unlocked lessons in no teaching order, none of which edits a language other than Structured Text.
- Grading today checks that the latest test result has the right scenario id and path (`IDE/src/components/learnLesson.ts:106-126`); the scenario lives in the learner's workspace and its content is not compared with anything, and eight of nine starters ship a scenario different from the one the text describes.
- Four plant models already exist in the scenario runner (`IDE/src/test-engine/index.ts:210-245`), bound to fixed names. Making them live is a matter of stepping them with the simulation and binding them by an explicit mapping; no new physics is needed, and spec 010's exclusion of scene editing stays intact.
- Lesson content as TypeScript source (`IDE/src/components/learnContent.en.v1.ts`) puts ids in three files and makes every lesson a code change.

### The serial-backed scenario port

The scenario engine talks to a runtime through six operations: load a program, reset, ask whether forces exist, set an input bit, step to a time, read an output bit (`IDE/src/test-engine/index.ts:12-19`). An implementation over the device protocol lets the same scenario file serve three purposes: host tests, the hardware track of the course, and HIL tests.

It is adopted with these limits, each of which is a requirement:

| Limit | Consequence |
|---|---|
| Setting an input on a board means forcing it; loading a program means deploying it. Both are physical operations. | A hardware scenario run is started by a person and is never reachable from MCP or AI tools (HIL-003, LRN-015). Forces are released at the end and on abort. |
| A board runs in real time; the host runs on a controlled clock. | "Step to time t" waits for device time; assertions use the tolerance the lesson declares; the result is labelled a hardware run and is never presented as a deterministic pass (LRN-024). |
| The port carries bits only. | Analog lessons need the port extended for both host and hardware. |
| Forcing a pin does not test the wiring. | Hardware lessons also include steps where the learner operates a real button and observes a real LED. |
| The device must timestamp samples and apply writes atomically. | Depends on the new protocol (COM-019, COM-023, COM-025). |

### Alternatives considered

| Alternative | Why rejected |
|---|---|
| Two separate courses (simulation and hardware) | Doubles the bilingual content and lets the tracks drift. |
| A hosted virtual board (for example Wokwi) for the hardware feel | An external online service; the course must work offline (LRN-030) and at no cost. None exists in the repository. |
| Grading by comparing outputs with the solution's outputs | Rejects correct programs that differ in harmless ways; the scenario states the intended behaviour. |
| Hidden test scenarios | The learner should be able to read what is checked; a pinned, visible scenario gives integrity without secrecy. |
| Keeping lessons in TypeScript | The cause of the triplicated ids and of text that drifts from scenarios. |
| A separate Python-only hardware harness | `tools/hil` is kept (S-1), but scenario files would not be shared with the course. |
| Accounts and a server for educators | Recurring cost and a privacy burden; an exported, verifiable progress file covers a classroom. |

### Sources

The learning-mode inventory of 2026-10-08 (local review material); the code locations above; `specs/010-zplc-2-0-foundation/spec.md:83-87`.

Not verified [N]: every hardware statement. No lesson has run on a board.

---

## 10. What "nothing descoped" changes

### Decision

Owner decision S-1 is applied without exception. Each review recommendation to remove something functional became a repair. The table records what that costs, so the cost is visible.

| The review recommended | The spec requires | Added cost or risk |
|---|---|---|
| Delete Instruction List (about 1,650 lines; the review noted it is outside spec 010's GA boundary and absent from the newest edition of the standard) | Repair it: terminating parser, correct jumps, typed accumulator, calls, executed tests (LNG-017 to LNG-020) | A fifth language to maintain and to teach (curriculum module 9) |
| Delete `packages/zplc-hil` and the print-only scripts in `tools/hil` | Make the harness real; keep every script, failing properly or documented (HIL-001, HIL-004) | Two harnesses in two languages; the shared scenario port reduces the overlap |
| Cut the cloud blocks and provisioning | Repair them and test against local doubles (COM-002 to COM-009) | The doubles in `tools/connectivity/` must be kept honest; live-service evidence is optional (decision D-11) because it depends on third-party accounts |
| Remove RETAIN from the language, or implement it | Implement it in the compiler and on every board (CMP-029, RT-025) | Flash wear and a power-cycle test per board |
| Delete the WASM fallback, or ship it | Build, verify and ship it (IDE-025) | A third runtime port in CI; it also keeps a web build possible (decision D-07) |
| Delete the Zephyr single-task mode | Keep it as a configuration of the shared scheduler (RT-018) | Small once the core is extracted |
| Reject 64-bit types until the VM supports them | Make `LINT`, `ULINT`, `LWORD` and `LREAL` work (CMP-015) | New opcodes or multi-word sequences, the ABI revision, and flash on small targets. The largest single cost of S-1. |
| Ship fewer installer formats | Keep all fourteen (REL-020), each installed and launched in CI (REL-036) | CI time |
| Defer the scheduler extraction and the I/O model | Do both in 2.0 | See section 8 |

The same rule produced the matrix rule in spec section 6: anything parsed today must work. That pulls in interface dispatch, enforced access specifiers, `DATE`, `TOD` and `DT` arithmetic, and effects for the unused project options (CMP-017, CMP-041, CMP-059).

### What is still removed

Only things that are not functional: scratch files, tracked build output, template leftovers, generated images, a dead duplicate of the Watch panel, tests that assert on source text, the workflow-text parsing inside the release validator (the validator and its test stay and are rewritten to inspect produced artifacts, VF-021), and generic agent skills (spec section 4.3 and DOC-020).

### Alternatives considered

None. S-1 is binding. Where it is expensive, the cost is stated here and in the risks of the workstream.

---

## 11. Departures from the baseline direction, and contradictions in the evidence

### Departures

| Topic | Baseline or review | This spec | Reason |
|---|---|---|---|
| macOS signing | The release review recommended the Apple Developer Program | Ad-hoc signing and a Homebrew tap | Owner decision S-2 and the distribution research |
| Signing the DMG | The release review recommended `dmg.sign: true` | `dmg.sign: false` | Only needed for notarization |
| Automatic update | The release review proposed `electron-updater` after signing | Notice only in 2.0 | No stable macOS identity without a certificate |
| Reason to stay on Electron | Web Serial and the File System Access pickers | Web Serial, the Node toolchain, one engine | IDE-001 removes the pickers from the application |
| Scheduler core and I/O model | The runtime review placed them in 2.1 | 2.0 | Principle P3 and the two-track course |
| Pause behaviour | The runtime review said "gate the physical commit, keep the image" | Physical outputs safe while paused; image and forces preserved (RT-017) | Stated explicitly as a safety behaviour so that it is tested and documented |
| Start after a reset | The runtime review proposed a persisted start policy defaulting to STOP | Decision D-13, recommended default A (always STOP after any reset); option B is described with its conditions and conflicts with constitution rule 4 | Whether a controller may enter RUN without a person is a safety policy for the owner; the default changed from B to A after review |
| Windows channel | An open decision when writing began | Fixed by the owner as S-5 during writing: Store first, then SignPath Foundation, then winget | The owner's decision; section 2 keeps the alternatives |
| Workstreams | Twelve given | The same twelve, no split or merge | Two placements to note: the VM side of the sandbox defect is in RT and the handler side in COM; examples are in LRN |
| Missing IEC elements | Left to the spec | About twenty everyday forms assigned to 2.0 as requirements; the rest under D-04 | The task rule: a professional needs them to paste ordinary code |

### Contradictions and how they were resolved

| Item | Conflict | Resolution |
|---|---|---|
| `IDE/electron-builder.yml` line numbers | The architecture and release reviews cite different lines for `publish: null` and the `.deb` dependencies | Read from the file: `publish: null` is line 43; `depends` is lines 114 to 120 |
| Test counts | The design review counts 84 test files and 216 text assertions in one file; the architecture review counts 96 files, 1,013 tests and 209 | The spec uses the architecture review's numbers, which came with a test run |
| Web Serial reach | The baseline says "does not exist in WebKit"; the distribution research adds that Firefox 151 supports it | Both true; the conclusion for a desktop shell is unchanged |
| electron-builder ad-hoc fallback | Official documentation says no automatic fallback; third-party reports say one exists for arm64 | Set `identity: "-"` explicitly and assert the result in CI |
| ESP32-S3 board | The manifest and spec 010 name a DevKitC; the overlay is written for a LilyGo T-Display S3 with 16 MB flash (`APP/boards/esp32s3_devkitc_esp32s3_procpu.overlay:2`, `:25-38`) | Found while writing and recorded as a failure under IO. The owner has since confirmed that the board is an ESP32-S3-DevKitC-1; only the flash and PSRAM variant printed on the module is still open (question 3) |
| Cloud verification | The review said the cloud blocks were not verified and proposed cutting them | `tools/connectivity/` already contains fake Azure and AWS endpoints and broker configurations, so local doubles are a realistic verification route |

### Where the evidence is thin, and what was assumed

1. Six findings are inferences, not observations: folder open failing in the packaged application; breakpoints not binding; the exact macOS dialog; the `.deb` failing to install; the bill of materials being nearly empty; the content security policy not being enforced on a `file://` load. Each is written as a requirement whose first task is to confirm it.
2. Per-item states in the inventory are only as fine as the review's probes. For string functions, `LEN`, `COPY`, `CONCAT` and `LEFT` were executed; the others are assumed broken with string variables. For communication blocks, the dispatcher defect is verified and the state of each block follows from it.
3. Process-control, generator, buffer and trigonometric blocks were not executed by anyone; they are marked unverified, not broken.
4. The failures listed in the May 2026 local remediation notes about event-based telemetry were not assessed by the review. The spec treats them as open on the evidence of three polling timers (COM-025).
5. The Arduino Opta's relay and input pins, and whether a Modbus RTU server and Sparkplug B encoders are complete, are not established.
6. Competitor facts come from the review's web research, three pages of which the reviewer re-read.
7. `WATCHDOG_RESET` is a deliberate, documented no-op (`COMPILER/compiler/stdlib/system.ts:505-523`). Because a silent no-op conflicts with principle P1, the spec requires either a documented, tested effect or a compile warning (RT-034), and leaves the choice to the design; the review did not propose an effect.
8. No timing, footprint or hardware figure in the spec is a measurement of a released build; the only whole-image sizes are from a local build of 2026-05-12.

---

## 12. Open questions

| # | Question | Blocks | How to answer |
|---|---|---|---|
| 1 | Does a sealed ad-hoc bundle open through Open Anyway on macOS 27, and with no dialog when not quarantined? | REL-001, REL-005 | The manual first-run check on a real Mac |
| 2 | Does `identity: "-"` sign on the pinned electron-builder version, with hardened runtime on? | REL-001 | One rehearsal build |
| 3 | Answered on 2026-10-08: the owner holds an ESP32-S3-DevKitC-1, not a T-Display S3. Still to confirm: the flash and PSRAM variant printed on the module (spec 010 names N8R8). | IO-009, LRN-014 | Read the module marking when the board profile is corrected |
| 4 | Do Web Serial, the native runtime and project files work inside an MSIX package? | REL-008 | A test on Windows |
| 5 | Will SignPath Foundation accept a single-maintainer project, and does the Store's individual account fit? | REL-007, REL-009 | Apply |
| 6 | Is Playwright's Electron support current, and does the DOM environment run React Aria Components? | VF-007, VF-008, UX-001 | The one-week spike |
| 7 | Do the two inferred Blockers reproduce (folder open, breakpoint binding)? | IDE-003, LNG-005 | Two manual checks on an rc.3 build |
| 8 | What flash and RAM do 64-bit and double arithmetic cost on a Cortex-M0+? | CMP-015 | A size report on the Pico |
| 9 | Is the WASM runtime good enough as the only simulator of a web build, and does it need cross-origin isolation? | Decision D-07 | Build it (IDE-025), then decide |
| 10 | What write endurance and retain interval suit each board's flash? | RT-026 | Part data sheets, then a bench test |
| 11 | Should the simulation track of curriculum module 10 work offline against loopback Modbus and MQTT endpoints that Studio starts itself? The default is yes; the endpoints are new product code, which adds size to the package that owns COM-009 and to the module 10 package (not estimated). This is an owner question with no decision number. | COM-009, LRN-030, curriculum module 10 | Owner |
| 12 | Does the core run on `qemu_cortex_m0` (16 KB of RAM) with reduced memory sizes? If not, the alignment-sensitive cases fall back to a host run with the sanitizer's alignment check. | VF-005, VF-015 | A trial run of the core on that board |
| 13 | Do the design defaults of spec section 4.6 stand (no outside approval can delay GA, forces end with their session, watchdog policy by state, draft ABI counter, `rc` tag names)? | REL-038, COM-020, RT-020, CMP-052, REL-031 | Owner |
