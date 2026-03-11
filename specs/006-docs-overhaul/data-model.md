# Data Model: ZPLC Documentation Overhaul

*Note: Since this is a static documentation project, this data model describes the Information Architecture (IA), taxonomy metadata, and the frontmatter schema rather than a traditional relational database.*

## 1. Docusaurus Frontmatter Schema

Each canonical `.md` or `.mdx` file MUST include the following minimum frontmatter metadata to ensure proper navigation and SEO generation.

```yaml
---
id: [unique-string-identifier]
title: [Clear Page Title]
sidebar_label: [Short Sidebar Name]
description: [One sentence purpose/SEO summary]
tags: [[evaluator, runtime, ide, operation]] # Role-based tags for discovery
---
```

## 2. Directory Structure (Information Architecture)

The canonical source content will be organized into the following directory tree under `docs/docs/`:

- `getting-started/`: Quickstarts, Prerequisites.
- `platform-overview/`: Concepts, product boundaries.
- `runtime/`: VM model, HAL contract, memory model.
- `languages/`: Structured Text, IEC 61131-3 alignment.
- `ide/`: Tooling, debugging.
- `integration/`: Embedded integration, POSIX workflows.
- `operations/`: Upgrade guidance, compatibility.
- `reference/`: Command/Config references, board matrices.
- `architecture/`: High-level system architecture, flows.
- `contributing/`: Dev setup, workflows.
- `release-notes/`: Versioned changes.

## 3. Configuration Entities

### `sidebars.js`
A JavaScript configuration object that maps the physical directory structure (above) into the logical navigation hierarchy presented to the user on the left-hand pane.

### `docusaurus.config.js`
The global configuration containing:
- `url` and `baseUrl` (mapped to GitHub Pages target).
- `i18n` block (defining `en` default and `es` alternate).
- Theme configuration (preserving the ZPLC industrial dark/light brand identity).
