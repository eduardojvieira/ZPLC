# Changelog

All notable changes are documented here.

Each version has a section with up to five parts, in this order. The release notes
of a version are built from the first four, so write them for a person who uses
ZPLC and not for one who changes it:

- `### What changed for you`: what a user can now do, or sees differently, in a
  sentence each. No requirement identifiers, no file names unless the user types them.
- `### Breaking changes`: what stops working or must be done differently. Say
  what, and what to do instead. `None.` when nothing breaks.
- `### Migration`: the steps to move from the previous release, in order.
- `### Known limits`: what does not work or has not been verified in this release,
  at the evidence level it is known to hold at.
- `### Details for contributors`: the engineering record, with the requirement
  identifiers and the evidence. It stays in this file and is not in the release notes.

A section of an older release that has none of these headings is read as a list of
changes. The entry of a release is written under `## Unreleased` and takes its date
and version when the release is cut (see `RELEASING.md`).

## Unreleased

- The scheduler is one portable core, and the firmware fails safe (RT-008, RT-014, RT-018 to
  RT-022). Task order, the deadline check, the fault latch and the safe state are decided in
  `zplc_sched_core` and used by the host runtime, the Zephyr scheduler and the single-task
  configuration, which is now a one-task configuration of the core (the same input latch, deadline
  check and status) and no longer a loop of its own; one trace of decisions holds the host and
  the firmware to the same answers (`test_sched_equivalence`, `scheduler_equivalence`).
  **Changed defaults**: the consecutive deadline misses that latch the fault are 3 instead of 1 on
  every runtime (`CONFIG_ZPLC_DEADLINE_MISS_LIMIT`, `ZPLC_DEADLINE_MISS_LIMIT`; 1 restores the
  earlier behaviour), the target reports the warning, the miss run, the limit, the last overrun
  and the fault reason (`zplc sched status`), and a deploy stops the running program before it
  transfers a byte. The time a scan reads is latched once per scan and the string opcodes are
  charged to the instruction budget by their bytes (RT-006). A processor fault, a stack overflow
  or a kernel panic drives the outputs safe, records the reason in RAM that a reset does not
  clear and reboots; `zplc sys reset [--json]` reports why the part was reset (power-on,
  brown-out, pin, software, watchdog, fault or unknown) and what the previous run left, and the
  runtime waits in STOP after every reset. Each board profile in `boards.json` has a `watchdog`
  object (policy in STOP, paused and in a fault, timeout and its maximum); no board has the
  hardware watchdog enabled, because none has the hardware record of its reset timing (HIL-010).
  Not done: the WASM runtime does not use the core yet, and nothing here was run on a board.
- A project declares the value an output takes in the safe state, and the artifact carries it (RT-023).
  An output is still off whenever the program does not control it (STOP, a pause, a latched
  fault, the boot, a deploy in progress); a row of `io.outputs` with `"safe": true` is on instead,
  and the board's own level for the channel is replaced in both directions. The declaration is a
  new `SAFE` segment (`0x41`, entries of offset, bit and value) so that a program and its safe
  state are one unit: a restored program restores its declaration, and a replaced program
  replaces it. **Contract change, draft counter 5 to 6**: artifacts built before are refused and
  must be rebuilt, the committed ones and the fuzz seeds are restamped, and `ZPLC_LOADER_ERR_SAFE`
  (`-19`) and `ZPLC_LOADER_MAX_SAFE` (64) are new. The build refuses a `safe` that is not `true` or
  `false`, one on a row that is not a digital output bit or is an input, a duplicate, and an output
  the selected board has no digital channel for, naming the output and the board; the firmware
  refuses the same declaration at deploy and at boot restore. The compile result lists the declared
  values (`declaredSafe`) for a deploy confirmation; the screen is not part of this change.
  `tools/contract/safe_cross.py` has the C loader read what the compiler writes. The hardware
  state of a pin between power-on and the first instruction of the firmware is the part's own and
  is not claimed.
### What changed for you

- **Studio saves your work and tells you what happened.** It keeps a copy of every
  modified file and offers it back after a crash, shows each build, save, deploy
  and test result as a notification that opens its details, can cancel a long
  operation, and keeps the preferences you set. A project exports to one archive
  and imports back byte for byte.
- **The project tree does more.** New folder, rename, move and duplicate keep the
  open tabs and breakpoints, a change made outside Studio is picked up, and a
  folder of library blocks is offered to every editor.
- **The language is more correct.** `LREAL` and the 64-bit integers work, structures,
  enumerations and arrays keep their declared width, strings no longer modify
  their arguments, the timers and counters follow IEC 61131-3, and a build says
  which element of an IL, ladder, FBD or SFC file a message is about. A project
  keeps its Structured Text files as one compilation unit.
- **Simulation is closer to the target.** Tasks of different intervals run, each
  released on its own interval, a deadline miss is counted, any input of the
  running program can be set or forced from Studio, and `VAR RETAIN` values are
  kept from one run to the next.
- **Scenario tests give the same answer everywhere.** Studio, the command line and
  the MCP server run them the same way, and the **Interlocks** tab lists which
  pairs of outputs are asserted never to be on together.
- **Boards are described once.** `firmware/app/boards/boards.json` holds the
  channels, addresses and safe values of each board, Studio's I/O mapping editor
  reads it, a variable on an address the board does not have is a build error, and
  the firmware's I/O table is generated from it.
- **A controller is safe on a plant network by default.** MQTT is off and names no
  broker until an operator sets one, TLS verifies the certificate, no command prints
  a credential, `zplc config save` writes what it says, and no message from Modbus,
  MQTT or a cloud service can start or stop the program, set a force or load a program.
