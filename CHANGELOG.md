# Changelog

All notable changes are documented here.

## Unreleased

- Runtime hardening of the firmware and the host runtime (RT-010 to RT-034):
  - Memory seen from outside the scan is whole and respects forces. The Modbus
    server, MQTT and the shell debug commands read a snapshot that the scan
    publishes at its commit, and they and the Modbus clients queue their
    writes, which the scan applies at its next input latch through the
    force-aware interface: a forced
    variable keeps its forced value whatever a client writes, and a Modbus
    write of the two registers of a 32-bit value sets only the half it
    addresses. A write that does not fit the queue
    (`CONFIG_ZPLC_EXCHANGE_QUEUE_BYTES`) is refused whole and a Modbus TCP
    client gets exception 6.
  - The process-image lock is no longer held while the physical outputs are
    written, a line is printed or a call can block; the scan reads the inputs
    before it takes the lock and writes the pins after it releases it. A lock
    that cannot be created or taken is reported by every caller:
    `zplc_core_init()` returns -1, a control call returns
    `ZPLC_SCHED_ERR_LOCK`, and a scan that cannot take the lock drives the pins
    safe and latches the fault.
  - A program load is a cold start on every runtime: the variables and the
    forces of the program it replaces never carry over
    (`zplc_core_cold_start()` and `zplc_core_warm_start()`).
  - The firmware starts the scheduler, the program store and the control link
    before the network, time, fieldbus and cloud services, and a service that
    fails to start no longer stops the runtime.
  - The largest artifact is one number, `CONFIG_ZPLC_CODE_SIZE_MAX`: the program
    store keeps and restores an artifact of that size (it is chunked under
    `CONFIG_ZPLC_PROGRAM_STORE_CHUNK_SIZE`), the loader accepts it and the shell
    and the IDE advertise it. **Behaviour change:** the Raspberry Pi Pico
    profile now advertises 24576 bytes, the STM32F746G Discovery profile
    16384 bytes and the Arduino Opta WiFi profile 32768 bytes, the largest
    sizes their storage and RAM hold with three copies of the program in RAM;
    the build fails when two slots of the configured size do not fit the
    storage partition. The firmware keeps no resident copy of the program
    beside the upload staging buffer: `zplc reset` reloads the loaded program
    from the program store (and cancels an upload in progress), which saves
    one program of RAM on every board.
  - A power cut at any moment of a program deploy leaves the previous or the
    complete new program; the store logic is one implementation shared by the
    host runtime and the firmware, tested with a power cut and a torn write at
    every operation.
  - Every size, depth and priority has a Kconfig range and a build-time rule,
    and the core compiles without Zephyr headers. The scan coordinator is
    checked to outrank the communication, shell and log threads
    (`CONFIG_ZPLC_COMM_THREAD_PRIORITY`), and the boards with a network stack
    run its threads preemptible.
  - One CRC-32 and one set of little-endian helpers (`zplc_crc32.h`,
    `zplc_bytes.h`) replace the copies of the loader, the RETAIN records and
    the program stores. The test-only entry points moved out of the public
    headers into `firmware/lib/zplc_core/tests/include/zplc_test_hooks.h`.
    `zplc_retain_config_t.lock` is now `int (*)(void)` so a lock failure can be
    reported.

- The palettes of LD, FBD and SFC offer only what their transpiler translates, and every
  element they offer is placed in a program and run in the virtual machine by a generated
  test (LNG-007). The Ladder palette offers the edge coils that the transpiler has
  translated since LNG-022 and no longer offers `COMM_CONNECT`, `COMM_PUBLISH`,
  `COMM_SUBSCRIBE` and `COMM_MODBUS`, which no Ladder file can declare. The FBD palette no
  longer offers the functions of the library (`SQRT`, `SIN`, `LEN`...) or the four
  `COMM_*` blocks, which the build refused or could not declare; a block of the library has
  the inputs and outputs it declares (a `BLINK` has `ENABLE`, `T_ON` and `T_OFF`, not `IN`
  and `OUT`), typed as the compiler types them.
