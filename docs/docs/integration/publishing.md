---
id: publishing
title: Documentation Publishing
sidebar_label: Publishing
description: How to release and deploy the ZPLC documentation to GitHub Pages.
tags: [operations, docs, github-pages]
---

# Documentation Publishing

The ZPLC documentation is built using Docusaurus and automatically deployed to GitHub Pages via GitHub Actions.

## The Deployment Pipeline

The pipeline is defined in `.github/workflows/docs-deploy.yml` and runs as **Deploy Docusaurus to GitHub Pages**. It handles both pull requests and pushes to the main branch.

### Pull Requests (Validation)
When a PR is opened that modifies the `docs/` directory:
1. The CI pipeline installs dependencies.
2. It runs `bun run validate:v1.5-docs` and then `bun run build`.
3. **Crucially**, Docusaurus is configured with `onBrokenLinks: 'throw'`. If your PR introduces a broken internal link, a missing markdown import, or invalid frontmatter, the build will fail, blocking the merge.

### Merges to Main (Deployment)
When changes are pushed to `main` (or `master`):
1. The CI pipeline performs the build validation step.
2. It uploads the `docs/build` directory as an artifact.
3. A subsequent job deploys that artifact directly to the `github-pages` environment.

## Release Procedure

To publish new documentation:
1. Make your changes in a feature branch.
2. Run `cd docs && bun run validate:v1.5-docs` locally to verify manifest parity and generated references.
3. Open a Pull Request.
4. Wait for the `Build Documentation` job in **Deploy Docusaurus to GitHub Pages** to pass.
5. Merge the PR or push the approved change to `main`. GitHub Actions will upload `docs/build` and deploy it to GitHub Pages automatically.

## Versioning a Release

When the ZPLC project hits a release milestone (for example, `v1.5.0`), you should take a snapshot of the documentation.

1. Create a branch for the release.
2. Run `cd docs && bun run docusaurus docs:version 1.5.0`.
3. Commit the new `versions.json` and the `versioned_docs/` folder.
4. Merge the PR.

## Rollback Procedure

If a bad deployment reaches production:
1. Identify the commit hash of the last known good documentation state on the `main` branch.
2. Use `git revert <bad-commit-hash>` to undo the changes.
3. Push the revert directly to `main` (or via a rapid PR). The CI pipeline will rebuild and deploy the previous working state.
