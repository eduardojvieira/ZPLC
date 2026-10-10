## What changes and why

<!-- One or two sentences. Link the issue, for example "Fixes #123". -->

## Layers touched

- [ ] C core, HAL or firmware
- [ ] Compiler or language
- [ ] Studio, CLI or MCP
- [ ] Binary contract (`tools/contract`)
- [ ] Documentation (English and Spanish)
- [ ] CI or tooling

## Checks run

<!-- The command and what it printed. See CONTRIBUTING.md for the command of each layer. -->

| Command | Result |
|---|---|
| `bun run test:ci` | |

## Evidence

<!-- Which level backs each claim: host, QEMU, target build, bench or manual.
     A lower level never proves a higher one. -->

## Checklist

- [ ] A test fails without this change, or I explain why none applies.
- [ ] Documentation changed in English and Spanish together.
- [ ] No new dependency, or the justification is in this description.
- [ ] Outputs keep a documented safe/off default, and nothing resumes control by itself.
- [ ] If the binary contract changed, the draft counter went up and `bun run contract:check` passes.
- [ ] The change starts no physical operation (flash, deploy, force, RUN/STOP).
- [ ] Commits follow Conventional Commits.
