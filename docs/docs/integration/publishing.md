---
id: publishing
title: Documentation Publishing
sidebar_label: Publishing
description: How the ZPLC documentation is checked, built and deployed to GitHub Pages, and how to snapshot a release.
tags: [operations, docs, github-pages]
---

# Documentation Publishing

The documentation is built with Docusaurus and deployed to GitHub Pages by GitHub Actions. This page tells you what checks a page change must pass, how it reaches the site, how to snapshot a release and how to roll a bad deployment back.

## Check a change before you open the pull request

Run this once from the repository root:

```bash
bun run check:docs
```

It is the whole chain that CI splits over two workflows: the generators in `--check` mode, the claim checks, the page validator, the runnable samples, the configuration fragments, the screenshot manifest, the site build and the search index. A defect shows here before it shows in review.

## What CI runs

### Every pull request and push: CI

- **`bun test ./tools/docs`** holds the tests of the generators and of the checks, among them the configuration fragments, the screenshot manifest and the claims about capabilities (`check_capability_claims.ts`).
- **The `docs-and-truth` job** of `.github/workflows/ci.yml` runs these in order:
  1. `python3 tools/docs/validate_docs_pages.py` refuses a page that ends mid-sentence, a page that is not in the sidebar, and an English page whose Spanish twin has a different structure (or the reverse).
  2. The `--check` mode of the generators for the known limits, the function reference, the source references and the language reference: a generated page that differs from what its generator writes fails.
  3. `bun tools/docs/check_doc_claims.ts` checks that the files, commands and options a page names exist.
  4. `bun tools/docs/check-docs-samples.ts` compiles each `runnable` sample and runs the ones that state a result.
  5. `bun run docs:generate`, `bun run docs:validate` and `git diff --exit-code -- docs/docs docs/i18n` regenerate every reference and fail if anything changed.
  6. `bun run docs:build` builds the site. Docusaurus is configured with `onBrokenLinks`, `onBrokenAnchors` and `onBrokenMarkdownLinks` set to `throw`, so a broken internal link, or a link to a heading that no longer exists, fails the build.

### Changes under `docs/`: Deploy Documentation

`.github/workflows/deploy-docs.yml` runs on a pull request, a push or a manual start when the change touches `docs/`, `tools/docs/`, `tools/hil/validate_docs_parity.py`, the core headers or `firmware/app/boards/boards.json`. It regenerates and validates the references, builds the site and uploads `docs/build` as an artifact.

### Pushes to the main branches: deployment

On a push to `master`, `main` or `zplc-2.0-candidate`, or when started by hand, a second job deploys that artifact to the `github-pages` environment, at `https://eduardojvieira.github.io/ZPLC/`. A pull request never deploys.

## Publish new documentation

1. Make your change in a feature branch, in English and Spanish together.
2. Run `bun run check:docs`.
3. Open a pull request, and wait for the `docs-and-truth` job of CI and the build job of Deploy Documentation to pass.
4. Merge it. The deploy job publishes the site.

## Retire or rename a page

A page that has been published keeps its address. When you merge or remove one, add an entry to the `redirects` list of `@docusaurus/plugin-client-redirects` in `docs/docusaurus.config.js`. The plugin runs once per language, so one entry covers both. The list holds the seven pages the 2.0 rewrite merged or retired.

## Snapshot a release

The site publishes a single version, with no version selector, until the first snapshot exists (`docs/versions.json` is empty). To take the snapshot for a release such as `2.0.0`:

1. Create a branch for the release.
2. Run `cd docs && bun run docusaurus docs:version 2.0.0`. It writes the English and the Spanish version.
3. Commit what the command wrote: `docs/versions.json`, the `versioned_docs` and `versioned_sidebars` folders of `docs/`, and the `version-2.0.0` folder of `docs/i18n/es/docusaurus-plugin-content-docs/`.
4. Add the version selector (`type: 'docsVersionDropdown'`) to the navbar items of `docs/docusaurus.config.js`, run `bun run check:docs`, and open the pull request.

## Roll back a bad deployment

1. Find the commit of the last good documentation on the deployed branch.
2. Run `git revert <bad-commit-hash>`.
3. Push the revert, or open a quick pull request. The pipeline rebuilds and deploys the previous state.
