# Changelog

All notable changes are documented here.

## Unreleased

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
- `TP` starts a pulse only on a rising edge of `IN` and is not retriggered by a
  level that stays true after the pulse; `TON`, `TOF` and `TP` hold their
  elapsed time at the preset and a `TON` with a preset of 0 follows its input.
- A conversion function `<FROM>_TO_<TO>` exists for every pair of different types
  among `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`,
  `DWORD`, `REAL` and `TIME` (it was an unknown function for all but four).
  `REAL_TO_INT` and its relatives now round to the nearest integer, an exact
  half to the even one, and saturate at the limits of the destination type
  (they truncated and wrapped); a NaN converts to 0. `REAL_TO_INT(x)` no longer
  yields a 32-bit value: use `REAL_TO_DINT`. `TRUNC` and `ROUND` keep a `REAL`
  of 2^23 or more as it is instead of clamping it to the `DINT` range.
- `FIFO` and `LIFO` called without `SIZE` hold their documented eight items (the
  first call faulted on `MOD` by zero, a `LIFO` was full), a `SIZE` above eight
  is limited to eight instead of writing past the instance, a pop of an empty
  buffer on the first call does nothing, and a call no longer leaves two
  values on the evaluation stack (a call inside a loop was refused by the
  loader).
- `SQRT`, `EXP`, `LN`, `LOG`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN` and
  `ATAN2` are computed by REAL routines with argument reduction and a polynomial
  of fixed degree, measured against `Math.*` in the compiler tests (errors from
  1.3e-7 relative to 4e-7 absolute, bounds in the standard-library reference);
  the old series gave `ASIN(0.5)` = 0.5259, `ACOS(0.5)` = 1.0449, `ATAN(1.0)` =
  0.7238, `LN(10.0)` = 2.218, `LOG(1000.0)` = 1.449 and an `ATAN2` wrong in
  three quadrants. Their arguments may be integers. `SIN`, `COS` and `TAN` of
  an angle of 100000 or more are a NaN, `LN(0.0)` is minus infinity, and
  `ASIN` or `ACOS` outside -1 to 1 are a NaN. `EXPT` is the operator `**`.
- `BLINK` starts its cycle with the ON phase in the scan where `ENABLE` rises
  (it started with the OFF phase) and starts it again after `ENABLE` was
  FALSE; a phase ends at the first call at which its time has elapsed.

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