- A breakpoint can be set on an IL line, a Ladder rung, an FBD block and an SFC step or
  transition, and the runtime stops there (LNG-004). The debug map relates each instruction
  range to the element of the source that was edited (`element` on a source range and on a
  breakpoint location): the lines of an IL file are the IL lines, those of a diagram stay the
  generated lines and carry the element, a step is entered and a transition fires at the
  statement nested in the test of the chart. The breakpoints of a diagram are kept on the
  elements and worked out again from the debug map of each build, so they follow their
  rung, block or step when the diagram changes. Executed on the native runtime for IL, LD,
  FBD and SFC; not checked on a board.
- A diagnostic of an IL, LD, FBD or SFC file names the element it is about (LNG-003,
  LNG-026): an IL line, a rung and its cell, a block or a wire, a step, the condition of
  a transition, the body of an action. Each element that is wrong is its own diagnostic
  (an IL file reported only its first line, and every other file one joined message),
  the Tool API, the CLI and MCP carry it in an `element` field, and a finding of the
  compiler in the generated Structured Text is put on the element it was generated
  for (on the IL line, for IL). Activating the problem in Studio selects the element
  in the editor. The transpilers return the map of the generated lines to elements
  (`sourceMap`) that debugging uses (LNG-004).
- The FBD canvas refuses a wire between pins whose types do not match and says why
  (LNG-013): a `BOOL` output into a numeric input, a `REAL` into a `BOOL` or integer
  input, a number into a `TIME` input, and a second wire into an input. The table of
  rules (`models/pinTypes.ts`) is the one the compiler applies to an assignment, and a
  test compiles every pair of elementary types and fails when the two disagree.
- Opening a Ladder, FBD or SFC file and saving it without a change leaves it byte for byte
  as it was (LNG-014): a commit of an editor that says what the file already said no longer
  rewrites it (the order of the keys does not matter, and the fields of a block, a step or a
  transition that the canvas does not edit are written back as they were), and the one form
  that Studio writes (`serializeLDModel`, `serializeFBDModel`,
  `serializeSFCModel`) ends in a newline, as the files of the repository do. The checks made
  when a visual file opens (LNG-011) now also cover the variables of FBD and SFC files, the
  actions, positions and conditions of an SFC chart, and the variable of a Ladder element.
- The VM has 34 new opcodes for 64-bit integers and double precision (CMP-015),
  all in the C core, so every runtime has them at once: `MUL64`, `DIVS64`,
  `DIVU64`, `MODS64`, `MODU64`, `NEG64`, `ABS64`, `SHL64`, `SHR64` and `SAR64`
  for `LINT`, `ULINT` and `LWORD`; `ADDD`, `SUBD`, `MULD`, `DIVD`, `NEGD`,
  `ABSD`, `SQRTD`, `RNDD` and the comparisons `EQD` to `GED` for `LREAL`; and the
  conversions `F2D`, `D2F`, `I2D`, `D2I`, `L2D`, `D2L`, `U2D`, `D2U`, `L2F` and
  `U2F`. A two-word value has its low word deeper on the stack. The double
  operations are computed in integer arithmetic, so a result is the same bit
  pattern on the 64-bit host, on a 32-bit build and on every target, and every
  NaN is `0x7FF8000000000000`. Division and modulo by zero fault like the 32-bit
  ones, `INT64_MIN / -1` is `INT64_MIN`, a shift of 64 or more gives `0` (`-1` for
  a negative `SAR64`) and a conversion to an integer truncates, saturates and
  maps a NaN to `0`; the results are stated in the runtime ISA page. The opcodes
  add about 4 KB of code on a Cortex-M3 at `-Os`.
- `LREAL` and the 64-bit integers work (CMP-015). `LREAL` is declared,
  initialised, computed (`+ - * /`, negation, comparison with IEEE 754 results,
  a NaN is unordered), stored in arrays and structures, passed to and returned
  from functions and retained; `LINT`, `ULINT` and `LWORD` have `*`, `/`, `MOD`
  (unsigned for `ULINT` and `LWORD`), `ABS`, `SHL`, `SHR`, `ROL`, `ROR`, a `FOR`
  counter, a `CASE` selector with 64-bit labels and literals of the whole range.
  A real literal in an `LREAL` expression is the double it writes, an `LREAL`
  assigned to a `REAL` builds with the `IMPLICIT_NARROWING` warning, and 240
  conversion functions exist (16 types, ties to even, saturation). `SQRT`,
  `ABS`, `TRUNC`, `ROUND`, `MAX`, `MIN`, `LIMIT`, `SEL` and `MUX` are exact on
  an `LREAL`; the transcendental functions compute in `REAL` and widen the
  result back, with the accuracy of a `REAL`. Division and `MOD` by zero fault
  as the 32-bit ones do. The conformance cases give the same results on a 64-bit
  and a 32-bit runtime.
