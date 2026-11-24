# ZPLC hardware-in-the-loop tools

Scripts that run a program on a board, or on a stand-in for one, and say whether it did what it should.
A board is a physical thing: **a person runs every command here that touches one**. Neither AI tools nor MCP
start a flash, a deploy, a force, a RUN or STOP, or a raw serial session (AGENTS.md rule 7, HIL-003).

Nothing here is compiled ahead of time and checked in: a run compiles the fixtures with the repository compiler into
a temporary directory that it removes (HIL-006).

## Run

```bash
# one command per board; it prompts you at every physical step and writes a run record (HIL-012)
python3 tools/hil/run_chain.py rpi_pico

# the language suites, or one script
python3 tools/hil/run_all_languages.py --port /dev/ttyACM0
python3 tools/hil/test_loop.py
```

Talking to a real board needs pyserial (`pip install pyserial`); nothing else here does.

The serial port is, in this order: `--port` (a script that takes one), `ZPLC_SERIAL_PORT`, then found by the USB
identifiers of the board in `usb-ids.json`. When two devices match, or none does, the script stops and names what it
saw: it never guesses (HIL-007). No port path is written in any script.

Without a board, a script can run on a fake device with `ZPLC_HIL_DEVICE=null` (shows nothing, every check fails) or
`ZPLC_HIL_DEVICE=host` with `ZPLC_NATIVE_SIM_BIN` naming the native runtime (`zplc_runtime`). A record made on a fake
says so and is never hardware evidence.

## Exit status (HIL-004)

| Status | Meaning                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| 0      | every check held                                                                                                 |
| 1      | a check failed, or the script made no check                                                                      |
| 2      | no device could be used: no port chosen, the port would not open, or the fixture would not compile               |
| 77     | skipped: the firmware image has no HIL trace (`CONFIG_ZPLC_HIL_DEBUG` is off, as in a release image); not a pass |

## Scripts

| Script                                                                                                                         | What it does                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `run_chain.py`                                                                                                                 | The whole chain for one board, prompting for each physical step; writes a run record (HIL-009, HIL-012). |
| `run_all_languages.py`                                                                                                         | The IL, LD, FBD, SFC and ST suites and the reference projects.                                           |
| `run_all_hil_tests.py`                                                                                                         | The opcode-level scripts. They need a firmware image with the HIL trace.                                 |
| `test_il_suite.py`, `test_ld_suite.py`, `test_fbd_suite.py`, `test_sfc_suite.py`, `test_st_suite.py`, `test_examples_suite.py` | A language's fixtures, or the reference projects, on the device.                                         |
| `test_*.py` (the others)                                                                                                       | One fixture, or one family of opcodes, on the device. Each exits non-zero when a value differs.          |
| `test_modbus_tcp.py`, `test_modbus_rtu_serial.py`, `test_comm_security.py`                                                     | Fieldbus and communication security on a board, against a local endpoint. They take `--port`.            |
| `verify_compilation.py`                                                                                                        | Compiles every fixture and reference project (no device). Exits 1 when one does not compile.             |
| `run_board_matrix.py`                                                                                                          | The cross-build of every supported board (no device).                                                    |
| `audit_*.py`, `validate_*.py`                                                                                                  | Repository truth checks that CI runs.                                                                    |

## Bench utilities (HIL-004)

These do not judge a result, so they cannot fail a run. A person runs them to look at a board, and they are
listed with their reason in [`non-gating.json`](non-gating.json), which `test_hil_scripts.py` keeps in step with this
table and with the directory.

| Script              | Purpose                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `check_alive.py`    | Wake a board's shell with a CR, ask `help`, and print what comes back.                                            |
| `check_hw.py`       | Open the port, wake the shell, ask `help` and print the first bytes of the answer.                                |
| `debug_peek.py`     | Write the input and output images with `zplc dbg poke` while the board is stopped, then read them back.           |
| `inspect_zplc.py`   | Print the header, segment table and contract draft of a `.zplc` file (no device).                                 |
| `rescue.py`         | Send a break, then `zplc stop` ten times and `zplc reset`, to bring back a board that is stuck.                   |
| `rescue_device.py`  | Send Ctrl+C and Enter five times, then `zplc stop`, and say whether the board answered.                           |
| `sniff.py`          | Load a four-byte program, start it in verbose HIL mode and print every line the shell says for five seconds.      |
| `plant_io_bench.py` | Plant I/O mode on a board: latency per frame, continuity and three physical checks a person confirms (see below). |

## Plant I/O mode on a board (LNK-011, LNK-014, LNK-016)

