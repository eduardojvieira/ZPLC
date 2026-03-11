# Implementation Plan: ZPLC Documentation Overhaul

**Branch**: `006-docs-overhaul` | **Date**: 2024-05-24 | **Spec**: [Link to Spec](./spec.md)
**Input**: Feature specification from `/specs/006-docs-overhaul/spec.md`

## Summary

Deliver a comprehensive rewrite of the ZPLC documentation experience using Docusaurus, adopting an enterprise-ready information architecture while preserving existing industrial styling, custom CSS tokens, and GitHub Pages deployment capabilities. The overhaul includes parallel migration of English and Spanish content, instant launch of docs versioning, and retention of `README.md` as the human entry point.

## Technical Context

**Language/Version**: React 18, Markdown/MDX, Node.js (Bun runtime preferred per ZPLC guidelines)
**Primary Dependencies**: Docusaurus v3.x, `@docusaurus/preset-classic`
**Storage**: N/A (Static files)
**Testing**: CI link checking (`docusaurus build` / `lychee` or similar), visual regression check
**Target Platform**: GitHub Pages (Static site hosting)
**Project Type**: Documentation Site
**Performance Goals**: Fast static build times in CI (< 5 mins), responsive client-side routing
**Constraints**: MUST preserve `docs/src/css/custom.css` and landing page identity. Single source of truth.
**Scale/Scope**: ~30-50 initial content pages covering Home, Getting Started, Platform, Runtime, Languages, IDE, Integration, Operations, Reference, Architecture, Contributing, Release Notes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Spec First**: Pass. Specification `/specs/006-docs-overhaul/spec.md` defines exact architecture, CSS preservation constraints, and IA sections.
- **Context Hygiene**: Pass. Acting as `ArchitectureKeeper` & Documentation/Platform owner.
- **Essentialism & YAGNI**: Pass. Using built-in Docusaurus local search; deferring vendor migration. Retaining GitHub Pages deployment without introducing complex hosting.
- **Industrial Quality (Test-First)**: Pass. CI pipeline MUST enforce broken link checks and metadata validation prior to merge.
- **Direct Communication**: Pass. Commit messages will follow Conventional Commits format, technical English only. No hype buzzwords in reference material.

## Project Structure

### Documentation (this feature)

```text
specs/006-docs-overhaul/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
docs/
├── docusaurus.config.js       # Site configuration, URL/baseUrl paths, I18n settings
├── sidebars.js                # Reorganized to match new Information Architecture
├── package.json               # Dependencies, build scripts
├── src/
│   ├── css/custom.css         # Preserved brand tokens and industrial theme
│   ├── components/            # Preserved landing page components
│   └── pages/index.js         # Preserved visual layout, updated copy
├── docs/                      # English Canonical content
│   ├── getting-started/
│   ├── platform-overview/
│   ├── runtime/
│   ├── languages/
│   ├── ide/
│   ├── integration/
│   ├── operations/
│   ├── reference/
│   ├── architecture/
│   └── contributing/
├── i18n/
│   └── es/                    # Spanish parallel content
│       ├── docusaurus-plugin-content-docs/current/
│       └── ...
└── versions.json              # Versioning manifest (to be created immediately)

.github/workflows/
└── docs-deploy.yml            # CI validation (links, frontmatter) and GitHub Pages push
```

**Structure Decision**: A standard Docusaurus project layout located within the existing `docs/` subdirectory. The content directory (`docs/docs/`) is heavily refactored to align with the enterprise Information Architecture. Docusaurus built-in I18n mechanisms will handle the `es/` translations, and the versioning plugin will be enabled.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None      | N/A        | N/A                                 |
