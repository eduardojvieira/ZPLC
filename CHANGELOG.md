# Changelog

All notable changes are documented here.

## Unreleased

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
  it would add about 800 errors (468 in Studio, 335 in the compiler) that each
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
