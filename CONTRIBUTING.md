# Contributing to ZPLC

Thank you for helping. ZPLC runs near machines, so a change is judged by what it
proves as well as by what it does. This page gets you from a fresh clone to a
checked change: set-up, build, the test command of each layer with how long it
takes, and how to send the result.

- Contributions target `master`. Issues and pull requests may be in English or
  Spanish.
- Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Vulnerabilities go to a
  private advisory: [SECURITY.md](SECURITY.md).
- How the repository fits together: [ARCHITECTURE.md](ARCHITECTURE.md). The rules
  a change must respect, in plain language: [Engineering principles](docs/docs/contributing/principles.md).

## What you need

| Tool | Version | Needed for |
|---|---|---|
| [Bun](https://bun.sh) | 1.3.14 (the version CI uses) | Everything TypeScript, and the task runner |
| CMake and a C99 compiler (gcc or clang) | CMake 3.20 or newer | The C core and the native runtime |
| Python | 3.10 or newer | The generators, validators and the firmware method |
| Node.js | 20 | The documentation site build and `bun run release:rehearsal` |
| Zephyr SDK | 1.0.1 | The firmware layer only; `tools/firmware-test/setup.sh` creates the workspace and `west` and tells you when the SDK is missing |
| A display | X11 or Wayland | The Studio journeys only |

The commands below are written for Linux and macOS shells. Windows contributors
should use WSL 2 for the firmware layer.

## Set up

```bash
git clone https://github.com/eduardojvieira/ZPLC.git
cd ZPLC
bun run setup
```

`bun run setup` installs the locked dependencies, builds the compiler and builds
the native runtime. That is everything the TypeScript and C layers need. Run
`bun run` with no argument to list every recipe.

## One task runner

The entry point is `bun run <recipe>` at the repository root; `package.json`
holds the recipes, and CI calls the same ones. The `justfile` only forwards to
them.

| Recipe | What it does |
|---|---|
| `setup` | Install dependencies, build the compiler, build the native runtime |
| `build:runtime` | Build the native runtime into `firmware/lib/zplc_core/build/zplc_runtime` |
| `build:compiler`, `build:ide` | Build the compiler package, or typecheck and bundle Studio |
| `test:core` | C suites under the address and undefined-behaviour sanitizers |
| `test:compiler:ci`, `test:ide:ci`, `test:ci` | TypeScript suites, judged against the list of expected failures |
| `test:journeys` | Studio end-to-end journeys on the real application |
| `setup:firmware`, `test:firmware` | Firmware suites on Linux (Zephyr) |
| `contract:check` | The generated binary contract is in step with its source |
| `simulate <project>` | Run a project's scenario tests on the native runtime |
| `dev` | Run Studio in development mode against the native runtime |
| `docs:start`, `check:docs` | Serve the site, or generate, validate and build it |
| `release:rehearsal` | The checks the release workflow runs before it builds anything |

## Build

```bash
bun run build:runtime      # native runtime, about 5 s
bun run build:compiler     # compiler package, about 1 s
bun run build:ide          # typecheck and bundle Studio, about 40 s
```

`build:runtime` is these two commands, in case you do not have Bun yet:

```bash
cmake -S firmware/lib/zplc_core -B firmware/lib/zplc_core/build -DCMAKE_BUILD_TYPE=Release
cmake --build firmware/lib/zplc_core/build --target zplc_runtime --parallel
```

Studio finds the runtime at `firmware/lib/zplc_core/build/zplc_runtime`, or at
the path in `ZPLC_NATIVE_SIM_BIN`. The runtime is the simulator: it runs the same
core as the board, on your computer.

## Test, layer by layer

Run the command of every layer you touched before you open a pull request. The
times were measured on a 12-thread Linux x86-64 desktop with warm caches.

| Layer | Command | Typical time | What a pass shows | What it does not show |
|---|---|---|---|---|
| C core, loader, host runtime | `bun run test:core` | about 5 s | The C suites pass with the address and undefined-behaviour sanitizers on a 64-bit host | Behaviour on a 32-bit target or a board |
| Compiler and assembler | `bun run test:compiler:ci` | about 2 s | The compiler tests pass and every failure is a listed one | Behaviour of the generated code in the VM |
| Studio, CLI, MCP, conformance | `bun run test:ide:ci` | 30 to 60 s | Compiled programs run in the real VM and give the expected memory; Studio logic and the Tool API behave | A rendered screen in the real application |
| Lint and types | `bun run lint` and `bun run build:ide` | about 10 s and 40 s | ESLint is clean and the TypeScript projects build | Behaviour |
| Binary contract | `bun run contract:check` | about 1 s | Generated C, TypeScript, Python and docs files match `contract.json`, and the golden numbers hold | Anything outside the contract |
| Studio on the real application | `bun run test:journeys` | 70 to 90 s | The end-to-end journeys pass in Electron: open, edit, build, simulate, watch, break, force, save | A physical board |
| Firmware on Linux | `bun run test:firmware` (after `bun run setup:firmware`) | about 4 min; set-up about 6 min once | The Zephyr suites pass on `native_sim` (64 and 32 bit) and QEMU Cortex-M3 and M0, and every image is inside its flash and RAM budget | Timing, interrupts and drivers of a real board |

Notes that save time:

- **Expected failures.** Some conformance cases fail today on purpose: they are
  the open work for the language, and each is listed in
  `tools/ci/expected-failures.json` with the requirement that will fix it.
  `bun run test:ide` therefore exits 1. `bun run test:ide:ci` is the check that
  matters: it passes when every failure is listed, and fails on any other failure
  and on a listed case that now passes (remove its entry then).
- **One file or one case.** `bun test <path>` inside `packages/zplc-ide` or
  `packages/zplc-compiler` runs one file. `ZPLC_JOURNEY_ONLY=<text> bun run
  test:journeys` runs the journeys whose name contains the text.
- **Journeys** use `packages/zplc-ide/node_modules/electron/dist`. If it is
  missing, run `node packages/zplc-ide/node_modules/electron/install.js`, then
  `bun run --cwd packages/zplc-ide build`, `build:assets` and `electron:compile`.
- **Firmware** modes can be run one at a time, for example
  `tools/firmware-test/run.sh native`. [Firmware testing](docs/docs/development/firmware-testing.md)
  explains each mode and the size budgets.
- **Evidence levels.** Host, QEMU, target build, bench and manual results are
  different levels, and a lower one never proves a higher one. Name the level in
  your pull request.

## Simulate

```bash
bun run simulate packages/zplc-ide/projects/motor_plant
```

This runs the project's scenario tests on the native runtime, headless, in under a
second, and prints `test passed` or the failing assertion. To work in the
application instead, `bun run dev` builds the runtime and starts Studio in
development mode (it needs a display). Studio's **Simulate** mode uses the same
runtime.

## Documentation

```bash
bun run docs:start         # serve the site with live reload
bun run check:docs         # generate, validate and build English and Spanish, about 20 s
```

`check:docs` regenerates the reference pages from the C headers and the board
manifest, fails on a page that stops mid-sentence, is missing from the sidebar or
whose Spanish twin has a different structure, and builds both languages. Links
between pages are relative `.md` paths. A user-visible change updates
`docs/docs/` and `docs/i18n/es/` in the same pull request.

## Release rehearsal

```bash
bun run release:rehearsal  # about 10 s
```

It runs, without building any installer, what the release workflow checks first:
that every package carries the same version, the release helpers and the
integrity bundle, the workflow action pins, the release evidence and board
manifest validators, the repository hygiene audit and the contract check.
Installers are built by the release workflow; to package Studio on your own
machine use `bun run --cwd packages/zplc-ide electron:build:linux` (or `:mac`,
`:win`).

## Make a change

1. Branch from `master` and keep the change to one purpose.
2. Write the test first and watch it fail for the right reason. Test behaviour:
   compile a program, load it into the VM, render the screen. Do not assert on
   source text.
3. Make the change, then run the command of each layer you touched.
4. Update the English and Spanish documentation together when a claim, a
   workflow or a limitation changes.
5. Commit with [Conventional Commits](https://www.conventionalcommits.org), one
   work unit per commit with its tests and docs.
6. Open the pull request with its template: the commands you ran, what they
   printed, and the evidence level behind each claim.

Things that need a reason on the pull request: a new dependency (a concrete need
and a recorded decision), a change to the binary contract (raise the draft
counter, see
[Changing the binary contract](docs/docs/contributing/index.md#changing-the-binary-contract)),
and anything that changes an output's safe or off default.

## Rules that do not bend

- Outputs default to a documented safe state, and a reboot, timeout, fault or
  invalid program never resumes control by itself.
- Build firmware, flash, deploy a program and run or debug are separate
  operations, each with its own evidence, and a person starts each physical one.
  Do not publish, flash hardware, deploy a PLC program or actuate equipment
  without explicit authorization.
- The renderer is unprivileged and every IPC request is validated.
- AI and MCP never flash, deploy, force I/O, change RUN or STOP, open raw serial
  or run a shell.

## Reporting a problem

Open an issue from a template:

- **Bug report** for something that does not behave as documented.
- **Board report** for what happened when you built, flashed or ran ZPLC on a
  board, working or not. Name the exact board and firmware; one bench is a lead,
  not a qualification.

Questions and ideas are welcome in Discussions. Do not put credentials, tokens or
device identifiers in anything public.

## Roadmap

No dates: a phase closes when its checks pass. The full page, with what each
phase delivers, is [Roadmap](docs/docs/contributing/roadmap.md).

- **Done:** CI on the 2.0 line with one list of expected failures; the
  conformance suite; Studio stopgaps for lost work and compiler messages; the
  release pipeline; truthful public text in two languages; the firmware test
  method on Linux; one generated source for the binary contract with a draft
  counter; numeric and visual-language corrections in the compiler.
- **Next:** the rest of the verification foundation (sandbox closure, a loader
  fuzzer, opcode coverage, render tests for Studio), then Structured Text that is
  correct across a whole project.
- **Later:** a new shell and five working languages; Learn in simulation; runtime
  trust and the first board, the Raspberry Pi Pico; communications and the second
  board, the ESP32-S3; the complete language and course; distribution,
  documentation and accessibility; general availability.

## Where things are

| You are looking for | It is in |
|---|---|
| PLC example projects to open in Studio | [`packages/zplc-ide/projects/`](packages/zplc-ide/projects/) |
| VM assembly fixtures used by the C tests | [`examples/`](examples/README.md) |
| Language conformance programs | [`conformance/`](conformance/) |
| The documentation site, English and Spanish | `docs/docs/` and `docs/i18n/es/` |
| Versioning rules | [VERSIONING.md](VERSIONING.md) |
| What changed | [CHANGELOG.md](CHANGELOG.md) |
