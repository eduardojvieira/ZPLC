# Conformance cases

Each case compiles a program with the repository compiler, loads it into the real C VM through the loader, runs it for a stated number of scans on the virtual clock of the native POSIX runtime, and compares values read from VM memory with the ones the case expects. A program that must be refused is a case too: it asserts that no artifact is produced.

A case is two files in this directory tree, with the same name:

```
conformance/cmp/cmp-011-int-divide-negative.st             the program
conformance/cmp/cmp-011-int-divide-negative.expect.json    how to run it and what to expect
```

Adding a case never touches test code: `packages/zplc-ide/src/conformance/conformance.test.ts` finds every `*.expect.json`, pairs it with the source beside it and registers one test named `<requirement> <title>`.

## Write a case

1. Write the program. Give every value you want to check a direct address (`AT %QW0`, `AT %QX0.0`, `AT %QD0`...), because the debug map is itself under test. The language comes from the extension: `.st`, `.il`, `.ld.json`, `.fbd.json` or `.sfc.json`. The number of a word or double word address counts words and double words, not bytes: `%QW4` is bytes 8 and 9 and `%QD1` is bytes 4 to 7, so `%QD1` and `%QW2` overlap.
2. State the **correct** value in the `.expect.json`, even if the compiler gets it wrong today. A case that is green on a baseline with a known defect measures nothing. Cite the rule that makes the value right (the IEC 61131-3 table, or the requirement) in `note`.
3. Name it after the requirement that fixes it (or that it protects): `cmp-011-...` and `"requirement": "CMP-011"`.
4. Name the rows of the conformance matrix (below) that it is evidence for, in `matrix`.
5. Run it. If it fails because of a known defect, add it to `tools/ci/expected-failures.json` (see below). A case that passes needs nothing else.

The first scan runs at 0 ms and each next one `scanMs` later, so scan 6 of a 10 ms task is at 50 ms.

### Expectation of a program that runs

```json
{
  "requirement": "CMP-011",
  "title": "INT division of a negative operand",
  "scans": 1,
  "scanMs": 10,
  "inputs": [{ "at": "%IX0.0", "type": "BOOL", "value": true, "beforeScan": 2 }],
  "expect": [{ "at": "%QW0", "type": "INT", "value": -4, "afterScan": 1 }]
}
```

| Key | Meaning |
|---|---|
| `requirement`, `title` | The test is named `<requirement> <title>`. The pair must be unique. |
| `matrix` | The rows of `conformance/matrix.json` this case is evidence for, such as `["data-types.dint"]`. An id that the matrix does not have is an error. |
| `tags` | `arch-sensitive` for a result that could differ between a 64-bit host, a 32-bit host and a Cortex-M3 under QEMU, and with it why: `division`, `shifts`, `float`, `float-conversion`, `64-bit`, or `alignment`, which also selects the case for the Cortex-M0 (VF-005). |
| `note` | Why the expected value is right: the IEC rule it cites, or the contract of the requirement. |
| `scans`, `scanMs` | How many scans to run and the task interval in milliseconds. |
| `inputs` | Values written to the input image before a scan (`beforeScan`, default 1); they stay until changed. `at` is a `%I` address. |
| `expect` | Values read after a scan (`afterScan`, default the last one). `at` is a `%I`, `%Q` or `%M` address; `var` names a variable instead and reads it where the debug map says it is (use it only to test the map). |
| `fault` | `true` if the last scan must end in a VM fault. |
| `files` | Further source files in the same folder that the program needs (a function block or a global declared in another file). They are not cases of their own. |
| `tasks` | The tasks of the generated `zplc.json`, for a project of more than one program: `{ "name", "trigger", "interval_ms", "priority", "programs" }`, where `programs` names `main.<extension>` (the program of the case) and the entries of `files`. Without it, one cyclic task at the scan interval runs the program. |

`type` is one of `BOOL`, `SINT`, `INT`, `DINT`, `USINT`, `UINT`, `UDINT`, `BYTE`, `WORD`, `DWORD`, `REAL`, and its width must match the address (`INT` with `%QW0`, `REAL` with `%QD0`, `BOOL` with `%QX0.0`). A misspelled key, a value that does not fit its type or a source file without an expectation is an error when the cases load, so nothing is silently skipped.

