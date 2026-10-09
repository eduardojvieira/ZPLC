# Conformance cases

Each case compiles a program with the repository compiler, loads it into the real C VM through the loader, runs it for a stated number of scans on the virtual clock of the native POSIX runtime, and compares values read from VM memory with the ones the case expects. A program that must be refused is a case too: it asserts that no artifact is produced.

A case is two files in this directory tree, with the same name:

```
conformance/cmp/cmp-011-int-divide-negative.st             the program
conformance/cmp/cmp-011-int-divide-negative.expect.json    how to run it and what to expect
```

Adding a case never touches test code: `packages/zplc-ide/src/conformance/conformance.test.ts` finds every `*.expect.json`, pairs it with the source beside it and registers one test named `<requirement> <title>`.

## Write a case

1. Write the program. Give every value you want to check a direct address (`AT %QW0`, `AT %QX0.0`, `AT %QD0`...), because the debug map is itself under test. The language comes from the extension: `.st`, `.il`, `.ld.json`, `.fbd.json` or `.sfc.json`.
2. State the **correct** value in the `.expect.json`, even if the compiler gets it wrong today. A case that is green on a baseline with a known defect measures nothing.
3. Name it after the requirement that fixes it (or that it protects): `cmp-011-...` and `"requirement": "CMP-011"`.
4. Run it. If it fails because of a known defect, add it to `tools/ci/expected-failures.json` (see below). A case that passes needs nothing else.

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
| `scans`, `scanMs` | How many scans to run and the task interval in milliseconds. |
| `inputs` | Values written to the input image before a scan (`beforeScan`, default 1); they stay until changed. `at` is a `%I` address. |
| `expect` | Values read after a scan (`afterScan`, default the last one). `at` is a `%I`, `%Q` or `%M` address; `var` names a variable instead and reads it where the debug map says it is (use it only to test the map). |
| `fault` | `true` if the last scan must end in a VM fault. |
| `files` | Further source files in the same folder that the program needs (a function block or a global declared in another file). They are not cases of their own. |

`type` is one of `BOOL`, `SINT`, `INT`, `DINT`, `USINT`, `UINT`, `UDINT`, `BYTE`, `WORD`, `DWORD`, `REAL`, and its width must match the address (`INT` with `%QW0`, `REAL` with `%QD0`, `BOOL` with `%QX0.0`). A misspelled key, a value that does not fit its type or a source file without an expectation is an error when the cases load, so nothing is silently skipped.

### Expectation of a program that must not build

```json
{ "requirement": "CMP-001", "title": "an assignment to an undeclared variable is rejected", "build": "fails", "lines": [5] }
```

The build must fail and produce no artifact. `lines` (optional) lists the line of each diagnostic and `messageIncludes` (optional) the words a diagnostic message must contain. Until the compiler has diagnostic codes (CMP-006) these are all there is to assert.

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

## Known defects: the expected-failure list

A case that fails because of a defect the project already knows is listed in `tools/ci/expected-failures.json` with the requirement that will fix it:

```json
{ "test": "packages/zplc-ide/src/conformance/conformance.test.ts > conformance > CMP-011 INT division of a negative operand", "requirement": "CMP-011", "added": "2026-10-09", "reason": "..." }
```

CI stays green while the listed cases fail and goes red for any other failure. When a repair makes a listed case pass, CI goes red until the entry is removed, so the list can only shrink. `bun tools/ci/check-expected-failures.ts` explains the rule; the id to copy is printed by its "unlisted failure" message.

## What no case shows yet

- **Security-sensitive defects** are not committed as reproducible cases: the communication function-block opcodes that reach outside the VM memory (RT-001, RT-002) and the integer division that stops the host runtime (RT-005). Their reproductions stay out of the repository until the repairs are merged. A defect that fails cleanly with a wrong value is a normal case.
- **Results nobody has defined yet**: overflow, negation and ABS of the most negative integer, REAL to integer out of range (CMP-016). There is no correct value to state.
- **A second build or a target**: the 32-bit and QEMU runs (VF-005) and the rest of RT-005.
- **More than one program or task**: a global shared by several tasks (CMP-042), `%M` across a project (CMP-044), libraries (CMP-046), task configuration (CMP-047).
- **A hand-built artifact**: stack verification and endianness in the loader (RT-003, RT-004).
- **Something other than a program**: the editors, breakpoints and monitoring (LNG-001, LNG-003 to LNG-016, LNG-027), warnings (CMP-008, no channel to read them), project options (CMP-059), the assembler and opcode tables (CMP-048, CMP-049, CMP-052, CMP-060), the build identity (CMP-056, not defined yet), source hygiene (CMP-061).
- **A run that would not return**: an unknown IL mnemonic makes the parser loop forever (LNG-017). Running it here would hang the whole test run; it needs a child process with a time limit.
- **The firmware**: the scheduler, watchdog, retained memory, program store and threads (RT-008 to RT-031) belong to Zephyr, QEMU and the boards. RT-006 and RT-007 are shown by the two RT cases.