- Studio watches `LINT`, `ULINT`, `LWORD` and `LREAL` at their own width: a
  64-bit integer shows every digit, an `LWORD` as 16 hexadecimal digits and an
  `LREAL` as a double; they used to show the low 4 bytes as a `DINT`, a `DWORD`
  or a `REAL`.
- **ABI:** the draft counter is now 3. Artifacts built before this draft are
  refused by the loader, the native runtime, the firmware shell and Studio, with
  both numbers: rebuild programs and reflash boards together.
  `tools/contract/restamp_artifacts.py` rewrites the counter and the CRC of the
  artifacts committed to the repository (examples, fixtures, fuzz findings), and
  `bun run contract:check` fails when one is stale.
- The function blocks and functions that the Structured Text files of a project
  declare are blocks of the FBD and LD palettes (LNG-008): a diagram places one
  with the ports of its declaration, and the generated Structured Text calls it
  with named arguments (an FBD also places functions, with their result as
  `OUT`; an LD rung places function blocks). A block that no file declares is
  still refused, by name. `transpileToST`, `parseFBDModel`, `validateFBDModel`,
  `getDefaultPorts`, `transpileFBDToST`, `transpileLDToST` and `getToolboxItems`
  take the blocks of the project as an optional last argument.
- Methods and inheritance work as IEC 61131-3 defines them (CMP-041).
  `SUPER^.Method()` calls the method of the base of the block that declares the
  code that runs, and `SUPER^();` runs the body of that base block; a block
  calls the methods of its own by their name; `PRIVATE` and `PROTECTED`
  methods are enforced where they are called; `FUNCTION_BLOCK ABSTRACT` and
  `FUNCTION_BLOCK FINAL` are accepted and enforced (an abstract block has no
  instances, a block that is not abstract implements the abstract methods it
  inherits, a final block is not extended). A variable of an interface type
  holds a reference to an instance and calls the method of the instance
  assigned to it: the compiler writes a comparison with every instance of a
  block that implements the interface and the method inlined behind each, and
  a call through a variable that holds no instance ends the scan with a VM
  fault. The code of an interface call is as large as those methods together.
  Nothing in the binary contract changes: there is no indirect call.
- The Structured Text files of a project are one compilation unit (CMP-042): a
  type, a function, a function block, an interface or a `VAR_GLOBAL` declared
  in any file is visible to every program, whether or not a task runs a program
  of that file. A global has one address shared by every program and task and
  is initialised once, by the entry of whichever task runs first; a function is
  built once. A declaration made twice is reported at each place, naming both
  files and lines, and an error is reported in the file it belongs to. Two
  programs may declare variables of the same name. A function block no longer
  sees the variables of the program that calls it, and the arguments of a
  method call are evaluated in the caller's scope (a name that the callee also
  declared used to resolve to the callee's). The debug map has one POU for each
  file that declares a program, a variable or code, so a global is listed once
  and the statements of a function block are ranges of its own file.
- The memory of a program is the WORK memory of the target profile, shared by
  all the programs of the project (CMP-043): the 256-byte bucket of each
  program, and the limit of 14 steps of an SFC chart that came from it, are
  gone. An allocation failure is a build error at the declaration that crosses
  the end of the region and states the bytes required, the bytes available and
  the three largest consumers. The variables of the second and later programs of
  a project move to the addresses that follow the first program's (the debug
  map says where); the initialization flag is the last byte of the profile's
  WORK memory, and a project of several programs initialises everything in one
  routine that the entry of each program calls.
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
  every push, and over the Zephyr HAL and `firmware/app` in each cross-build job
  and with `tools/firmware-test/run.sh tidy` when a board build exists. Findings fixed:
  an unchecked `signal()` in the host runtime now reports a handler that was not
  installed; the pointer offsets of the loader, the VM and the program store are
  computed in `size_t`; the unchecked results of `snprintf`, `fclose` and `fflush` in the
  HALs are discarded on purpose; a `strcpy` that was bounded by a check before it
  is now a `memcpy` of the same length. `-Werror` now also applies to the ZPLC
  Zephyr library.