- **New documentation.** An install page, the tutorial *Blink without hardware* with
  real screenshots, how-to guides for Modbus, MQTT and Sparkplug B, the cloud blocks,
  mapping I/O, forcing values, retained values, scenario tests, project archives,
  the command line, debugging, AI and MCP, porting to a board and troubleshooting,
  one hardware support page and one safety and limitations page, in English and
  Spanish. The language, function, shell, Kconfig, project file and protocol
  references are generated from the source. The project schema names every board of
  the manifest, so an editor that reads `zplc.schema.json` no longer flags
  `waveshare_rp2040_zero`, and a test fails when the two lists differ.
- **The bench procedure is written down and its tools are tested without a board.**
  [Hardware in the loop](docs/docs/development/hardware-in-the-loop.md) says what a
  person does at the bench, one command runs the whole chain and writes a record, and
  no record of a board exists yet.
- **Releases are made by a pipeline you can read.** A rehearsal runs everything and
  publishes nothing, the notes say which check each file passed, a bill of materials
  is written from the lockfile, the command line and the MCP server are standalone
  executables, and every file has a checksum and a build attestation.
- **A release carries the firmware of every board, and Studio shows the one you need.**
  The release pipeline builds one image per board of the manifest in the format the
  board flashes (UF2 for the two RP2040 boards, one binary for the ESP32-S3, binary
  and ELF for the others), with its checksum, the version and commit it was built
  from and the evidence level of its board. In **Project settings**, **Target**,
  Studio shows the image of the board of your project, its SHA-256, where the file is
  and the steps to flash it; the images of the Raspberry Pi Pico and the ESP32-S3
  travel inside the installers. Studio does not flash: you do.
- **The Linux packages let you open a board's serial port.** The `.deb` and the `.rpm`
  install a udev rule that gives the user who is logged in access to the USB serial
  device of the boards whose identifier the project has recorded (the two RP2040
  boards today); the install page says how to apply it without a reboot, and the
  group that the other boards need.
- **Studio tells you about a newer release.** With the optional check turned on, or when
  you press **Check now**, a dismissible notice names the release, its address and the
  update step of your system. Nothing is downloaded or installed.
- **The README and the install page open with a Download section** with one line per
  system and what that system asks the first time you open the file.

### Breaking changes

- **Rebuild every program and reflash every board.** The binary contract has a draft
  counter (now 4), and a program or a firmware image of another draft is refused
  by the loader, the runtime, the firmware shell and Studio, with both numbers.
- **A `VAR_IN_OUT` of a function block is passed by reference.** A block called
  without binding it faults; rebuild programs that declare one.
- **Event and interrupt tasks fail the build.** A task with `trigger` `event` or
  `interrupt` is an error at its definition in `zplc.json`; use `cyclic`.
- **The default MQTT broker is gone.** A controller that relied on `test.mosquitto.org`
  has MQTT off until its operator names a broker, and the default transport is TLS on
  port 8883 with the certificate verified.
- **The board file moved.** `supported-boards.v1.5.0.json` is replaced by
  `firmware/app/boards/boards.json`, which has no version in its name.
- **A text no longer converts to a number, a `BOOL` or a time**, and a constant array
  index outside the bounds is a build error: programs that relied on either now fail
  to build, with the line.
- **A rebuild discards retained values**, because a program that differs by one
  byte has another identity.

### Migration

1. Rebuild every program with this version and reflash every board with firmware of
   the same version; both numbers appear in the refusal if you do not.
2. Run `zplc-cli migrate-preview` on a version 1 project and read the diff before
   you accept it: [Migrate a version 1 project](docs/docs/ide/migration-v1-to-v2.md).
3. Name the MQTT broker of every controller that used the old default, and install
   its CA certificate, or set the transport you need explicitly.
4. Change a task that used `event` or `interrupt` to a cyclic task.
5. Read the board file from `firmware/app/boards/boards.json` in any tool of yours
   that read the versioned file.

### Known limits

- No board has been flashed, booted or run: every board is at the `cross-build`
  level, and nothing is verified on a physical device
  ([Hardware support](docs/docs/reference/capabilities-evidence.md)).
- No Modbus, MQTT, Sparkplug B or cloud exchange has been tested with a real device,
  broker or service, and no cloud block was verified against a service, an emulator or
  a recorded exchange. The handshake of the communication blocks and the separation of
  the four Modbus data areas are not final.
- Retained values are proven on the host and the simulator only, and are off by default
  on firmware.
- TLS is off on the Nucleo-H743ZI and the Arduino Opta until their random generator is
  verified on the board, so MQTT runs over plain TCP there.
- The browser simulator is unavailable: simulation needs the desktop application.
- The installers are not signed with a paid identity: Windows asks you to confirm the
  first launch and macOS needs **Open Anyway**
  ([Install ZPLC Studio](docs/docs/getting-started/install.md)).
- Timing is not measured on any board, and ZPLC is not a safety PLC
  ([Safety and limitations](docs/docs/safety-and-limitations.md)).

### Details for contributors

- The hardware-in-the-loop tools are repaired and tested without a board
  (HIL-001 to HIL-009, HIL-012, HIL-017). Every script of `tools/hil` exits
  non-zero when a check fails, or is listed with its reason in
  `tools/hil/non-gating.json`; none names a device path or needs pyserial to
  load, and the serial port is a parameter, `ZPLC_SERIAL_PORT`, or found from the
  USB identifiers of the board. The 50 language fixtures compile with the
  repository compiler and their expected values, in `tools/hil/fixtures.json`,
  are checked on the native runtime in CI; the 11 tracked `.bin` files are gone.
  `packages/zplc-hil` compiles, deploys and observes through a device link, and
  has a hardware runtime port for the scenario engine. `run_chain.py <board>`
  runs the whole chain, prompting for each physical step, and writes a run
  record; it and `zplc-hil run` exit with an error without an interactive
  terminal. `tools/test_crc32_cross.py` compares the C implementation with the
  TypeScript one. The page [Hardware in the Loop](docs/docs/development/hardware-in-the-loop.md)
  says what a person does at the bench; the board records of HIL-010 do not
  exist yet. The records carry the firmware identity that the image reports
  (`zplc sys build --json`: commit, dirty, board, ABI, draft, options and their
  hash). The Pico and ESP32-S3 profiles no longer turn the HIL trace on (HIL-013);
  a HIL image adds `tools/hil/hil_debug.conf`, the chain prints and records
  that build command, and `tools/hil/validate_hil_trace_profile.py` fails a
  profile that sets it: the `.conf` files of the single manifest
  `firmware/app/boards/boards.json`, the ones Zephyr applies for each of its
  board names, every `.conf` of `firmware/app/boards` and `prj.conf`. The chain
  compares the I/O description the image reports (`zplc sys io --json`) with
  the one of `boards.json` and fails on another board, hash or size; its pending loopback
  and analog items name the channels of that description and leave the wiring
  `TO BE FILLED`. A run on real hardware of a named, clean image also writes the
  flat evidence record the manifest derives a support level from; no run on a
  stand-in does, and adding it to `evidence_refs` is a person's edit.
