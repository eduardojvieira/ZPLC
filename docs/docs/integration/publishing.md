---
id: publishing
title: Documentation Publishing
sidebar_label: Publishing
description: How the ZPLC documentation is checked, built and deployed to GitHub Pages, and how to snapshot a release.
tags: [operations, docs, github-pages]
---

# Documentation Publishing

The ZPLC documentation is built with Docusaurus and deployed to GitHub Pages by GitHub Actions.
A change to a page is checked in two workflows before it is deployed.

## The checks and the deployment

### Every pull request and push: the `docs-and-truth` job of CI

The job of `.github/workflows/ci.yml` runs the page validator and its tests, the
generated-reference checks, the documentation-claim and runnable-sample checks, and the
site build:

1. `python3 tools/docs/validate_docs_pages.py` refuses a page that ends mid-sentence, a
   page that is not in the sidebar, and an English page that has no Spanish twin of the
   same structure (or the reverse).
2. `bun tools/docs/check_doc_claims.ts` checks that the files, commands and options that
   a page names exist.
3. `bun tools/docs/check-docs-samples.ts` compiles each `runnable` sample and runs the
   ones that state a result.
4. `bun run docs:generate` and `git diff --exit-code -- docs/docs docs/i18n` fail when a
   generated page differs from what its generator writes.
5. `bun run docs:build` builds the site. Docusaurus is configured with
   `onBrokenLinks`, `onBrokenAnchors` and `onBrokenMarkdownLinks` set to `throw`, so a
   broken internal link or a link to a heading that no longer exists fails the build.

The tests of `tools/docs` (`bun test ./tools/docs`) run in CI as well: they hold the
configuration fragments, the screenshot manifest and the claims about capabilities.

### Pull requests that touch the documentation: **Deploy Documentation**

`.github/workflows/deploy-docs.yml` runs on a pull request or a push to `main` (or
`master`) that changes `docs/`, `tools/docs/`, `tools/hil/validate_docs_parity.py`, the
core headers or `firmware/app/boards/boards.json`. It installs the dependencies,
generates and validates the references (`bun run generate:docs` and
`bun run validate:docs` in `docs/`), builds the site and uploads `docs/build` as an
artifact.

### Pushes to `main`: deployment

On a push to `main` (or `master`), or when started by hand, a second job deploys that
artifact to the `github-pages` environment. A pull request never deploys.

## Release procedure

To publish new documentation:

1. Make your changes in a feature branch.
2. Run `bun run check:docs` from the root of the repository. It runs the checks above
   and builds the site, so a defect shows before the pull request does.
3. Open a pull request.
4. Wait for the `docs-and-truth` job of CI and the `build` job of **Deploy Documentation**
   to pass.
5. Merge the pull request. GitHub Actions deploys `docs/build` to GitHub Pages.

## Versioning a release

When the ZPLC project reaches a release milestone (for example, `v2.0.0`), take a
snapshot of the documentation. The site publishes one version, with no version selector,
until the first snapshot exists (`docs/versions.json` is empty).

1. Create a branch for the release.
2. Run `cd docs && bun run docusaurus docs:version 2.0.0`. It writes the English and the
   Spanish version.
3. Commit what the command wrote: `docs/versions.json`, the `versioned_docs` and
   `versioned_sidebars` folders of `docs/` and the `version-2.0.0` folder of
   `docs/i18n/es/docusaurus-plugin-content-docs/`.
4. Add the version selector (`type: 'docsVersionDropdown'`) back to the navbar items of
   `docs/docusaurus.config.js`, run `bun run check:docs`, and open the pull request.

## Rollback procedure

If a bad deployment reaches production:

1. Identify the commit of the last known good documentation state on the `main` branch.
2. Use `git revert <bad-commit-hash>` to undo the change.
3. Push the revert to `main` (or open a quick pull request). The pipeline rebuilds and
   deploys the previous working state.