### Expectation of a program that must not build

```json
{ "requirement": "CMP-001", "title": "an assignment to an undeclared variable is rejected", "build": "fails", "lines": [5] }
```

The build must fail and produce no artifact. `lines` (optional) lists the line of each diagnostic, `columns` (optional, one for each line) their columns, `codes` (optional, one for each diagnostic) their codes, and `messageIncludes` (optional) the words a diagnostic message must contain. `elements` (optional, one for each diagnostic) names the element of a diagram or IL source that each diagnostic is about (LNG-003): `rung:r1/cell:0,1`, `rung:r1/element:c1`, `block:and1`, `connection:w2`, `step:s_a`, `transition:t1`, `action:mark` or `line:7`; a case that lists it asserts that every diagnostic has one. `files`, `tasks`, `matrix`, `tags` and `note` work as above.

VF-003 asks a negative case to assert the diagnostic code and its position, and every negative case does: `codes` lists the stable code of each diagnostic (CMP-006), from the registry of the compiler, `packages/zplc-compiler/src/compiler/error-codes.ts`, which the reference page [Diagnostic codes](../docs/docs/reference/diagnostic-codes.md) is generated from. A code names the kind of problem, never the sentence, so a message may be reworded and the case still holds. The case asserts the position (`lines`, `columns`) and, where the requirement says the message names the construct (CMP-003) or what ran out (CMP-043), the words.

## Which defect a case shows

VF-004 asks for one case for every defect that the review lists under "Current failures" of CMP, LNG and RT and that a program can show on a host. `defects.json` lists those defects (the spec may be untracked, so CI cannot read them from it), each with the requirements that fix it and the evidence that shows it: the cases, another executed test, the reason that no program shows it, or the mark that it is still open. `defect-map.md` is generated from it:

```
bun tools/ci/conformance-defects.ts --write      # regenerate defect-map.md
bun tools/ci/conformance-defects.ts --check      # CI: the list is well formed and the map is current
```

A new case that shows a listed defect is named in that defect's `cases`, and its requirement must be one of the requirements that fix it. A defect that is open gets its case the day the behaviour is fixed, and its entry changes from `open` to `cases` in the same commit.

## Run the cases

The cases need the native POSIX runtime, built out of the repository tree:

```
cmake -S firmware/lib/zplc_core -B /path/to/zplc-native-sim-build
cmake --build /path/to/zplc-native-sim-build --target zplc_runtime
export ZPLC_NATIVE_SIM_BIN=/path/to/zplc-native-sim-build/zplc_runtime
bun run test:ide          # everything
cd packages/zplc-ide && bun test src/conformance          # only the cases
```

Without the binary the cases that run a program are skipped on a developer machine; with `CI` set they fail. Cases that must not build never need it.

`ZPLC_CONFORMANCE_ROOT=<folder> bun test src/conformance/conformance.test.ts` runs the cases of another folder instead of this one. `packages/zplc-ide/src/conformance/addCase.test.ts` uses it to prove VF-002: a folder that holds only a source file and an expected-values file is a case the runner finds, runs and judges, with no edit to test code.

`ZPLC_CONFORMANCE_TAGS=arch-sensitive,alignment bun test src/conformance` runs only the cases that carry one of the tags, which is how the firmware test method selects the architecture-sensitive subset (VF-005). `bun tools/ci/conformance-coverage.ts --tag alignment` lists those cases, one path for each.

### On a 32-bit host

Build the same runtime with `-m32` and run the same cases; every case must give the result that the 64-bit build gives (VF-005):

```
cmake -S firmware/lib/zplc_core -B /path/to/zplc-native-sim-build32 -DCMAKE_C_FLAGS=-m32
cmake --build /path/to/zplc-native-sim-build32 --target zplc_runtime
ZPLC_NATIVE_SIM_BIN=/path/to/zplc-native-sim-build32/zplc_runtime bun run test:ide
```

The sanitized builds of `tools/firmware-test/run.sh host` and `host32` use the same flags. QEMU runs of the tagged cases belong to the firmware test method and are not part of this runner.