- A controller that was never configured is safe on a plant network, and the
  settings that `zplc config save` reports are the ones it stores (COM-014,
  COM-015, COM-027). The default broker (`test.mosquitto.org`) is gone: MQTT is
  off and has no broker until an operator names one. The default transport is
  TLS on port 8883 with the broker's certificate verified; turning
  verification off (`mqtt_security 1`) is refused by a release image and, in an
  image built with `CONFIG_ZPLC_MQTT_ALLOW_INSECURE_TLS`, shows
  `tls-verify: OFF` in `zplc mqtt status` and a warning in `zplc status`. A
  password, key, SAS key or user name is shown as `(set)` or `(not set)`: a
  test sets a known value for each and finds none in the output of any
  reporting command or in the log. **`zplc config save` used to write nothing
  and print `OK: Config saved`**: the settings handler had no export, so the
  save was a no-op on every board. It now writes the 70 settings and the
  Modbus overrides to the same store as the program (HAL NVS, keys `cfg_NN`),
  stops and reports at the first entry that fails, and a test sets each
  setting through the shell, saves, reboots the configuration and compares
  them. `zplc config reset` reports a failed save too. A board whose store
  cannot be mounted (the Nucleo-H743ZI) now reports the error instead of
  `OK`. The AWS fleet certificate and key were never mapped to a store entry,
  so their save always failed; they are mapped now. An Azure direct method is
  answered `501` instead of `200`, since none is implemented. A new project
  in the IDE (and `packages/zplc.json`) starts the same way, with MQTT off, no
  broker, TLS on port 8883 and the certificate verified, and the settings page
  always sends `mqtt_security` so the device never falls back to its own
  default; `firmware/configure_zplc.py` has no default broker and asks for
  `--broker`. The editor keeps the `warnings` list of `zplc status --json`.
- Release firmware has no command that reads or writes memory outside the PLC
  regions (COM-022). The Zephyr shell's `devmem` was on by default in every
  board image; `firmware/app/prj.conf` turns it off, the diagnostic image
  (`firmware/app/diagnostic.conf`) turns it on with
  `CONFIG_ZPLC_SHELL_RAW_MEMORY`, and the application build stops when the
  two disagree. `zplc dbg watch` and `zplc dbg timer`, which only printed
  "not yet implemented" and succeeded, read a typed value and a timer
  instance now.
- TLS cannot be built on a random generator that is not cryptographic
  (COM-016). The build stops when TLS is enabled together with
  `CONFIG_TEST_RANDOM_GENERATOR` or without a cryptographic random source
  (`zplc_rule_tls_with_test_random_generator`). The Nucleo-H743ZI and Arduino
  Opta images set that option; they use the STM32 hardware generator now, and
  **TLS is off in them** until the generator is verified on the board
  (HIL-011): MQTT there runs over plain TCP, and a TLS transport is refused
  instead of downgraded. The firmware compiles with MQTT and TLS off for the
  first time (unused buffers and the secure-websocket transport were not
  guarded).
- No message from Modbus, MQTT or a cloud service changes RUN/STOP, sets or
  clears a force, or downloads a program, and two checks say so (COM-017):
  `tools/firmware-test/check_inbound_authority.py` reads the compiled objects
  of the inbound handlers of every board image and fails on a reference to
  run control, the force table, the program loader or store, or a reboot; and
  `firmware/tests/inbound_authority` drives every Modbus function code and
  every write count through the product's framing and mapping in front of a
  core whose authority entries count their calls. `firmware/tests/inbound_mqtt`
  compiles the product's MQTT client with its Sparkplug B protobuf files and
  delivers hostile topics and payloads to it under each of the five profiles:
  nothing reached run control, the force table or the loader, and the only
  write was to a subscribed variable, queued through the exchange
  (`zplc_exchange_write`), the one interface the inbound sources may reach.
  The link check lists the exchange symbols and refuses an inbound object that
  reaches the scheduler, the force table or the loader directly, and refuses
  the exchange object itself if it does.
- No MCP tool and no AI path opens the device link (COM-030).
  `src/mcp/deviceLink.test.ts` enumerates the tools and resources of the live
  server, builds the module graph of the MCP entry point and of the AI
  provider and finds no serial, upload or socket module in them, and runs the
  tools with a trap on every socket and serial entry point;
  `electron/aiDeviceLink.test.ts` shows that an AI request carries only its
  six fields. While writing it, `compiler_check` and `compiler_compile`
  turned out to answer `MCP_INTERNAL_ERROR` for every real project: the
  compiler summary gained `draftCounter` and the MCP result schema did not;
  the schema knows it now, and a test runs the shipped operations (not stand-ins)
  through the dispatcher over a bundled project.
- A Modbus function block that is reset while its request is in flight no
  longer hands the slot to another block (COM-008): the worker owns a queued or
  running slot until it is through, a full request queue writes the whole
  `STATUS` word, and a test holds a request in the client while it resets one
  block and starts another.