- The shell and the cloud clients of the firmware application parse numbers
  strictly (`firmware/app/src/zplc_parse.h`, tested on the host). `zplc config set
  modbus_tcp_port 70000` is refused instead of storing 4464, and so is `wifi_security
  256` (it stored 0, an open network), `mqtt_port abc` (it stored 0) and `12abc`; a
  value above what the field holds, or above the last enumerator of an enumeration,
  is an error and nothing is stored. The same holds for the breakpoint address of
  `dbg bp add` and `dbg bp remove` (65536 was stored as 0), the offset of `mem dump`,
  the size of `cert begin`, `dbg task` and `adc read`; a hex payload with a character
  that is not a hex digit is refused (it was written as a zero byte); and a JSON
  number of the AWS fleet and Azure DPS responses must be a whole integer, as must the
  status of a DPS topic. The firmware was not built for this change.
- A code sample in the docs whose fence says `runnable` is compiled in CI, and
  executed when it states an expected result (VF-020). The three Structured Text
  and Instruction List samples of the language pages are marked, in English and
  Spanish, and the convention is on the Contributing page.
- `smoke:studio-vertical` passes again to its end: it clicked the close button of a
  tab that was seeded modified and expected it to close at once, which the unsaved
  changes question (IDE-005) had stopped doing. It now answers the question with
  Cancel, checks the tab stays, and closes the tab once nothing is unsaved; its
  Close Project step also asks for Save all and close.
- The project tree supports new folder, rename, move, duplicate and delete folder
  (IDE-004), from the Explorer header, a context menu and F2. Open buffers, tabs
  and breakpoints follow a renamed or moved entry, a task that runs a renamed
  program follows it in `zplc.json`, and a name that the build reads as the same
  as another program is refused. An empty folder is listed.
- A change made outside Studio is picked up while a project is open (IDE-004): the
  main process watches the folder behind a typed `project-files:watch` request and
  pushes batches of relative paths on `project-files:changed`. An unmodified file
  reloads, a deleted one closes, and a modified one asks to keep the user's
  version or load the disk's. `zplc.json` is not watched yet.
- Closing the project with modified files offers Save all and close next to
  Discard and Continue editing (IDE-005); it offered only discard or cancel. The
  main process also catches Ctrl+R, Ctrl+Shift+R and Cmd+R before the page and
  the menu: a packaged build swallows them and a development host reloads only
  through the unsaved-work question.
- Studio has application preferences that persist per user (IDE-007, IDE-010):
  editor font size (10 to 32 px) and tab size (2, 3, 4, 8), density (compact
  scales the Tailwind spacing of the whole window), language (the Learn lessons
  follow it), autosave (off by default; after 5, 15, 30 or 60 seconds without
  typing, saved without a line in Output per save) and an opt-in update check
  (`update-check:run`, one fixed GitHub releases address, no argument from the
  renderer, answers a version and a link). They sit at the top of Project
  Settings and on the Welcome screen. Only the theme existed before.
- An exception while the toolbar, the editor area or the lower panel draws now
  shows its error and a Retry button in that region only (IDE-011); before,
  only the editor content and the lower-panel content had their own boundary,
  so a failure in the toolbar or in a tab strip replaced the whole window. A
  development-only probe (`DevFaultProbe`, absent from production builds) lets
  journey 20 make each region fail in the real application.
- Studio keeps a copy of every modified file in its user-data directory within a
  second of the last keystroke (IDE-006), and offers each one back, with its name
  and the time it was kept, when the project is opened after a crash. A normal exit
  (save, discard, close with discard) leaves nothing. The store is owned by the main
  process behind three typed channels (`recovery:write`, `recovery:list`,
  `recovery:discard`) that name the project by the opaque folder id and a relative
  path; a project keeps at most 64 files and about 64 MB.
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
  days.
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
  instead of wrapping to -32768 (CMP-058).
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
  an angle of 100000 or more are reduced modulo 2 pi with 2 pi held to 36 bits
  and a correction, so they are exact up to 2^40 (2e-6) and finite for every
  finite REAL (an infinity or a NaN gives a NaN; no angle gives a fault or a
  result outside -1 to 1); `LN(0.0)` is minus infinity, and
  `ASIN` or `ACOS` outside -1 to 1 are a NaN. `EXPT` is the operator `**`: it
  no longer underflows the evaluation stack for an exponent of 0 (the artifact
  was refused by the loader) and no longer takes the bits of a REAL exponent as
  a loop count.
