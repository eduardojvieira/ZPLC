# Changelog

All notable changes are documented here.

## Unreleased

- CI fails when a test reads the text of a product source file or asserts on the
  assembly the compiler emitted (VF-006): a guard (`tools/ci/test-source-guard.ts`)
  lists every test that reads Studio, Electron, script, firmware or workflow
  source, or matches generated assembly text outside the assembler's own tests,
  and `tools/ci/pinned-source-offenders.json`
  records the known ones with the requirement and the kind of replacement for
  each. The list can only shrink. Six source-text assertions are now behaviour
  tests (the compiler version, the store's state, the Learn lesson catalog, the VM
  error table against the generated contract, the native program limit, and a
  scenario that becomes a named pipe).
- `clang-tidy` runs in CI with a configuration file, `.clang-tidy`, and warnings
  are errors (VF-018): over the core, the POSIX HAL and the host application on
  every push, and over the Zephyr HAL and `firmware/app` with
  `tools/firmware-test/run.sh tidy` when a board build exists. Findings fixed:
  an unchecked `signal()` in the host runtime now reports a handler that was not
  installed; the pointer offsets of the loader, the VM and the program store are
  computed in `size_t`; the unchecked results of `snprintf`, `fclose` and `fflush` in the
  HALs are discarded on purpose; a `strcpy` that was bounded by a check before it
  is now a `memcpy` of the same length. `-Werror` now also applies to the ZPLC
  Zephyr library.
- A code sample in the docs whose fence says `runnable` is compiled in CI, and
  executed when it states an expected result (VF-020). The three Structured Text
  and Instruction List samples of the language pages are marked, in English and
  Spanish, and the convention is on the Contributing page.
- The loader refuses a program whose calls nest deeper than the call stack of
  the VM (`ZPLC_CALL_STACK_MAX`, 32 by default, 16 on the ESP32-S3 profile)
  with `ZPLC_LOADER_ERR_STACK`, instead of accepting it and ending the scan
  with the VM fault `CALL_OVERFLOW`. Programs of the conformance suite nest at
  most two calls deep.
- `STRCMP` places the strings it compares, header and characters, before it
  reads the first character, as `STRCPY` and `STRCAT` do, and ends the scan
  with the VM fault `OUT_OF_BOUNDS` when a string's length reaches past the
  end of its memory region; it used to read the characters one by one across
  the boundary into the next region (input to output image, output image to
  work memory, work to retentive memory). Strings that fit compare as before.
- The memory regions of the VM are their windows of the address space
  (`0x2000` to `0x3FFF` work, `0x4000` to `0x4FFF` retentive), whatever
  `CONFIG_ZPLC_WORK_MEMORY_SIZE` and `CONFIG_ZPLC_RETAIN_MEMORY_SIZE` are. A
  work memory above 8 KB used to take over the addresses of retentive memory
  (a retentive variable was silently not retentive) and a retentive memory
  above 4 KB made the code window readable; the bytes beyond a window are now
  unreachable, and the loader and the VM agree on it.
- The loader's stack-effect verifier now keeps to its work bound: the budget of
  `ZPLC_VERIFY_STEPS_PER_BYTE` units per CODE byte also pays for the bitmap
  scans and the frame lookups, which it did not, so a crafted artifact can no
  longer keep a load (or the boot-time check of a stored program) busy for
  minutes. A walk of a subroutine scans only the span of code it reaches, and a
  frame that calls many subroutines finds them all in one walk. Compiled
  programs are unaffected (they use a few percent of the budget); an artifact
  that needs more work than its bound is refused with `ZPLC_LOADER_ERR_STACK`.
- `bun run typecheck` type-checks every TypeScript program of the repository with
  strict flags, and CI runs it (VF-010): the Studio CLI and MCP server, the
  Electron host, the scripts, the tests of every package and the CI, contract
  and fuzz tooling were not checked before. A test fails when a TypeScript file
  or a tsconfig is left out of that list. `noUncheckedIndexedAccess` stays off:
  it would add about 1,000 errors (470 in Studio, 542 in the compiler) that each
  need a real narrowing.
- ESLint runs the type-aware rules `no-floating-promises` and
  `no-misused-promises` over the Studio, the Electron host, the CLI and the MCP
  server (VF-011), so an unhandled promise fails `bun run lint`. The 42
  findings are fixed: the Electron host now logs and exits when its start-up
  fails, and logs a renderer load that is refused, instead of idling or
  rejecting unobserved; every button and shortcut handler states with `void`
  that the handler reports its own failure.
- The CLI reports a rejected `symbols` command under the operation
  `symbols-list`, as its successful result does, instead of the value `symbols`
  that is not a Tool API operation. The saved-input identity of a host test run
  now covers every source the tasks use and its path; it covered only the
  last source of a project with several.
- The binary contract now carries a draft counter (CMP-052). Every artifact the
  compiler or assembler writes records it in header word 28, and the loader, the
  native runtime, the firmware shell and Studio refuse a program or a board on
  another draft and show both numbers. Programs must be rebuilt and boards
  reflashed after upgrading from 2.0.0-rc.3.