- The release pipeline can be rehearsed and says what it did (REL-030, REL-027,
  REL-017). **Release Build** has a *Rehearsal* input that is on by default: it
  runs every job, renders the notes and one `SHA256SUMS` as an artifact, and
  makes no draft, upload or attestation. A run publishes only for the push of
  the exact version tag, or a manual run on that tag with the rehearsal
  unticked (`scripts/release/resolve-release.ts`, tested with the events of the
  workflow). The notes and the title are rendered from the job results, the
  platform bundles and the JUnit reports of the run: a file is called signed
  only when the signature check of that run passed, a platform whose job failed
  is listed as having no files, and a prerelease title says how complete it is.
  Prerelease tags continue the `rc` sequence (`alpha`, `beta` and `preview`
  names, which sort below `rc.3`, are refused), and `CHANGELOG.md` is checked to
  hold only tagged versions (`2.0.0-rc.2` has no tag and is listed as the
  exception). `RELEASING.md` is the one checklist, with every external service
  and its cost (none).
- The bill of materials is written from the lockfile (REL-018, REL-019).
  `scripts/release/sbom.ts` produces CycloneDX 1.5 from `bun.lock`, the
  workspace manifests and `west.yml` (1,670 components) instead of a scan of the
  installers, and fails when the document holds fewer packages than the
  lockfile lists or than the recorded floor. The third-party notices of the
  packages and fonts that ship are generated while packaging and are
  `THIRD-PARTY-NOTICES.txt` in the resources of every installer; a package with
  no licence or a font with no entry in `scripts/release/font-licences.json`
  stops the build.
- The firmware says which build it is (REL-023). A generated header carries the
  version, the commit (and whether tracked files differed from it), the board,
  the bytecode ABI and draft counter and the `CONFIG_ZPLC_*` options with their
  hash. `zplc version` prints it and no longer prints the compile date, so one
  commit is one image; `zplc sys build [--json]` reports it as a command of its
  own, because Studio's handshake accepts exactly the keys of
  `zplc sys info --json`; the native runtime reports it as `build` in
  `session.hello`. On the Pico the image grows by 1,472 bytes of flash and none
  of RAM. A test drives the real shell of `firmware/app` on `native_sim`.
- The CLI and the MCP server are released as standalone executables (REL-026,
  IDE-026). `scripts/release/binaries.ts` compiles both with `bun build
  --compile` for Linux, macOS and Windows on x64 and arm64 and names them
  `<tool>-<version>-<os>-<arch>[.exe]`; each platform job builds and smokes them
  on its own architecture (`--version`, a compile of a bundled project, the list
  of MCP tools). Each is about 98 MB, the size of the embedded runtime.
- The unpacked application is checked for what it must hold (REL-034):
  `bun run smoke:packaged-content` looks for the text of every example project
  file in the renderer bundle inside `app.asar`, the id of every lesson (found
  by pattern, so a lesson package that is added is covered), every bytecode
  example, and a licence notice for every package and font of the archive.
- Analog inputs and persisted keys have native_sim tests (IO-006, IO-008,
  IO-018). `io_analog` runs the analog inputs of a description over the ADC
  emulator and shows that a required channel that cannot be configured fails
  `zplc_hal_init()`, not the first scan. `hal_persist_keys` stores, reads and
  deletes every key the runtime uses over the NVS of the flash simulator; the
  two AWS fleet credential keys had no NVS identifier on Zephyr, so the
  credentials were never persisted, and now have one. What the boards do with
  these needs the bench of HIL-010 and is not claimed here.
- Studio reads the board I/O description (IO-003, IO-004, IO-017). The I/O
  mapping editor of the project settings lists the channels of the selected
  board with their pin names, offers only those channels for a row and flags
  a row on an address the board does not have; a build fails with an error
  that names the variable, the address and the board when a variable is
  located where the board has no channel. An image word that no pin drives is
  listed under `io.virtual` in `zplc.json` (the `analog_test` temperature in
  `%QW4` is one). Hardware deploy admission compares the `io` identity that
  the firmware reports in `sys info --json` with the description Studio holds
  and the process-image bytes the program's code touches with the channels of
  the board, and refuses a mismatch with a message that names the board; a
  program that touches no I/O is not held back. The bundled examples are
  checked in CI: each targets the board its name and text state, its rows are
  channels of that board and it builds for it. The Waveshare RP2040-Zero also
  has its size budget and clang-tidy baseline for the cross-build matrix.
- Firmware I/O is driven by the board description, not by C source (IO-002,
  IO-005, IO-007, IO-018). `firmware/zephyr/scripts/gen_io_table.py` turns the
  board's entry of `boards.json` into the I/O table at build time and the
  scheduler, the HAL and the single-task loop synchronize the process image
  through it, so a channel is an edit of the JSON and of the overlay and no
  C change; a board that is not in the manifest keeps the old `led0`-`led3`,
  `sw0`-`sw3` and `adc` map as a default profile. The generated file asserts
  that every described alias, pin and controller is the devicetree's and
  stops the build with a message that names the channel when they differ. The
  GPIO and the analog inputs are configured in `zplc_hal_init()`, before the
  runtime can enter RUN, and a required channel that cannot be configured
  fails it. The image sizes are what the channels need, with Kconfig
  overrides and a build assertion; the memory behind the images stays the 4 KB
  of the instruction set (shrinking it is a contract change). `sys info
  --json` reports the identity of the description (`io`). The native_sim suite
  `io_table` runs the same test over two descriptions, one with three outputs
  and an input more, and a host test covers the accessors every port shares.
  `tools/ci/check_hal_contract.py` fails when a HAL function lacks an
  implementation on a port or a caller, and `zplc_hal_mutex_destroy()` is now
  implemented on the Zephyr and WebAssembly ports. Six functions have no caller
  yet and are listed in `tools/ci/hal-contract.json` with the decision they
  wait for.
