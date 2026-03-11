# Quickstart: ZPLC Documentation Development

This guide details how to work with the rewritten Docusaurus documentation for the ZPLC project.

## Prerequisites

- Node.js >= 18.0 (Bun >= 1.0 preferred)
- Docusaurus v3.x

## Local Development

1. **Install dependencies**
   ```bash
   cd docs
   npm install # or bun install
   ```

2. **Start the local development server**
   ```bash
   npm run start
   ```
   The site will be available at `http://localhost:3000`. Hot-reloading is enabled; changes to `.md` and `.css` files will reflect immediately.

## Directory Layout

- `docs/docs/`: Canonical English content. This is where you write technical guides.
- `docs/src/css/custom.css`: The source of truth for the ZPLC industrial theme. *Do not make arbitrary changes here without visual regression approval.*
- `docs/i18n/es/`: Translated Spanish content. Mirrors the English structure.

## Building and Testing Locally

1. **Test the static build**
   ```bash
   npm run build
   ```
   This generates the `/build` directory. If there are broken internal links, the build will fail automatically. Fix them before committing.

2. **Serve the built output**
   ```bash
   npm run serve
   ```
   Test the fully compiled static site exactly as it will appear on GitHub Pages.

## Versioning

To lock the current documentation state to a specific version (e.g., when a major product release occurs):

```bash
npm run docusaurus docs:version 1.0.0
```

This creates a snapshot in `docs/versioned_docs/version-1.0.0/`. The live `docs/docs/` directory continues to represent the `next` (or unreleased) version of the documentation.