- An inlined method that returns a number writes a result slot that is pushed
  once where the method ends: a method that assigned its name twice left two
  values on the evaluation stack (a call in a loop was refused by the loader),
  one that never assigned left none, and an inherited method called as a
  statement was not dropped. A method that never assigns returns 0.
- `NAND` and `NOR` return a `BOOL` of 0 or 1: they returned the bitwise
  complement (254 or 255), so `IF NAND(TRUE, TRUE) THEN` was true.
- `HYSTERESIS`, `RAMP_REAL` and `PID_Compact` compare REAL values as REAL: with
  a negative threshold, a negative error or a negative `OUT_MIN` they compared
  bit patterns as signed integers (a `RAMP_REAL` falling through zero did not
  ramp, a `PID_Compact` output of -10 was limited to `OUT_MIN` -100). An integer
  argument of any of these blocks and of `NORM_X` and `SCALE_X` is converted to
  REAL, and `PID_Compact` called without `DT` no longer faults on its
  derivative term.
- `CTD` and `CTUD` count below 0 and stop at -32768 as IEC 61131-3 defines
  (`CTD` stopped at 0), and the three counters compare `CV` with `PV` and 0 as
  signed values: a negative `PV` made `Q` and `QU` wrong because the 16-bit
  members were loaded without their sign. A `CTD` that was never loaded counts
  from 0 to -1 on its first edge.
- `BLINK` starts its cycle with the ON phase in the scan where `ENABLE` rises
  (it started with the OFF phase) and starts it again after `ENABLE` was
  FALSE; a phase ends at the first call at which its time has elapsed.
- `PWM` takes an integer `DUTY` as a REAL (`DUTY := 1` was a denormal and the
  output never came on), ends its pulse at `PERIOD * DUTY` also when that is not
  a whole number of milliseconds (the comparison truncated 30.5 ms to 30 ms of
  difference), and a `PERIOD` of 0 is off instead of dividing by zero.
- A task with `trigger: "event"` (or `"interrupt"`) fails the build at its
  definition in `zplc.json`, naming the task, its `trigger` field and the
  supported triggers; the build used to produce an artifact that only the
  scheduler refused (RT-015).
- The native simulation runs cyclic tasks of different intervals: each task is
  released on its own interval from a common start, tasks released together
  run by earlier release, then priority, then task id, and share one input
  image per batch, and a scenario steps by the greatest common divisor of the
  intervals. It refused such an artifact before (RT-015, CMP-051). A late
  dispatch runs a task once and skips the releases it missed.
- The native simulation counts deadline misses (RT-014). A task misses its
  deadline when it ends more than its interval after the release of its batch;
  a miss raises a warning and is counted, and `ZPLC_DEADLINE_MISS_LIMIT`
  consecutive misses of one task (1 to 1000000, default 1, which is what the
  Zephyr scheduler does today) latch the fault. `status.get` gains a `deadline`
  object (`warning`, `misses`, `consecutive_misses`, `miss_limit`,
  `last_overrun_us`) and a `fault` object (`reason`, `task_id`), and
  `stats.overruns` and the per-task `overruns` carry the counts; a latched
  fault is also a `runtime.error` event with the code `DEADLINE_MISS`. The
  target scheduler does not report the warning, the last overrun or the reason
  yet. The scheduler page lists what simulation does not match.
- The assembler checks every operand against its field (CMP-049): a value that
  does not fit the 8, 16 or 32 bits of its opcode, a jump to an address outside
  the code or to a label after the last instruction, an entry point or a tag
  field that does not fit, and a relocation past 65535 are errors that name the
  line, where they used to be truncated. `.DB` and `.BYTE` now emit their bytes
  (they used to move the addresses and emit nothing) and `.ORG` fills the gap with
  `NOP` and refuses to move backwards (CMP-060); the directives are described in
  the compiler page. `tools/zplc_asm.py` applies the same rules.