- The board manifest is one unversioned file with an I/O description per board
  (IO-001, IO-009 to IO-012, IO-014, IO-015). `firmware/app/boards/boards.json`
  replaces `supported-boards.v1.5.0.json` and is the only source of the board
  table for Studio, the docs, CI and the MCP `boards_list` tool. Each of the
  seven profiles lists its channels with direction, kind, IEC address, pin or
  terminal name, devicetree binding, electrical notes and safe value; the
  Raspberry Pi Pico maps its on-board LED (GP25) and four inputs, the ESP32-S3
  profile describes the ESP32-S3-DevKitC-1 (N8R8; the LilyGo T-Display S3
  settings moved to `boards/profiles/lilygo_tdisplay_s3.overlay`), the Arduino
  Opta maps its four relay outputs, and the Waveshare RP2040-Zero profile is a
  valid configuration listed in the manifest, built in CI and in the size
  budget. The support level is derived from the evidence records the manifest
  references and is no longer a field; with no record a board is
  `cross-build`. The reference page now shows each board's channels, the
  image bytes they need, the footprint from the size budget and the
  description hash. `tools/hil/validate_supported_boards.py` also accepts the
  `tidy_board` key of the cross-build matrix, which it rejected.
- Three of the fifteen modules over the new size limit are split (IDE-014): the
  project settings are one module per section (2,181 lines to 213 and eleven
  files of at most 430), the Explorer's context menu and confirmations are
  their own module, and the declaration of `window.electronAPI` is out of the
  shared types. Twelve remain on `tools/ci/module-size-offenders.json`, each
  with the work package that owns its split.
- The declared-interlock coverage check is a view of its own (IDE-032): an
  **Interlocks** tab in the lower panel, no longer a section of Problems. It
  runs the same check on the saved project, lists each declared pair as
  Covered or Missing exact NEVER coverage, and keeps its scope text: it checks
  saved scenarios and establishes no physical safety, timing or certification.
- Scenario tests with temporal assertions give the same result from Studio, the
  CLI and the MCP tools, and a test says so (IDE-031):
  `src/cli/scenarioParity.test.ts` runs every bundled project, each scenario by
  itself, and a project with a failing assertion through the Tool API, the CLI,
  the MCP dispatcher and the Studio presenter, and compares the verdict, the
  program and trace hashes, and the assertions and sampled outputs. No
  divergence was found: the three entry points share the Tool API.
- The project tree lists the project's function blocks, functions and data
  types, and a library folder makes its blocks available to every editor
  (IDE-023). Under the file tree the Explorer has a Declarations section with
  the declarations that the Structured Text files the build reads declare
  (directly in `src` and directly in each folder of `libraries`), grouped under
  their file; choosing one opens the file at its name. It uses the build's own
  rules for `libraries` (`buildOptions.ts`, the workspace reader of the Tool
  API) instead of a mechanism of its own: **Library folder...** lists a folder
  in `zplc.json`, the tree marks it `library`, and the blocks of its files are
  in the FBD and LD palettes and in the completion and hover of ST. A file the
  build does not read (neither in `src` nor directly in a library folder) is
  marked `not compiled` in the tree and its folder is offered with a **List as
  library** button; the walk that finds such files is one module
  (`project/unlistedSources.ts`) that the Tool API and Studio both use.
- A project exports to one archive and imports back into an equivalent project
  (IDE-022). **Export Project Archive** (Build options) writes a zip of the
  project files that is the same bytes on every machine (entries sorted by
  path, stored, dated 1980-01-01); **Import a project archive** (Welcome)
  reads one, says what it holds, and extracts it byte for byte into an empty
  folder the user chooses before opening it. Both go through typed operations
  of the main process behind native dialogs, and the reader refuses paths that
  leave the folder, links, encryption, colliding names, checksum mismatches
  and archives over the limits. A version 1 project, opened or imported, shows
  the lines its migration changes in `zplc.json` in a dialog of its own, and
  **Apply migration** is the save.
- The Welcome screen loads without the code editor, the visual editors or the
  project settings (IDE-015): the workbench (toolbar, editor area and lower
  panel) loads when a project opens, and each editor and the settings load the
  first time a file of their kind or the settings are opened. The entry chunk
  of the page went from 5.2 MB (1.34 MB gzipped) to 0.9 MB (0.23 MB gzipped).
  Only the Monaco core Studio uses is bundled, so the CSS, HTML, JSON and
  TypeScript language workers (about 9 MB) and the 80 basic languages are no
  longer built, and the installer holds no source maps. `welcomeBundle.test.ts`
  proves it on the build output, and journey 38 on the development host.
- CI checks the structure of Studio's source (IDE-014, IDE-033):
  `tools/ci/ide-structure.ts`, run by `bun run lint:ide` and by
  `bun test ./tools/ci`, fails when a store module imports a component, when a
  command-line or MCP module imports from `electron/`, when static imports form
  a cycle (the path of each cycle is printed), and when a hand-written module
  has more than 800 lines. The modules above the limit today are on
  `tools/ci/module-size-offenders.json`, one entry each with its size and the
  split it needs; the list can only shrink. The one command-line import of the
  Electron folder that cannot move yet (the native simulation supervisor) is on
  `tools/ci/layering-exceptions.json` with the reason. The store no longer
  imports the breakpoint helpers or the build-evidence types from `components/`,
  and the sensitive-configuration helpers no longer form an import cycle with
  the file system and export modules.
