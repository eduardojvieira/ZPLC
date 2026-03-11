# Research & Decisions: ZPLC Documentation Overhaul

## 1. Information Architecture Migration Strategy
**Decision**: Adopt a multi-phase side-by-side directory rebuild rather than in-place mutation.
**Rationale**: Migrating the IA safely requires staging the new taxonomy (`docs/getting-started`, `docs/runtime`, etc.) while ensuring broken links to old paths are properly mapped to redirects in Docusaurus.
**Alternatives considered**: In-place renaming of files, which risks breaking git history continuity and making PR review difficult.

## 2. Spanish I18n Migration
**Decision**: Use Docusaurus standard I18n `i18n/es/docusaurus-plugin-content-docs/current` directory structure and sync it concurrently.
**Rationale**: Per the specification, Spanish must be kept at full parity at launch. Docusaurus provides a strict structure for this, allowing CI to fail if translations are unmapped.

## 3. Versioning Strategy
**Decision**: Run `docusaurus docs:version 1.0.0` (or appropriate base version) immediately during this feature implementation to lock the current baseline as `current` and the snapshot as `1.0.0`.
**Rationale**: Clarified requirement states docs versioning must launch immediately with the structural rewrite.

## 4. Visual Identity Preservation
**Decision**: Hard-copy the existing `docs/src/css/custom.css` and `docs/src/components/LandingPage/` without structural changes. Update `docusaurus.config.js` to ensure the preset uses the exact same theme configuration.
**Rationale**: Required by FR-003. Any deviation risks an enterprise styling regression.