- The code generator cannot emit an instruction that is not in the generated
  opcode table (CMP-048): the type of its output lines is built from the table,
  and every line is checked when it is written, so a line with an unknown
  mnemonic is an internal compiler error that names it and never reaches the
  assembler. The conformance programs are checked line by line.
- The compiler sources are typed and quiet (CMP-061): the 35 `any` casts of the
  code generator, the parser and the symbol table are gone (a method in progress
  is a `MethodInfo`, a named argument is read with `argumentValue`), and the
  comments that thought aloud or recorded a fix by number say what the code does.
  A test lints the sources of the compiler with `no-explicit-any` and a list of
  words that do not belong in a comment.
- The compiler warns about unused variables, unreachable statements and the
  non-IEC spellings it accepts (CMP-008): `UNUSED_VARIABLE`,
  `WRITE_ONLY_VARIABLE`, `UNREACHABLE_STATEMENT` and `NON_IEC_REAL_LITERAL`
  (`1e3`, next to the `0x` form), each with a stable code, a position and its
  file. `compiler.warnings` in `zplc.json` selects them: `none`, `default`
  (everything but the write-only variables) or `all`. A `FUNCTION_BLOCK` member
  that another unit reads as `instance.member`, a variable with a direct address
  and one with a communication tag are never reported. The bundled project
  `kitchen_sink`, which declares FIFO and LIFO blocks it never calls, sets
  `warnings: "none"`.
- Every build option of `zplc.json` has an effect and a test (CMP-059):
  `compiler.strictTypes` makes an implicit narrowing an error; `compiler.debug`
  (default `true`, it used to read `false` and do nothing) decides whether the
  debug map carries statement ranges and line mappings; `build.generateDebugInfo`
  makes the CLI write `<output>.map.json` beside the artifact; and
  `compiler.optimization` has one code generator behind it, so `size` and
  `speed` build the code `none` does and the build warns with `OPTION_IGNORED`.
  The bundled projects that said `size` or `speed` say `none`. A value that is
  not valid for an option is a project error that names the option.
- A project names folders of source files as libraries (CMP-046):
  `"libraries": ["lib/motors"]` in `zplc.json`. Their functions, function
  blocks, types and globals are part of the project; a declaration made twice
  names both files; a folder that is not listed is reported with
  `SOURCE_NOT_COMPILED`. The Tool API lists a library file with its `library`.
- **ABI:** the draft counter is now 4 (CMP-050, CMP-056). A task definition has a
  `call_depth` (the call frames it has active at once, its body included; 0 is
  not declared) in the half of the word that was reserved, and an artifact has a
  `BUILD` segment of 4 bytes, the build identity. The compiler measures the
  evaluation-stack depth and the call depth of every task on the generated code,
  with the stack effects of the opcode table, and records them in the task
  definition where it used to write a fixed 64; the loader proves both, and a
  task that needs more than it declares is refused. A task that needs a stack
  deeper than 127 values (the loader's proof limit) or than the target holds, or
  calls nested deeper than the call stack of the target, fails the build and the
  message names the task, the depth and the limit. The conformance suite checks on
  every artifact that lowering a declared depth by one makes the loader refuse
  it. The identity is the CRC-32 of CODE and TASK, so two builds of a project
  have the same one; the debug map records it as `buildId`, and Studio refuses to
  attach a map to a program that has another. Programs built before are refused:
  rebuild programs and reflash boards together. `restamp_artifacts.py` moved the
  committed artifacts, and `fuzz:seed` rebuilt the seed corpus.
- A `STRING` or `WSTRING` no longer converts to a number, a `BOOL` or a time
  (CMP-005): `n := text;`, a text as the argument of a numeric parameter or an
  input of a function block, as the return value of a numeric function or as the
  initial value of a number, a text compared with a number and a text used as a
  condition built and were stored or compared as an address. Each is now a build
  error that names both types. `LEN` and `FIND`, which give an `INT`, still go
  to a number. No bundled project, example or conformance program used it.
- The assembly listing of a build is a tested output of the CLI (CMP-060):
  `zplc-cli compile <workspace|file> --emit asm` prints it, or writes it to
  `--output`, and assembling it gives the bytecode of the artifact.

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
