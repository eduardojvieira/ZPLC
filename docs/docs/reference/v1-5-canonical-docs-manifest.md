---
title: Documentation manifest
sidebar_label: Docs manifest
description: For contributors. The pages that must exist in English and Spanish, and who owns each.
---

# Documentation manifest

This page is for contributors. It lists the documentation pages that must exist
in English and Spanish, with the area and the owner of each. CI checks that every
row marked `release_blocking: yes` has both files and the same slug in both
languages (`bun run docs:validate`). Add a row when you add a page.

| slug | english_path | spanish_path | area | release_blocking | owner | status |
|------|--------------|--------------|------|------------------|-------|--------|
| getting-started/index | docs/docs/getting-started/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/getting-started/index.md | quickstart | yes | docs | in-progress |
| platform-overview/index | docs/docs/platform-overview/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/platform-overview/index.md | concepts | yes | docs | in-progress |
| integration/index | docs/docs/integration/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/integration/index.md | quickstart | yes | docs | in-progress |
| architecture/index | docs/docs/architecture/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/architecture/index.md | architecture | yes | docs | in-progress |
| runtime/index | docs/docs/runtime/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/index.md | runtime | yes | docs | in-progress |
| runtime/hal-contract | docs/docs/runtime/hal-contract.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/hal-contract.md | runtime | yes | docs | in-progress |
| runtime/memory-model | docs/docs/runtime/memory-model.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/memory-model.md | runtime | yes | docs | in-progress |
| runtime/scheduler | docs/docs/runtime/scheduler.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/scheduler.md | runtime | yes | docs | in-progress |
| runtime/connectivity | docs/docs/runtime/connectivity.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/connectivity.md | runtime | yes | docs | in-progress |
| runtime/communication-function-blocks | docs/docs/runtime/communication-function-blocks.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/communication-function-blocks.md | runtime | yes | docs | in-progress |
| runtime/isa | docs/docs/runtime/isa.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/isa.md | runtime | yes | docs | in-progress |
| runtime/persistence | docs/docs/runtime/persistence.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/persistence.md | runtime | yes | docs | in-progress |
| runtime/native-c | docs/docs/runtime/native-c.md | docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/native-c.md | runtime | yes | docs | in-progress |
| ide/index | docs/docs/ide/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/index.md | ide | yes | docs | in-progress |
| ide/overview | docs/docs/ide/overview.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/overview.md | ide | yes | docs | in-progress |
| ide/editors | docs/docs/ide/editors.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/editors.md | ide | yes | docs | in-progress |
| ide/compiler | docs/docs/ide/compiler.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/compiler.md | ide | yes | docs | in-progress |
| ide/deployment | docs/docs/ide/deployment.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/deployment.md | ide | yes | docs | in-progress |
| ide/migration-v1-to-v2 | docs/docs/ide/migration-v1-to-v2.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/migration-v1-to-v2.md | ide | yes | docs | candidate |
| ide/ai-privacy | docs/docs/ide/ai-privacy.md | docs/i18n/es/docusaurus-plugin-content-docs/current/ide/ai-privacy.md | ide | yes | docs | candidate |
| languages/index | docs/docs/languages/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/languages/index.md | languages | yes | docs | in-progress |
| languages/st | docs/docs/languages/st.md | docs/i18n/es/docusaurus-plugin-content-docs/current/languages/st.md | languages | yes | docs | in-progress |
| languages/il | docs/docs/languages/il.md | docs/i18n/es/docusaurus-plugin-content-docs/current/languages/il.md | languages | yes | docs | in-progress |
| languages/stdlib | docs/docs/languages/stdlib.md | docs/i18n/es/docusaurus-plugin-content-docs/current/languages/stdlib.md | languages | yes | docs | in-progress |
| languages/examples/v1-5-language-suite | docs/docs/languages/examples/v1-5-language-suite.md | docs/i18n/es/docusaurus-plugin-content-docs/current/languages/examples/v1-5-language-suite.md | languages | yes | docs | in-progress |
| reference/index | docs/docs/reference/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/index.md | reference | yes | docs | in-progress |
| reference/v1-5-canonical-docs-manifest | docs/docs/reference/v1-5-canonical-docs-manifest.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/v1-5-canonical-docs-manifest.md | contributing | yes | docs | foundation |
| reference/source-of-truth | docs/docs/reference/source-of-truth.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/source-of-truth.md | contributing | yes | docs | foundation |
| reference/runtime-api | docs/docs/reference/runtime-api.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/runtime-api.md | reference | yes | docs | generated |
| reference/boards | docs/docs/reference/boards.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/boards.md | boards | yes | docs | generated |
| reference/capabilities-evidence | docs/docs/reference/capabilities-evidence.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/capabilities-evidence.md | reference | yes | docs | candidate |
| reference/zephyr-workspace-setup | docs/docs/reference/zephyr-workspace-setup.md | docs/i18n/es/docusaurus-plugin-content-docs/current/reference/zephyr-workspace-setup.md | zephyr-setup | yes | docs | in-progress |
| operations/index | docs/docs/operations/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/operations/index.md | operations | yes | docs | in-progress |
| operations/shell | docs/docs/operations/shell.md | docs/i18n/es/docusaurus-plugin-content-docs/current/operations/shell.md | operations | yes | docs | in-progress |
| operations/recovery | docs/docs/operations/recovery.md | docs/i18n/es/docusaurus-plugin-content-docs/current/operations/recovery.md | operations | yes | docs | candidate |
| release-notes/index | docs/docs/release-notes/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/release-notes/index.md | release-notes | yes | docs | release-ready |
| development/firmware-testing | docs/docs/development/firmware-testing.md | docs/i18n/es/docusaurus-plugin-content-docs/current/development/firmware-testing.md | development | no | firmware | candidate |
| contributing/index | docs/docs/contributing/index.md | docs/i18n/es/docusaurus-plugin-content-docs/current/contributing/index.md | contributing | no | docs | candidate |
| contributing/principles | docs/docs/contributing/principles.md | docs/i18n/es/docusaurus-plugin-content-docs/current/contributing/principles.md | contributing | no | docs | candidate |
| contributing/roadmap | docs/docs/contributing/roadmap.md | docs/i18n/es/docusaurus-plugin-content-docs/current/contributing/roadmap.md | contributing | no | docs | candidate |

## Board manifest compatibility

The board manifest is `firmware/app/boards/boards.json`; it replaced the versioned filename `supported-boards.v1.5.0.json`. Its entries are evidence-tiered profiles, not a v1.5 product claim.

## Source-of-Truth Rule

The manifest is only a navigation contract. The truth for runtime APIs, boards, Studio workflows
and release scope lives in the files named in the [source of truth](./source-of-truth.md).