- The binary contract tables (opcodes, container constants, block layouts) are
  generated from one source, `tools/contract/contract.json`.
- The compiler gives correct results for negative `SINT`/`INT`, unsigned
  comparison and division, `REAL` arithmetic with integer operands, `NOT` on
  `BYTE`/`WORD`, compound and fractional `TIME` literals and `TIME` over 24.8
  days; 64-bit multiply, divide, modulo and shifts are now build errors
  instead of wrong code.
- Pause, breakpoint and step on the Zephyr scheduler keep the output image and
  the force table and only drive the physical outputs to their safe state
  (RT-017); a paused or stepped target now shows the image of the scan that ran
  instead of zeros and no forces. Resume and step continue a scan that a
  breakpoint interrupted instead of restarting it, `STOP` returns every task to
  its entry point, and a breakpoint on the first instruction of a task is no
  longer skipped after a resume. Behaviour of `STOP` and of faults is unchanged:
  outputs safe, output image zeroed, forces cleared.
- The compiler stores and reads structure members, function-block members,
  enumerations and array elements at their declared width (a `DINT` member was
  read as one byte), copies whole structures and arrays, passes them to
  functions by value, and accepts structure initialisers `(x := 1)`, array
  initialisers with lists and repeat counts, negative and constant array
  bounds, arrays of structures and of `LINT`, `STRING[n]` and `Type#Value`.
- Every variable holds its declared initial value at the first scan, including
  `VAR_GLOBAL`, function-block members, structure fields and array elements.
  Function locals and `VAR_TEMP` are written again on every call, so a function
  holds no state. `VAR CONSTANT` and `VAR_GLOBAL CONSTANT` hold their value and
  an assignment to a constant is a build error.
- A `VAR_IN_OUT` of a function block is now passed by reference: the member
  holds the address of the caller's variable (4 bytes), and a block called
  without binding it faults. Rebuild programs that declare one.
- A constant array index outside the bounds is a build error and a variable
  index outside them ends the scan with the VM fault `OUT_OF_BOUNDS` (on by
  default; the option `arrayBoundsCheck: false` removes the check). `REF_TO`,
  `REF()` and `^` are type-checked, a `REF_TO` variable is `NULL` (`0xFFFF`)
  until it is assigned, and dereferencing it faults.
- String functions no longer modify their arguments: `LEFT`, `RIGHT`, `MID`,
  `CONCAT`, `INSERT`, `DELETE` and `REPLACE` return a new string, and `INSERT`,
  `DELETE`, `REPLACE`, `MID` and `FIND` now do what their names say. A string
  assignment copies the characters instead of storing the address of the
  literal, and a literal longer than the capacity is a build error. The
  position comes before the count in `MID`, `DELETE` and `REPLACE` (IEC 61131-3
  writes the length first); `WSTRING` supports declaration, initial values,
  assignment and `LEN`.
- The counters `CTU`, `CTD` and `CTUD` keep their edge detector running while
  Reset or Load is TRUE, so a pulse that rises during Reset or Load is no longer
  counted when it is released; in `CTUD`, Reset beats Load and both beat the count
  edges, an up edge and a down edge in one scan cancel, and `CV` stops at 32767
  instead of wrapping to -32768 (CMP-058). Counting below zero and negative
  presets still do not follow IEC 61131-3 (CMP-011): see the standard library
  reference.
- The compiler reports every independent error of a file, in order and at its own
  line (a duplicate declaration and an unknown member no longer at line 0; an
  unterminated comment where it opens), and accepts the forms it used to reject:
  based literals (`2#`, `8#`, `16#`), digit separators and typed literals, `&`,
  `**`, bit access `w.0`, `/* */` comments and the empty statement, `VAR RETAIN`
  and `VAR NON_RETAIN`, several names in one declaration, `VAR_EXTERNAL`,
  `VAR_TEMP` in a program, `VAR_OUTPUT` in a function, type aliases, several
  types in one `TYPE` block, function-block instances inside function blocks and
  arrays of instances. Library block names are no longer reserved words, and a
  call that passes an argument no `VAR_INPUT` takes is refused (CMP-006,
  CMP-007, CMP-009, CMP-029 to CMP-033, CMP-035, CMP-038). A `RETAIN` variable
  takes its initial value only when the retentive region holds no saved state.
- `RETAIN` memory is now kept across a power cycle on the native runtime and,
  behind `CONFIG_ZPLC_RETAIN_PERSIST`, on the Zephyr firmware (RT-025, RT-026,
  RT-027). The region is stored on `STOP`, on a clean shutdown and periodically,
  in two alternating records that carry a checksum, a layout hash and the
  program identity; it is restored only when the identity and the layout match,
  and otherwise it is initialised and the status says why (`retain` in the
  native `status.get`, `zplc sched status` on the firmware). A rebuilt program
  starts from its declared initial values; `execution.reset` is a cold restart.
  The native runtime stores at most once per `ZPLC_RETAIN_SAVE_INTERVAL_MS`
  (30 s by default); each firmware board has a documented interval and the build
  fails when it would wear the storage flash out inside ten years. The
  Nucleo-H743ZI cannot mount NVS, so it does not persist `RETAIN`, and the WASM
  simulator does not apply the rules yet. No board was measured: see
  `docs/runtime/persistence`.
