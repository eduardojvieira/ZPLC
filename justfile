# The task runner of this repository is `bun run <recipe>` (package.json); CONTRIBUTING.md
# lists every recipe. These are thin aliases for people who prefer `just`.

setup:
    bun run setup

test:
    bun run test:ci

docs:
    bun run check:docs

release-validate:
    bun run release:rehearsal
