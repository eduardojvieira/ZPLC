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

The serial port is, in this order: `--port` (a script that takes one), `ZPLC_SERIAL_PORT`, then found by the USB
identifiers of the board in `usb-ids.json`. When two devices match, or none does, the script stops and names what it
saw: it never guesses (HIL-007). No port path is written in any script.

Without a board, a script can run on a fake device with `ZPLC_HIL_DEVICE=null` (shows nothing, every check fails) or
`ZPLC_HIL_DEVICE=host` with `ZPLC_NATIVE_SIM_BIN` naming the native runtime (`zplc_runtime`). A record made on a fake
says so and is never hardware evidence.

## Exit status (HIL-004)

| Status | Meaning |
|--------|---------|
| 0 | every check held |
| 1 | a check failed, or the script made no check |
| 2 | no device could be used: no port chosen, the port would not open, or the fixture would not compile |
| 77 | skipped: the firmware image has no HIL trace (`CONFIG_ZPLC_HIL_DEBUG` is off, as in a release image); not a pass |

## Scripts

| Script | What it does |
|--------|--------------|
| `run_chain.py` | The whole chain for one board, prompting for each physical step; writes a run record (HIL-009, HIL-012). |
| `run_all_languages.py` | The IL, LD, FBD, SFC and ST suites and the reference projects. |
| `run_all_hil_tests.py` | The opcode-level scripts. They need a firmware image with the HIL trace. |
| `test_il_suite.py`, `test_ld_suite.py`, `test_fbd_suite.py`, `test_sfc_suite.py`, `test_st_suite.py`, `test_examples_suite.py` | A language's fixtures, or the reference projects, on the device. |
| `test_*.py` (the others) | One fixture, or one family of opcodes, on the device. Each exits non-zero when a value differs. |
| `test_modbus_tcp.py`, `test_modbus_rtu_serial.py`, `test_comm_security.py` | Fieldbus and communication security on a board, against a local endpoint. They take `--port`. |
| `verify_compilation.py` | Compiles every fixture and reference project (no device). Exits 1 when one does not compile. |
| `run_board_matrix.py` | The cross-build of every supported board (no device). |
| `audit_*.py`, `validate_*.py` | Repository truth checks that CI runs. |

## Bench utilities (HIL-004)

These do not judge a result, so they cannot fail a run. A person runs them to look at a board, and they are
listed with their reason in [`non-gating.json`](non-gating.json), which `test_hil_scripts.py` keeps in step with this
table and with the directory.

| Script | Purpose |
|--------|---------|
| `check_alive.py` | Wake a board's shell with a CR, ask `help`, and print what comes back. |
| `check_hw.py` | Open the port, wake the shell, ask `help` and print the first bytes of the answer. |
| `debug_peek.py` | Write the input and output images with `zplc dbg poke` while the board is stopped, then read them back. |
| `inspect_zplc.py` | Print the header, segment table and contract draft of a `.zplc` file (no device). |
| `rescue.py` | Send a break, then `zplc stop` ten times and `zplc reset`, to bring back a board that is stuck. |
| `rescue_device.py` | Send Ctrl+C and Enter five times, then `zplc stop`, and say whether the board answered. |
| `sniff.py` | Load a four-byte program, start it in verbose HIL mode and print every line the shell says for five seconds. |

## Fixtures

`il_tests/`, `ld_tests/`, `fbd_tests/`, `sfc_tests/`, `st_tests/` and `blinky_ld_gen.st` hold the language fixtures,
and [`fixtures.json`](fixtures.json) holds the expected value of each (HIL-005). The host test
`packages/zplc-ide/src/cli/hilFixtures.test.ts` compiles every fixture and runs its phases on the native runtime in
CI, and the suites run the same phases on a board, waiting for the device's own scan counter. Values are read while
the program runs: STOP puts the outputs in their safe state, so they read zero after it.

The opcode scripts (`test_system.py` and the ones like it) read the HIL trace frames that only a firmware image built
with `CONFIG_ZPLC_HIL_DEBUG=y` prints. The shipped profiles of the Pico and the ESP32-S3 set it today; release firmware
must not (HIL-013), so on a release image those scripts exit 77.


## Run records (HIL-009)

Every hardware run writes a machine-readable record, `run-record.schema.json` in this directory, to
`build/hil-records/` (or `--out`). It carries the board and what the device reported about itself, the firmware
commit, version and ABI as the image reports them (fields that the image does not report yet are null, not guessed;
REL-023 will add them), the SHA-256 of every program and of the image the person says was flashed, each step with its
result and the time a person confirmed it by typing the identity the device reported, the tests with their results,
the tool versions, the operator and the raw shell log. `evidence` says how it was made: `hardware` only for a serial
link to a board, never for the host runtime or a fake. A record is bound to the image it tested and is committed
afterwards, never in the commit the image was built from; the steps of HIL-010 that the chain cannot run yet are in it
as `pending`, each with what it lacks.

## What a person must do

| Step | Who |
|------|-----|
| Flash the image | a person; no tool here flashes |
| Name the port when more than one device matches | a person (`--port`) |
| Type the identity the device reports at each physical step | a person; `run_chain.py` and `zplc-hil run` refuse without an interactive terminal and have no flag that skips it |
| Wiring for the loopback, analog and fieldbus items of HIL-010 | a person; the bench guide (HIL-014) is TO BE FILLED by the one who does the bench run |
