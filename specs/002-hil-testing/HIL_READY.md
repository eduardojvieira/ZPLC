# HIL Qualification Status — Pending

**Status:** qualification pending. This repository does not currently contain
SHA-traceable HIL evidence for a ZPLC release or board profile.

## What Exists

- A firmware HIL debug surface, including structured debug/trace hooks guarded
  by `CONFIG_ZPLC_HIL_DEBUG`.
- The `@zplc/hil` package and prototype runner, with frame parsing, assertions,
  retries, and JUnit reporting support. Its compile and upload stages are
  explicitly mocked; it is not an executable hardware qualification chain.
- Package typechecking and repository manifests/evidence templates that define
  the records a future run must capture.
- Proposed serial and network evidence records:
  [`evidence-board-serial.md`](../008-release-foundation/artifacts/evidence-board-serial.md)
  and
  [`evidence-board-network.md`](../008-release-foundation/artifacts/evidence-board-network.md).

## Candidate Boards for First Qualification

1. **Raspberry Pi Pico (RP2040)** — board ID `rpi-pico-rp2040`, IDE ID
   `rpi_pico`, Zephyr target `rpi_pico/rp2040`.
2. **ESP32-S3 DevKitC** — board ID `esp32-s3-devkitc`, IDE ID
   `esp32s3_devkitc`, Zephyr target `esp32s3_devkitc/esp32s3/procpu`.

Neither profile is HIL-verified or production-qualified by this document.

## What Is Still Required

Before HIL can be claimed, a trusted, human-operated procedure must produce
and retain evidence for the exact candidate SHA and hardware revision:

1. Build the firmware from a clean checkout and record the resulting artifact
   hash and toolchain/configuration metadata.
2. Flash the identified board through a human-approved physical operation, then
   verify the firmware identity on that board.
3. Deploy a verified `.zplc` program through the supported program-loading
   path, execute its scenario, collect the trace, restart the target, and
   verify the required persistence and safe-state behavior.
4. Store the results, failures, board revision, transport, and test artifacts
   in the corresponding serial or network evidence record.

There is no current end-to-end build → flash → firmware-SHA verification →
program deploy → scenario → restart/persistence chain. The CLI does not expose
HIL orchestration, device discovery, upload, execution, or debug commands for
this purpose. The retired hardware workflow is intentionally absent: untrusted
pull requests must never execute on a privileged hardware runner.

For planned bench setup and safety preparation, see
[`docs/PHYSICAL_TESTING_GUIDE.md`](../../docs/PHYSICAL_TESTING_GUIDE.md). It is
a proposed procedure, not evidence that either board has been qualified.
