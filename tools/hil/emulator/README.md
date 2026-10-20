# Emulated HIL bench

This folder runs the HIL chain on emulators instead of boards. Its records say
`evidence_level: emulated`, name the emulator, its version and the patch hash, and
never raise a board's support level (`tools/hil/bench.py`, HIL-009, HIL-011).

An emulator run proves the firmware logic, the device protocol and the harness on a
model of the chip. It does not prove pins, electrical behaviour, real clocks or the
drivers against silicon. The guide is `docs/docs/development/hil-emulation.md`.

| File | What it is |
|---|---|
| `setup.sh` | installs the emulators into `$ZPLC_EMU_DIR` (default `~/zplc-emu`); a second run changes nothing |
| `rp2040js-zplc-emu.patch` | four fidelity fixes to rp2040js, applied by `setup.sh` |
| `build.sh` | builds the firmware images the benches run |
| `pico/` | the Raspberry Pi Pico bench on rp2040js |
| `esp32s3/` | the ESP32-S3 bench on Espressif QEMU, and its emulation-only build overlay |
| `bench_emulated.py` | `EmulatorBench`, the bench of `run_chain.py --bench emulated` |

## Third-party software

Neither emulator is vendored in this repository. `setup.sh` downloads them, at pinned
versions, outside the repository; only the patch file is kept here.

- **rp2040js** by Uri Shaked and Wokwi, <https://github.com/wokwi/rp2040js>, MIT
  license, commit `5fbd20508a58b9859758c5cd70b207ba1e0b0150` (1.4.1 and three commits).
  `rp2040js-zplc-emu.patch` is a derivative of its `src/peripherals/{adc,ppb,usb}.ts`
  and is distributed under the same MIT license, copyright (c) 2021 Uri Shaked. The harness imports rp2040js from `$ZPLC_EMU_DIR/rp2040js`;
  it is not a dependency of any `package.json` here.
- **Espressif QEMU**, <https://github.com/espressif/qemu>, GPL-2.0, release
  `esp_develop_9.2.2_20260417`, x86_64 Linux build, SHA-256
  `0eecb2a34a5586c0e59110f77b9343b7b336e82fdb0e1a30e1dc1bab8a547e35`. It runs as a
  separate program; nothing here links to it.

## The four rp2040js fixes

1. `ppb.ts`, SysTick: a write to SYST_CVR set the counter to 0, which fired the alarm
   at once, a SysTick storm under Zephyr's tickless driver. It now reloads from RVR
   without COUNTFLAG.
2. `ppb.ts`, SysTick: a pending SysTick did not end WFI (only NVIC interrupts did), so
   the kernel clock ran at about 20 % of simulated time when idle. It now wakes the core.
3. `usb.ts`, VBUS_DETECT was a level copy of SIE_STATUS and never cleared, a USB
   interrupt storm. It is now latched on change and cleared by writing
   SIE_STATUS.VBUS_DETECTED, as Zephyr's `usb_dc_rpi_pico` driver expects.
4. `adc.ts`, reading the FIFO did not re-evaluate the FIFO interrupt level, an ADC
   interrupt storm and a stack overrun.

Offering these fixes to rp2040js upstream is a publication for the project owner to
decide; nothing here sends them.