- The reference pages are generated, in English and Spanish, from the sources they describe, and CI
  fails when one is stale (DOC-006, DOC-007, DOC-008, DOC-014). A page per language (ST, IL, LD, FBD,
  SFC) is read off `conformance/matrix.json`, the executed cases and the expected-failures list, with
  the I/O addressing and what is not supported; the 57 functions, the 240 type conversions and the 34
  function blocks of the compiler registry each have a signature or pin table, a description and an
  example that CI compiles and runs; the Kconfig options, shell commands, `zplc.json` fields, scenario
  files, `zplc-cli` commands, MCP tools and resources, and runtime session requests are read off their
  source files. A check reads every code span of the documentation and fails on a Kconfig symbol,
  shell command, C name, IEC call or repository path that the source does not have; what is
  deliberately absent is listed with its reason in `docs/doc-claims-allowlist.json`. No editor
  screenshot is published yet: the language pages say so instead of showing a drawing.
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

- Learn lessons are data packages with one generated index of ids (LRN-009, LRN-027,
  LRN-028). Each of the ten lessons lives in `packages/zplc-ide/lessons/<id>/`: a manifest
  (id, version, module, level, prerequisites, languages, tracks, plant, estimated time,
  starter, solution, and the reference scenario with its content hash), English and
  Spanish text with the same structure, learning objectives, two hint levels, and the
  reference scenario. `tools/ci/generate-lesson-index.ts` produces
  `src/generated/lessonIndex.ts`, which the panel, the progress store and the MCP course
  resource read; CI fails when a product file keeps a list of lesson ids, when the index
  is stale and when a scenario changes without its hash and version being raised. The
  text marks the times and values it quotes and the generator expands the markup once,
  so no lesson string is replaced when the application runs (LRN-038). Adding a lesson
  needs no change to application code: see Contributing.
- A lesson is graded against the scenario of its package, not the one in the learner's
  folder (LRN-022, LRN-023, LRN-026). The new `lessonCheck` of the Tool API runs the
  program of a workspace against the scenario the lesson package carries, identified by
  its content hash, and returns a grade record: lesson id and version, scenario hash,
  program hash, runtime version and time, which is the same for the same program and
  scenario but for the time. A failed check lists each failed assertion with its instant,
  the values expected and observed, and the address of that sample in the recorded trace.
  The panel no longer grades a run whose recorded assertions are not those of the lesson
  scenario, and shows the failures, the objectives and the hints. A run that failed was
  shown as "evidence is incomplete" in the real application, because a failed run reports
  no scenario count; it is now graded as failed and lists its failed assertions.
- The Learn panel grades with the lesson check (LRN-022). A **Check** button sends the id
  of a lesson to the main process, which runs the saved program of the shown project
  against the scenario of the lesson package in the tool worker (cancellable, one run at a
  time, bound to the folder on screen, recorded in the execution audit as a scenario run)
  and answers a grade record or a fixed reason; the renderer validates the answer again.
  The scenario files of the learner's folder are never read, so an edited scenario cannot
  pass a lesson. The panel records the grade, the hints and the solutions shown and the
  last lesson through typed progress operations, and opens the last lesson again.
- Lesson CI runs for every lesson and both languages (LRN-025): the starter fails the
  reference scenario because an assertion fails, the reference solution passes it, wrong
  programs stay red, other correct programs pass, every time and value the text quotes
  exists in the scenario and every file it cites exists in the starter. The table of
  wrong programs moved from TypeScript to `checks.json` of each package.
- Lesson 5 has the learner edit a Ladder program and lesson 10 has an Edit stage
  (LRN-038). The starter `blinky_starter` is now the Ladder blinker with its two TON
  rungs drawn and the SET and RESET coil rungs missing, and its reference solution is the
  `blinky` Ladder project; the graded scenario is unchanged, so a Structured Text
  solution still passes. Lesson 10 gets the Edit stage the other lessons have.
- Learn progress is one versioned file, `zplc-learn-progress.v2.json`, in the user-data
  directory (LRN-031, LRN-032): passed lessons with their grade record, lessons in
  progress, the last lesson, and the hints and solutions used. The progress file of the
  earlier release (`zplc-learn-mastery.v1.json`) is migrated in memory when the new file
  does not exist and is never written or deleted. The store exports and imports the whole
  document, validates it exactly, merges it with the newest grade first, and keeps
  progress for lessons it does not know. The MCP course resource reads the new file and
  stays read-only (LRN-034). The IPC contract gains `learn-progress:read-progress`,
  `record-grade`, `note-lesson`, `export` and `import`, each with an exact request schema,
  and `workspace-tests:lesson-check`; Export and Import progress in the panel move the
  whole document on the desktop.
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
- The element of a build diagnostic (LNG-003) crosses the compile channel: the main
  process keeps it on each diagnostic of a failed build when it is an element id (at
  most 256 characters, the forms of `models/sourceElements.ts`) and drops it
  otherwise, the window passes it to the Problems panel, and activating the problem
  selects that element, also when the open file has changed since the build; without
  one, the element is derived from the open file as before.
- Any input that the running program declares can be set from Studio in native
  simulation, not only three motor signals (IDE-024). The **Simulation inputs**
  section of the Watch tab lists the variables mapped to the input image (whatever
  their name) and the inputs of the programs, with their address and live value,
  and sets each one: a TRUE/FALSE switch for a BOOL (only its own bit changes) and
  a number box for the other numeric types, with **Force** for the types a force
  carries. The build marks the program inputs that have no direct address in the
  debug map (`zplc:input` tag).
- The security properties of Studio are proven by what the running application
  does (IDE-016): an inline script and an inline event handler that a page injects
  are blocked by the production policy, a permission other than serial is
  refused, `window.open`, a `_blank` link and navigation to another origin are
  refused, and a project operation given `..`, an absolute path, or a link that
  leaves the project is refused. The probes run on the development host (journey
  29) and, with `ZPLC_PACKAGED_DIST`, on the packaged application. They found that
  a navigation the window refused still revoked its authority (its project folder
  and its IPC) until a reload; only a navigation that can replace the document
  revokes it now.