### The artifact is accepted by the loader (CMP-051)

Every case that builds loads the artifact through the loader of the runtime before it runs. `CMP-051 the loader accepts every artifact the compiler produced for a conformance case` counts what the loader accepted and refused over the whole run and fails on one refusal, so a compiler that produces something the loader will not take is red even when the case that produced it asserts nothing else.

## The conformance matrix

`conformance/matrix.json` is section 6 of the 2.0 remediation spec as a tracked file: one row for each element, with its state today, its 2.0 target (`works`, `rejects`, or `decision` for the elements left to decision D-04 whose recommendation is to reject them with a message), the requirements it maps to, the architecture tags and the cases that cover it. The suite, the language reference (DOC-006) and the progress counts read this file, not the spec.

```
bun tools/ci/generate-conformance-matrix.ts          regenerate from section 6 (--spec <file> when the spec is elsewhere)
bun tools/ci/generate-conformance-matrix.ts --check  fail when the file is not what section 6 generates (only its shape when the spec is absent)
bun tools/ci/conformance-coverage.ts                 rows by target, rows without a case that counts, cases by tag
bun tools/ci/conformance-coverage.ts --list          every row without a case, with the requirement that will close it
bun tools/ci/conformance-coverage.ts --write         write the "cases" of every row from the `matrix` lists of the cases
bun tools/ci/conformance-coverage.ts --check         CI: the file lists the cases the tree has, and every row has what it needs
```

A row that must work needs a case that builds and runs and is not on the expected-failure list. A row that 2.0 rejects, or leaves to D-04, needs a case that must not build. A row that has none is listed in `conformance/matrix-gaps.json` with the requirement that will close it and the reason, and the entry fails the check the day the row gets its case, so the list can only shrink. A case that is on the expected-failure list does not count: it does not pass.

## Known defects: the expected-failure list

A case that fails because of a defect the project already knows is listed in `tools/ci/expected-failures.json` with the requirement that will fix it:

```json
{ "test": "packages/zplc-ide/src/conformance/conformance.test.ts > conformance > CMP-011 INT division of a negative operand", "requirement": "CMP-011", "added": "2026-10-09", "reason": "..." }
```

CI stays green while the listed cases fail and goes red for any other failure. When a repair makes a listed case pass, CI goes red until the entry is removed, so the list can only shrink. `bun tools/ci/check-expected-failures.ts` explains the rule; the id to copy is printed by its "unlisted failure" message.

## What no case shows yet

- **Security-sensitive defects** are not committed as reproducible cases: the communication function-block opcodes that reach outside the VM memory (RT-001, RT-002) and the integer division that stops the host runtime (RT-005). Their reproductions stay out of the repository until the repairs are merged. A defect that fails cleanly with a wrong value is a normal case.
- **Results nobody has defined yet**: overflow, negation and ABS of the most negative integer, REAL to integer out of range (CMP-016). There is no correct value to state.
- **A target**: the QEMU runs of the tagged cases (VF-005) and the rest of RT-005.
- **A project of more than one program, beyond two tasks**: a global shared by several tasks (CMP-042), `%M` across a project (CMP-044), libraries (CMP-046). The order in which tasks of one interval run needs a global that both read, so it has no case yet.
- **The twelve communication and cloud blocks** (COM-006): they need a protocol double that the runner does not start.
- **A hand-built artifact**: stack verification and endianness in the loader (RT-003, RT-004).
- **Something other than a program**: the editors, breakpoints and monitoring (LNG-001, LNG-003 to LNG-016, LNG-027), warnings (CMP-008, no channel to read them), project options (CMP-059), the assembler and opcode tables (CMP-048, CMP-049, CMP-052, CMP-060), the build identity (CMP-056, not defined yet), source hygiene (CMP-061).
- **A run that would not return**: an unknown IL mnemonic makes the parser loop forever (LNG-017). Running it here would hang the whole test run; it needs a child process with a time limit.
- **The firmware**: the scheduler, watchdog, retained memory, program store and threads (RT-008 to RT-031) belong to Zephyr, QEMU and the boards. RT-006 and RT-007 are shown by the two RT cases.
