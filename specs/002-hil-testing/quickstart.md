# HIL Qualification Procedure — Not Yet Executable

**Feature:** 002-hil-testing
**Status:** qualification pending

There is no runnable HIL quickstart in the current repository. The HIL package
contains a typed prototype and test-oriented utilities, but its compile/upload
path is mocked and the public CLI does not provide a supported HIL execution
flow. Do not treat host, simulator, typecheck, or cross-build results as HIL
evidence.

## Preconditions for a Future Procedure

- A trusted, manually approved runner and a clean checkout at the exact SHA
  under test; untrusted pull requests must not access hardware, USB devices,
  keys, or the runner network.
- One identified candidate board and revision: Raspberry Pi Pico (RP2040),
  board ID `rpi-pico-rp2040`, IDE ID `rpi_pico`, Zephyr target
  `rpi_pico/rp2040`; or ESP32-S3 DevKitC, board ID `esp32-s3-devkitc`, IDE ID
  `esp32s3_devkitc`, Zephyr target `esp32s3_devkitc/esp32s3/procpu`.
- A human-approved flash/deploy/run process with safe outputs, recovery, and
  restart behavior defined before the device is energized.
- An implemented, non-mocked chain that records the firmware artifact SHA,
  verified device identity, `.zplc` program hash, scenario result, trace, and
  restart/persistence result.

Bench preparation and the intended safety checks are described in
[`docs/PHYSICAL_TESTING_GUIDE.md`](../../docs/PHYSICAL_TESTING_GUIDE.md). That
guide is proposed operational guidance only. Record an eventual serial-board
run in
[`evidence-board-serial.md`](../008-release-foundation/artifacts/evidence-board-serial.md)
or an eventual network-board run in
[`evidence-board-network.md`](../008-release-foundation/artifacts/evidence-board-network.md).

No HIL evidence record is marked passed by this feature.