- Studio shows the result of a build, a save, a deploy, a connection change and
  a test run as a notification that opens the panel with its details, and shows a
  long operation with progress and a **Cancel** action (IDE-021). A success goes by
  itself after a few seconds; a failure, a warning and a cancellation stay until
  dismissed. The messages of the Output panel are unchanged.
- Compile, safety check, scenario tests and the candidate review run outside the
  main process and can be cancelled (IDE-012). Each request starts a worker
  process of its own (`electron/toolWorker.ts`, bundled with the Tool API); the
  window keeps answering while it works, **Cancel scenarios** stops a run and the
  native runtime it started, a run that does not answer a cancel is killed, and a
  deadline kills a worker that never finishes. A cancelled run is recorded as
  cancelled in the execution log.
- Studio defines every IPC channel once and answers all of them through one
  checked table (IDE-017). `electron/ipcContract.ts` names the channels for the
  main process, the preload and the renderer (the preload is now bundled into one
  script that requires only `electron`, so it keeps no copy; the project archive
  channels of IDE-022 are part of the project-files group there, and
  `projectArchiveProtocol.ts` re-exports them); the main process
  refuses to start when a channel has no handler or a handler has no channel, and
  every call is checked for its sender, its message and the freshness of the
  document before any handler runs. The processes that Studio starts for compile,
  test and firmware build (the native runtime, `west build`, the toolchain
  probes) come from a closed list of fixed argument vectors and never take a
  command or an argument from the renderer.
- Build and Test act only on the project that the editor shows (IDE-002). The
  build, safety-check and test-run requests carry the id of the window's folder,
  and the main process refuses a workspace that is not that folder's (a stale
  workspace after another folder was opened, or a `zplc.json` of another
  folder). A crafted message for another project is refused.
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
- A call to `WATCHDOG_RESET()` is reported by the build with the warning
  `WATCHDOG_RESET_NO_EFFECT` at the call (RT-034): it compiles to nothing, no
  opcode feeds the hardware watchdog, and the runtime feeds it itself after each
  completed scan. It is a warning, not an error, so programs that call it still
  build; `compiler.warnings` selects it (the level `default` reports it). The
  bundled `kitchen_sink` fixture keeps its call, which exercises the function,
  and already selects no warnings.
- **Contract change, draft counter 4 -> 5.** A STRING argument of a communication
  block reaches the handler (COM-005). The compiler stored the *address* of
  the literal into the first four bytes of the member, so the handler of
  `MQTT_PUBLISH` read an empty topic and an empty payload, and every other
  STRING input (`HOST`, `DEVICE_ID`, `TOPIC`, `EVENT_TYPE`, `TEMPLATE_NAME`)
  was empty too. It now writes the capacity the member has room for and copies
  the string into it (`STRCPY`), in the `[len u16][cap u16][data][terminator]`
  layout of the string table, and reading a STRING member (`LEN(Pub.TOPIC)`)
  is the address of the member like any other string. The layout table
  itself put the STRING members of `AZURE_DPS_PROV`, `AZURE_EG_PUB` and
  `AWS_FLEET_PROV` over one another, and `THING_NAME` past the end of its
  block: the second member began 65 bytes after the first and each takes 85.
  The blocks are 179, 264 and 179 bytes now (`ASSIGNED_HUB` and
  `THING_NAME` at 93, `EVENT_TYPE` at 93, `PAYLOAD` of the event at 178), the
  contract generator refuses a member that ends past its block or over the
  next member, and the new status `ZPLC_COMM_UNAVAILABLE` (10) is the answer of
  a block whose service this runtime does not have. The last byte of every
  block that has a layout belongs to the dispatcher, which keeps there the EN
  of the previous call to tell a rising edge from an EN that stays TRUE (one
  trigger, one operation: COM-004); `AZURE_C2D_RECV`, `AZURE_DPS_PROV`,
  `AZURE_EG_PUB`, `AWS_FLEET_PROV` and `SPB_REBIRTH` grow by that byte. Artifacts built before
  this draft are refused and must be rebuilt; a device with the older
  firmware is refused by Studio and must be reflashed.
  `tools/contract/string_cross.py` compiles a program that gives every STRING
  input of the twelve blocks its own text and reads each member back with the
  accessors of the handlers.
- **The twelve communication and cloud blocks have one handshake and none of them
  waits inside the scan** (COM-002, COM-003, COM-004, COM-008, COM-018). A Modbus
  block was BUSY for ever: the dispatcher never called the handler again once
  BUSY was set, so the worker's result was never taken, and a falling and rising
  EN gave back the old result without a new request. The cloud blocks repeated
  their operation on every scan while EN stayed TRUE, and `AWS_FLEET_PROV`,
  `AZURE_DPS_PROV` and the Event Grid publish waited for a broker for up to 30
  seconds inside the scan. Now a rising EN is one request; the handler is called
  on every scan while it is in flight; the result (DONE, or ERROR with a status
  code) is held while EN stays TRUE and cleared when it falls; a request in
  flight completes even when EN falls, and a reset lets go of it without
  releasing what the worker still uses. A request goes to a slot
  (`zplc_comm_req.h`) that a worker thread answers: the Modbus client, the MQTT
  client thread and, for the two provisioning services, a worker thread of their
  own (8 KB of RAM on the boards that have a cloud profile). `ASSIGNED_HUB` and
  `THING_NAME` are filled in; `MQTT_SUBSCRIBE` and `AZURE_C2D_RECV` deliver their
  messages in `PAYLOAD` with `VALID` for one scan (they never did);
  `SPB_REBIRTH` publishes the birth certificate again once for each rising
  edge. A request older than its time limit is `ERROR` with `STATUS` 2 and its
  late result is dropped; a message queued when the session goes down is
  failed, not sent on the next session. `STATUS` holds one of the documented
  codes, not a raw errno. The handshake and the time limits of each block are
  in `docs/docs/runtime/communication-function-blocks.md`.