- The debug map is a function of the sources: two builds of the same project
  give the same bytes (the `generatedAt` timestamp is gone), and
  `compilerVersion` is the version of the compiler package. Each statement
  has the full range of its instructions with its line and column, so any
  program counter inside a statement resolves to that statement; the end of a
  function and the helper routines after the cycle belong to none.
- Names are matched without regard to case, as IEC 61131-3 says: variables,
  functions, members, enumeration values, type names (`byte`) and direct
  addresses (`%ix0.0`). A declaration whose type is not a type is a build
  error that names it and its position; `LTIME`, `LDATE`, `LTOD`, `LDT`,
  `CHAR` and `WCHAR` are rejected the same way (planned for 2.x, decision
  D-04) instead of getting a variable of size 0, and `VAR PERSISTENT` is
  rejected at the word (declare the variables `RETAIN`).
- Every value is checked against the type it goes into. An assignment, an
  initial value, a function argument, the value of a function and an output
  bound with `=>` must convert as IEC 61131-3 allows: integers and bit strings
  convert to each other (a value that does not fit keeps its low bits), an
  integer to `REAL`; a `REAL` to an integer, a `BOOL` to or from a number and
  `TIME` to or from a number are build errors that name both types. A
  condition is a `BOOL`, and a constant that does not fit its type is an
  error, so `small : SINT := 300;` no longer builds. A literal above
  2147483647 goes to a `UDINT` parameter and to `XOR_DWORD`.
- Each function is a scope of its own: two functions may use the same
  parameter and local names, and a program's variables are not visible inside
  a function. Arguments bind by name in any order (positional first); a
  missing, repeated or unknown argument, and a recursive function, are build
  errors. A function may be called as a statement and may be declared after
  the functions that call it. A function block call checks its parameters
  (a name the block does not have is an error) and `Q => y` copies an output.
  The library blocks of the kitchen_sink project called their parameters
  `SETPOINT`, `CYCLE`, `SET`...; the names were ignored and are now fixed to
  the ones the blocks have.
- An integer of a wider type stored in a narrower one (`DINT` to `INT`, `LINT`
  to `DINT`) keeps its low bits as before and the build now reports the
  warning `IMPLICIT_NARROWING` at the value, naming both types; Studio, the CLI
  (`Warning:`) and the Tool API show it. A mask or a remainder that fits the
  destination does not warn. The bundled `analog_test` project narrowed a
  `DINT` into an `INT`; it now stores `TempDegC MOD 32768`, the same value
  inside the plausible window.
- Studio resolves a program counter to the statement that owns it, not only
  the first instruction of the statement, and `release-version.ts` rewrites
  and checks the compiler version that every debug map records.

## 2.0.0-rc.3 - 2026-09-01

- Closed the remaining source-truth gaps: project schemas reject persisted
  credentials, migration documentation matches explicit Studio Save behavior,
  and release records are checkout-bound.
- Source and local non-HIL gates are closed. Hosted exact-tag/SHA artifact
  generation remains execution evidence until the workflow runs; REL-007
  traceable physical HIL remains the only pending product-qualification gate.

## 2.0.0-rc.2 - 2026-08-31

- Closed the non-HIL release gates: exact-SHA reusable CI checkouts, restricted
  AI/MCP regression coverage, deterministic Lab/Learn evidence, and truthful
  RC2 release records.
- Release publishing now verifies the bundled Windows native runtime alongside
  both distributables and the unpacked application; the aggregate bundle is
  named publishable rather than signed because Linux is not natively signed.
- The remaining qualification gate is traceable physical HIL on the selected
  Pico RP2040 and ESP32-S3 profiles. This RC is not GA, production-qualified,
  or a safety certification.

## 2.0.0-rc.1 - 2026-08-31

- Hardened program loader, persistence, scheduler, and transport trust boundaries.
- Added canonical compiler, project, and Tool API contracts, plus supervised native
  simulation and the redesigned Studio workbench.
- Added restricted AI/MCP, Lab, and Learn foundations, and reproducible packaging
  and release-evidence plumbing.
- **Breaking C API:** `zplc_core_load_raw` and `zplc_mem_load_code` are no
  longer exported. Product artifact-admission routes must use verified
  `zplc_core_load` or `zplc_core_load_tasks`; `zplc_vm_*` remains a low-level
  trusted-embedder API, and its embedder owns verification before supplying or
  modifying code.

This RC is not GA and does not establish HIL, board qualification, or safety
certification. Hosted workflow evidence and human sign-off remain required.
