# Tasks: ZPLC Documentation Overhaul

**Branch**: `006-docs-overhaul`

## Strategy
1. **Setup**: Create the new canonical directory structures for English and Spanish content without deleting the old ones yet. Setup the versioning base.
2. **Foundational**: Establish the new `sidebars.js` taxonomy and update `docusaurus.config.js` to support the new IA while strictly preserving the visual theme (as per `contracts/styling-contract.md`).
3. **User Stories**: Migrate content iteratively based on priority. Evaluate -> Integrate -> Author.
4. **Polish**: Finalize CI verification (links, frontmatter) per `contracts/deployment-contract.md` and clean up obsolete root files.

## Dependencies
- Phase 1 & 2 must be completed before Phase 3.
- Phase 3, 4, 5 (User Stories 1, 2, 3) can be worked on in parallel by different team members once the directory structure exists.
- Phase 6 (Publishing) requires all content migration to be completed to properly test CI link checking.

## Phase 1: Setup

- [x] T001 Initialize the new canonical directory tree (`docs/docs/`) with the required subdirectories (`getting-started/`, `platform-overview/`, `runtime/`, `languages/`, `ide/`, `integration/`, `operations/`, `reference/`, `architecture/`, `contributing/`, `release-notes/`).
- [x] T002 Initialize the parallel Spanish translation directory tree (`docs/i18n/es/docusaurus-plugin-content-docs/current/`) mirroring the English structure.
- [x] T003 Execute `docusaurus docs:version 1.0.0` (or appropriate base version) to lock the current site state before major migration begins.

## Phase 2: Foundational

- [x] T004 Rewrite `docs/sidebars.js` to implement the new Information Architecture hierarchy mapping to the new directories.
- [x] T005 Update `docs/docusaurus.config.js` to ensure built-in local search remains active, verify GitHub Pages URL paths, and ensure the `custom.css` theme is strictly preserved.
- [x] T006 Establish the `Agents.md` file at the repository root to serve as the entry point for AI assistants, separating them from `README.md`.

## Phase 3: User Story 1 - Evaluate ZPLC for Adoption (P1)
**Goal**: Ensure engineering leaders can find product boundaries, architecture, and platform support.
**Independent Test**: Navigate 'Platform Overview', 'Architecture', and 'Integration' without relying on root files.

- [x] T007 [P] [US1] Create and populate `docs/docs/platform-overview/index.md` with core concepts and product boundaries.
- [x] T008 [P] [US1] Create and populate `docs/docs/architecture/index.md` with high-level system architecture and data flows.
- [x] T009 [P] [US1] Create and populate `docs/docs/integration/index.md` (and related pages) with platform support and deployment guidance.
- [x] T010 [P] [US1] Create equivalent Spanish translations in `docs/i18n/es/` for Platform Overview, Architecture, and Integration.

## Phase 4: User Story 2 - Integrate ZPLC into Target Hardware (P1)
**Goal**: Firmware engineers can integrate ZPLC VM using HAL contracts and memory models.
**Independent Test**: Successfully configure the ZPLC VM on a target purely from docs.

- [x] T011 [P] [US2] Create and populate `docs/docs/runtime/index.md` detailing the VM model, scheduling, and supported targets.
- [x] T012 [P] [US2] Create and populate `docs/docs/runtime/hal-contract.md` defining the hardware abstraction layer requirements.
- [x] T013 [P] [US2] Create and populate `docs/docs/runtime/memory-model.md` detailing memory constraints and behaviors.
- [x] T014 [P] [US2] Create equivalent Spanish translations in `docs/i18n/es/` for the Runtime section.

## Phase 5: User Story 3 - Author PLC Applications in IDE (P1)
**Goal**: IDE users can find language guides and standard libraries.
**Independent Test**: Write and debug a Structured Text program using provided examples.

- [x] T015 [P] [US3] Create and populate `docs/docs/languages/index.md` and `docs/docs/languages/structured-text.md` with IEC 61131-3 alignment and examples.
- [x] T016 [P] [US3] Create and populate `docs/docs/ide/index.md` covering tooling capabilities and the debugging model.
- [x] T017 [P] [US3] Create equivalent Spanish translations in `docs/i18n/es/` for Languages and IDE sections.

## Phase 6: User Story 4 - Platform Operations and Documentation Publishing (P2)
**Goal**: DevOps can rely on reproducible CI workflows and docs quality gates.
**Independent Test**: Trigger a PR build; verify broken links are caught and successful merges deploy to GitHub Pages.

- [x] T018 [US4] Implement a GitHub Actions workflow (`.github/workflows/docs-deploy.yml`) that runs `npm run build` to enforce broken link checking and metadata validation on PRs.
- [x] T019 [US4] Ensure the deployment step in the workflow pushes static assets to GitHub Pages correctly on merge to main.
- [x] T020 [US4] Document the publishing mechanics and release/rollback procedures for maintainers in `docs/docs/integration/publishing.md`.

## Phase 7: Polish & Cross-Cutting

- [x] T021 Migrate remaining miscellaneous content (Contributing, Reference, Release Notes) into the new structure.
- [x] T022 Validate the landing page (`docs/src/pages/index.js` and components) visually to ensure the industrial theme and grid/glow aesthetics are perfectly preserved.
- [x] T023 Update root `README.md` to act as a concise human entry point linking clearly into the new Docusaurus structure.
- [x] T024 Perform a final link check and archive/delete obsolete unstructured documentation files from the repository root (ensuring single source of truth).