- **A Modbus RTU request to a responsive device succeeds within the configured
  timeout, and the TCP client takes a response whole** (COM-012, COM-006,
  COM-018). The RTU client passed its timeout in milliseconds into the field
  the Zephyr Modbus client reads in microseconds, so the interface waited a
  thousandth of the configured time (0.5 ms for the default 500 ms) and every
  request to a device timed out before the first byte of an answer could arrive.
  The TCP client read the response with one `recv()`, so an answer that came in
  two segments was refused, did not check the transaction, the unit, the length or
  the count it had asked for, took any exception for `-EIO`, and connected
  without a time limit. It now connects without blocking past the configured
  time, sends all of the request, puts the response together from the stream,
  and accepts only the answer to its request: another transaction, another unit,
  a short frame or a count that is not the one asked for is a protocol error
  (`STATUS` 8), an exception response is a protocol error too, and silence is a
  timeout (`STATUS` 2) after the configured time. The frames are built and read
  by `zplc_modbus_tcp.c`, which the server of the product already used, so the
  host tests run the client's requests through the server. `firmware/tests/
  modbus_client_tcp` runs the client against a Modbus TCP server written for the
  test on the loopback interface of native_sim. No serial device is used by any
  of it: the RTU path is checked at the interface parameters, and the
  hardware record of an RTU exchange on the Pico is not made.
- **The four Modbus areas are four address spaces, and the server serves the
  whole of WORK and RETAIN** (COM-011, COM-013). A coil, a discrete input, an
  input register and a holding register with the same number were one
  variable: the server found a variable by the number of its tag and did not
  look at the area of the request. The number of a `{modbus:N}` tag now says the
  area in the notation of the Modbus world: 10001 to 19999 are discrete inputs,
  30001 to 39999 input registers, 40001 to 49999 holding registers, and any
  other number is a coil for a BOOL and a holding register for any other type,
  at that address, so a project that wrote no prefix keeps its addresses.
  The IDE writes the number from the area of the communication tag and from the
  `MODBUS_*` helper (the area of a tag was kept in the project and dropped by the
  build); a number that cannot be written is a build error at the line of the
  helper. The Modbus client polls a tag at the address of its area and no
  longer asks the remote device for the number of the tag. A variable at
  `0x3000` to `0x3FFF` of WORK could not be bound at all (the loader and the
  compiler refused the tag because the adapters discarded the high offset);
  every adapter reaches memory through the exchange with its whole 16-bit
  address now, and the guard is gone. `firmware/tests/modbus_areas` loads a
  program with the tags of the four areas, the edges of WORK and RETAIN and
  address 65535 and reads and writes them through the seams both servers end in;
  `firmware/tests/modbus_client_tcp` polls tags against a server on loopback.
- **The Modbus and MQTT blocks run in simulation, against endpoints on the
  loopback interface** (COM-009, COM-006). The native runtime answered every
  communication block `STATUS` 3 and had no peer to talk to. It now links the
  same Modbus and MQTT handlers as a controller (the sources of `firmware/app`,
  over a POSIX shim of the few Zephyr kernel calls they make), on a Modbus TCP
  client whose transaction code is the file the controller compiles too
  (`zplc_modbus_tcp_client.inc`) and on an MQTT 3.1.1 client of the host. It is
  off until the session starts the runtime with `ZPLC_NATIVE_COMM=1` (and
  `ZPLC_NATIVE_MQTT_BROKER=host:port`), so a runtime started the old way
  answers as before. A Modbus RTU request and every cloud block answer
  `STATUS` 10 (not available in this runtime). `zplc_loopback`, built with the
  runtime, starts a Modbus TCP server and an MQTT broker on 127.0.0.1 and ends
  when its input closes. `test_host_comm` runs every block against them on real
  sockets (success, timeout, exception, refusal, reset while busy, a scan that
  never waits for the peer, one request for one rising EN, loss of the MQTT
  session, a message published while it is down that fails at once and is not
  sent on the next one, reconnection and
  the silent loss) and passes under the address, undefined-behaviour and thread
  sanitizers; `packages/zplc-ide/src/conformance/communication.test.ts` runs a
  program on the runtime through the session protocol. **Not done: Studio does
  not start the endpoints for a session yet**, and nothing here was run
  against a real device, broker or cloud service.
- Release engineering that a Linux machine can prove (REL-005, REL-006, REL-012,
  REL-013, REL-021, REL-022, REL-025, REL-028, REL-032, REL-036).
  `scripts/release/firmware-images.ts` collects one `west build` of `firmware/app`
  per board (it refuses an image made for another board, version or commit, from a
  dirty tree or with the HIL trace), assembles the boards into one
  `zplc-runtime-<version>.manifest.json` with each image's SHA-256, build identity,
  flash runner and address (read from the build's own `runners.yaml` and `.config`)
  and the evidence level of its board, and stages the manifest and the two learner
  images for the installers (`extraResources` `firmware`). The release workflow
  builds the seven boards (`build-firmware`), assembles them (`assemble-firmware`),
  and checksums, attests and uploads them in a chain of their own; the three desktop
  builds wait for the set but not for its success. The main process lists the
  installation's images through one typed, argument-free channel
  (`firmware-images:list`), the renderer validates the answer again, and the card has
  no operation that writes to a board. `scripts/release/udev-rules.ts` writes the
  udev rule from `tools/hil/usb-ids.json` in the `beforePack` hook and fpm installs it
  in both packages; `linux-package-files.ts` reads it out of the packages that were
  made. The Linux payload reproducibility check is `continue-on-error` and no job
  waits for it. The workflow launches the AppImage in a clean container, mounts the
  DMG, unpacks the ZIP, installs the NSIS setup silently and launches the portable
  executable. **Not done: none of those workflow steps has run** (they need hosted
  macOS and Windows runners and Docker), no release has been made by the pipeline, no
  board has a hardware record, and the udev rule covers only the boards with a
  recorded USB identifier.

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