`plant_io_bench.py` feeds a board from a synthetic plant over the framed link (`zplc link <hex>` lines, as Studio does),
records the round trip and the exchange gap of every frame, and asks a person to confirm three physical behaviours.
`validate_plant_io_evidence.py` judges the file it writes against
`specs/012-zplc-2-1-plant-simulation/evidence/plant-io.schema.json`. **A person runs both; no agent does.** The bench
refuses to start unless stdin is a terminal and the person types the board id. It never flashes and never deploys: it
checks that the program the board holds has the CRC-32 of the file given with `--program`. It sends RUN only if that
program is stopped, and says so first.

The synthetic map: inputs are 4 BOOL (IPI 0.0 to 0.3), an INT (IPI 2) and a REAL (IPI 4); outputs are 2 BOOL (OPI 0.0
and OPI 0.1). The echo program copies IPI 0.0 and IPI 0.1 to OPI 0.0 and OPI 0.1, so every response must carry the
two input bits of the frame the scan latched (`applied_seq`).

What the evidence holds: `level` (`hil` only for a real serial port; `native-sim` for the rehearsal), the commit of this
checkout, the firmware identity and `zplc version` output, the date, the tool versions, `rtt_ms` and `gap_ms`
(`count`, `p50`, `p95`, `p99`, `max`), the counts the board reports (`late`, `rejected`) and the bench's own
(`timeouts`, `refused`, `applied_seq` regressions, `echo_mismatches`), and the three physical sequences. `rtt_ms` is the
time from writing a request to reading its response; `gap_ms` is the time between two consecutive responses. `late`
counts every board scan that found no new frame: it is information, not an error. The validator fails a file when a
frame was rejected, refused, unanswered or not an echo, when `applied_seq` went backwards, when the board ended the mode
by itself (an `EVT_PLANT_EXIT` event), when the worst gap is above the limit the file records (the bench's `--max-gap-ms`,
default 250; the validator's own `--max-gap-ms` replaces it), or when a physical sequence is missing or
unconfirmed. Known firmware answers it reports by name: ENTER is refused with `RANGE` when the response cannot fit the
negotiated payload, and a frame from a session that does not own the mode answers `STATE`.

The three sequences (each announced, each confirmed by typing `yes`): **mirror off** (outputs toggle, the LED stays
off), **mirror on** (the LED follows the outputs), **link loss** (the script keeps streaming, you pull the USB cable,
it waits ten seconds, you plug it back; it then reads `zplc sched status --json` and the output image, which must be
`idle` and all zero, and you confirm the LED is off).

### The Owner's commands (Task H8 of specs/012-zplc-2-1-plant-simulation/plan-m6.md)

[`BENCH-2.1.md`](BENCH-2.1.md) is the run sheet for the two learner boards: the build, flash and deploy commands, the
port, the six runs, what the person sees at each prompt, the evidence files and what to have ready on the bench.

1. Build the HIL firmware for the board with the command `firmware/app/boards/boards.json` gives in `build_command`
   (`west build -b rpi_pico/rp2040 firmware/app --pristine` for the Pico; read the entry of `esp32s3_devkitc`, whose
   N8R8 PSRAM requirement is in its `note`), and flash it as `docs/docs/development/firmware-testing.md` and the board's
   page say. No tool of this repository flashes.
2. Compile the echo program and deploy that file to the board (Studio: Connect, Deploy; or the shell's `zplc load` and
   `zplc data`). Save this as `echo.st`:

   ```
   PROGRAM Echo

   VAR_INPUT
       In0 AT %IX0.0 : BOOL;
       In1 AT %IX0.1 : BOOL;
   END_VAR

   VAR_OUTPUT
       Out0 AT %QX0.0 : BOOL;
       Out1 AT %QX0.1 : BOOL;
   END_VAR

   Out0 := In0;
   Out1 := In1;

   END_PROGRAM
   ```

   ```bash
   bun packages/zplc-ide/src/cli/index.ts compile echo.st --output echo.zplc
   ```

3. Run the bench once per board and frame period (20 ms, then 10 ms and 50 ms: the latency evidence at three frame
   periods). It needs pyserial (the Python of the firmware workspace has it) and finds the port from the USB
   identifiers of the board, or from `--port`:

   ```bash
   python3 tools/hil/plant_io_bench.py --board esp32s3_devkitc --transport usb-serial --program echo.zplc \
     --frames 5000 --frame-ms 20 --out specs/012-zplc-2-1-plant-simulation/evidence/plant-io-esp32s3-usb-serial.json
   python3 tools/hil/plant_io_bench.py --board rpi_pico --transport usb-serial --program echo.zplc \
     --frames 5000 --frame-ms 20 --out specs/012-zplc-2-1-plant-simulation/evidence/plant-io-pico-usb-serial.json
   ```

   Give the 10 ms and 50 ms runs their own `--out` (for example `...-usb-serial-10ms.json`); the bench never overwrites
   a file.

4. Validate: `python3 tools/hil/validate_plant_io_evidence.py --level hil specs/012-zplc-2-1-plant-simulation/evidence/plant-io-*-usb-serial*.json`.
   A file that fails is still evidence of what happened: do not edit it, and report it.

### The rehearsal against the native simulator

The rehearsal shows that the script, the schema and the firmware agree; it says nothing about hardware, and its file
says `level: "native-sim"`. Build `firmware/app` for `native_sim/native` (`tools/firmware-test/run.sh app-native` builds
it), start `zephyr.exe` with `tools/hil/emulator/native_sim.py`'s `NativeSim` (it prints its pseudo-terminal, `/dev/pts/N`),
deploy the echo program with the shell's `zplc load` and `zplc data`, then:

```bash
python3 tools/hil/plant_io_bench.py --level native-sim --port /dev/pts/N --board rpi_pico --transport usb-serial \
  --program echo.zplc --frames 500 --frame-ms 20 --out specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json
python3 tools/hil/validate_plant_io_evidence.py --level native-sim specs/012-zplc-2-1-plant-simulation/evidence/plant-io-native-sim-rehearsal.json
```

`--level native-sim` accepts only a `/dev/pts/` port (or a fake device), asks nobody and holds no physical sequence.
`test_plant_io_bench.py` runs the bench and the validator on a Python fake of the board, with no port and no hardware.

## Fixtures

`il_tests/`, `ld_tests/`, `fbd_tests/`, `sfc_tests/`, `st_tests/` and `blinky_ld_gen.st` hold the language fixtures,
and [`fixtures.json`](fixtures.json) holds the expected value of each (HIL-005). The host test
`packages/zplc-ide/src/cli/hilFixtures.test.ts` compiles every fixture and runs its phases on the native runtime in
CI, and the suites run the same phases on a board, waiting for the device's own scan counter. Values are read while
the program runs: STOP puts the outputs in their safe state, so they read zero after it.

The opcode scripts (`test_system.py` and the ones like it) read the HIL trace frames that only a firmware image built
with `CONFIG_ZPLC_HIL_DEBUG=y` prints. No shipped board profile sets it (HIL-013): the image for these scripts is
built with `hil_debug.conf` of this directory on top of the profile, `west build -b <board> firmware/app --pristine --
-DEXTRA_CONF_FILE=<path of hil_debug.conf>`, and `run_chain.py <board> --hil-trace` prints that command with the path
filled in and records it. The identity the image reports (`zplc sys build --json`, `options`) says whether the trace is
on, and the record keeps it. On a release image those scripts exit 77.

## Run records (HIL-009)

Every hardware run writes a machine-readable record, `run-record.schema.json` in this directory, to
`build/hil-records/` (or `--out`). It carries the board and what the device reported about itself, the firmware
commit, version, ABI and build options as the image reports them (`zplc sys build --json`, REL-023; a field the image
does not report is absent, not guessed), the I/O description it reports (`zplc sys io --json`, IO-004) next to the one
`firmware/app/boards/boards.json` has for the board, the SHA-256 of every program and of the image the person says was flashed, each step with its
result and the time a person confirmed it by typing the identity the device reported, the tests with their results,
the tool versions, the operator and the raw shell log. `evidence` says how it was made: `hardware` only for a serial
link to a board, `emulated` for the emulated bench, never `hardware` for the host runtime or a fake; `evidence_level`
is the level of the HIL contract (only `hardware` raises a support level, and an emulated record names its emulator).
A record is bound to the image it tested and is committed afterwards, never in the commit the image was built from:
`test_hil_record.py` checks that the image commit of every record the manifest references is a strict ancestor of the
commit that added it. The measuring steps of HIL-010 (`hil_steps.py`) write their measurements and verdicts in it; a
step the bench cannot do is `skipped` or `not-emulable`, never passed. `bench.py` is the bench (a person, the
emulator, or a stand-in), `hil_endpoints.py` the local fieldbus endpoints, and `compare_sim.py` compares the
reference projects in native simulation and on a bench (HIL-015).

A hardware run that ends in pass or fail, of an image named with `--firmware-image` whose device reports a 40-digit
commit and a clean tree, also writes `<run>.evidence.json`: the flat `zplc.hil-record/1` record that
`firmware/zephyr/scripts/zplc_boards.py` reads for the support level of a board. The run record's `evidence-record`
log says when it was not written and why. Adding it to `evidence_refs` of the board is a person's edit.

## What a person must do

| Step                                                          | Who                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Flash the image                                               | a person; no tool here flashes                                                                                    |
| Name the port when more than one device matches               | a person (`--port`)                                                                                               |
| Type the identity the device reports at each physical step    | a person; `run_chain.py` and `zplc-hil run` refuse without an interactive terminal and have no flag that skips it |
| Wiring for the loopback, analog and fieldbus items of HIL-010 | a person, by the bench guide (HIL-014, docs/docs/development/hardware-in-the-loop.md)                             |
| Turn the potentiometer, cut the power, plug the board back in | a person, at the prompt of the chain, typing the identity the device reports                                      |
