---
slug: /reference/boards
id: boards
title: Supported Boards
sidebar_label: Supported Boards
description: Generated board reference for the ZPLC 2.0 candidate.
tags: [reference, boards, generated]
---

# Supported Boards

> [!IMPORTANT]
> This page is generated from `firmware/app/boards/boards.json`, the one board manifest. Update the JSON or rerun `python3 tools/docs/generate_board_reference.py` instead of editing this file manually.

## Topology

```mermaid
flowchart TD
  serial["Serial-focused"]
  network["Network-capable"]
  b1["Raspberry Pi Pico (RP2040)"]
  serial --> b1
  b2["Arduino GIGA R1 (STM32H747 M7)"]
  serial --> b2
  b3["ESP32-S3-DevKitC-1 (N8R8)"]
  network --> b3
  b4["STM32F746G Discovery"]
  network --> b4
  b5["STM32 Nucleo-H743ZI"]
  network --> b5
  b6["Arduino Opta WiFi (STM32H747 M7)"]
  network --> b6
  b7["Waveshare RP2040-Zero"]
  serial --> b7
```

## The I/O description

Each board entry of the manifest has an `io` object that lists the channels of the board. A channel has an `id`, a `direction` (`input` or `output`), a `kind` (`digital` or `analog`), the IEC `address` of its place in the process image (`%QX0.0`, `%IW4`), the `pin` or terminal printed on the board, its `electrical` notes, the `safe` value of an output, and a `dt` object with the devicetree alias, GPIO controller and pin (or the converter and channel) that the build checks.

`pin_status` says where the pin comes from: `devicetree` is a pin that the board's own devicetree or the profile overlay defines and the build proves; `profile` is a header pin this profile chose, which needs the loopback bench of HIL-010 to be confirmed.

To add a channel to a board, add the alias to its overlay and the entry to its description. The firmware I/O table is generated from the description at build time, so no C source changes, and the build fails when the description and the devicetree disagree. A word of the process image that no pin drives is not a channel: a project lists it under `io.virtual`.

Studio reads the same file. The I/O mapping editor of the project settings lists the channels of the selected board with their pin names and marks a row on an address the board does not have; a build fails with an error that names the board and the variable when a variable is located where the board has no channel; and a hardware deploy is refused, with a message that names the board, when the firmware reports another description or the program touches an address without a channel.

## Board matrix

| Display name | Board ID | IDE ID | Zephyr target | Network | Support level | Evidence records |
| --- | --- | --- | --- | --- | --- | --- |
| Raspberry Pi Pico (RP2040) | `rpi-pico-rp2040` | `rpi_pico` | `rpi_pico/rp2040` | Serial-focused | cross-build | 0 |
| Arduino GIGA R1 (STM32H747 M7) | `arduino-giga-r1-m7` | `arduino_giga_r1` | `arduino_giga_r1/stm32h747xx/m7` | Serial-focused | cross-build | 0 |
| ESP32-S3-DevKitC-1 (N8R8) | `esp32-s3-devkitc` | `esp32s3_devkitc` | `esp32s3_devkitc/esp32s3/procpu` | Network-capable (Wi-Fi) | cross-build | 0 |
| STM32F746G Discovery | `stm32f746g-disco` | `stm32f746g_disco` | `stm32f746g_disco/stm32f746xx` | Network-capable (Ethernet) | cross-build | 0 |
| STM32 Nucleo-H743ZI | `nucleo-h743zi` | `nucleo_h743zi` | `nucleo_h743zi/stm32h743xx` | Network-capable (Ethernet) | cross-build | 0 |
| Arduino Opta WiFi (STM32H747 M7) | `arduino-opta-wifi-m7` | `arduino_opta_wifi` | `arduino_opta/stm32h747xx/m7` | Network-capable (Wi-Fi) | cross-build | 0 |
| Waveshare RP2040-Zero | `waveshare-rp2040-zero` | `waveshare_rp2040_zero` | `rp2040_zero/rp2040` | Serial-focused | cross-build | 0 |

## Footprint

Flash and RAM of `firmware/app` per board, from the linker memory table of the CI size report (`tools/firmware-test/size-budget.json`). They are host-build measurements, not hardware evidence. The last three columns are the memory regions the runtime configures for the board (work, retentive, code).

| Board ID | Flash (KiB) | Flash budget (KiB) | RAM (KiB) | RAM budget (KiB) | Work (KiB) | RETAIN (KiB) | Code (KiB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `rpi-pico-rp2040` | 151.5 | 159.2 | 199.9 | 210.0 | 8.0 | 4.0 | 24.0 |
| `arduino-giga-r1-m7` | 199.1 | 209.2 | 287.7 | 302.2 | 8.0 | 4.0 | 44.0 |
| `esp32-s3-devkitc` | 981.8 | 1031.0 | 2374.2 | 2493.0 | 2.0 | 1.0 | 8.0 |
| `stm32f746g-disco` | 282.8 | 297.0 | 230.2 | 241.8 | 8.0 | 4.0 | 16.0 |
| `nucleo-h743zi` | 414.3 | 435.0 | 478.0 | 502.0 | 8.0 | 4.0 | 44.0 |
| `arduino-opta-wifi-m7` | 434.0 | 455.8 | 458.4 | 481.5 | 8.0 | 4.0 | 32.0 |
| `waveshare-rp2040-zero` | 156.4 | 164.5 | 200.7 | 210.8 | 8.0 | 4.0 | 24.0 |

## Board details

### Raspberry Pi Pico (RP2040)

- **Board ID:** `rpi-pico-rp2040`
- **IDE ID:** `rpi_pico`
- **Zephyr target:** `rpi_pico/rp2040`
- **Variant:** `rp2040`
- **Network:** Serial-focused
- **Support level:** cross-build (no hardware record)
- **Build command:** `west build -b rpi_pico/rp2040 firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 18 B, 1 B
- **I/O description hash:** `d27196be`
- **Support assets:**
  - `firmware/app/boards/rpi_pico_rp2040.conf`
  - `firmware/app/boards/rpi_pico_rp2040.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | GP0 | header pin 1 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| DO1 | output | digital | `%QX0.1` | GP1 | header pin 2 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| DO2 | output | digital | `%QX0.2` | GP2 | header pin 4 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| DO3 | output | digital | `%QX0.3` | GP3 | header pin 5 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| DO4 | output | digital | `%QX0.4` | GP25 | on-board LED | devicetree | 0 | On-board green LED through its series resistor; not a field output. |
| DI0 | input | digital | `%IX0.0` | GP15 | header pin 20 | devicetree |  | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| DI1 | input | digital | `%IX0.1` | GP14 | header pin 19 | profile |  | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| DI2 | input | digital | `%IX0.2` | GP13 | header pin 17 | profile |  | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| DI3 | input | digital | `%IX0.3` | GP12 | header pin 16 | profile |  | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |
| AI0 | input | analog | `%IW4` | GP26 (ADC0) | header pin 31 | devicetree |  | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. 0..4095 -> 0.0 to 3.3 V. |
| AI1 | input | analog | `%IW5` | GP27 (ADC1) | header pin 32 | devicetree |  | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. 0..4095 -> 0.0 to 3.3 V. |
| AI2 | input | analog | `%IW6` | GP28 (ADC2) | header pin 34 | devicetree |  | 0 V to 3.3 V on the ADC input; do not exceed 3.3 V. 0..4095 -> 0.0 to 3.3 V. |
| AI3 | input | analog | `%IW7` | VSYS/3 (ADC3) | internal | devicetree |  | Internal: the supply voltage divided by 3, no external connection. 0..4095 -> 0.0 to 3.3 V. VSYS = 3 x the input voltage. |
| AI4 | input | analog | `%IW8` | Temperature sensor (ADC4) | internal | devicetree |  | Internal die temperature sensor, no external connection. 0..4095 -> 0.0 to 3.3 V. RP2040 datasheet: T [degC] = 27 - (V - 0.706) / 0.001721 with V = raw * 3.3 / 4095. |

### Arduino GIGA R1 (STM32H747 M7)

- **Board ID:** `arduino-giga-r1-m7`
- **IDE ID:** `arduino_giga_r1`
- **Zephyr target:** `arduino_giga_r1/stm32h747xx/m7`
- **Variant:** `stm32h747xx/m7`
- **Network:** Serial-focused
- **Support level:** cross-build (no hardware record)
- **Build command:** `west build -b arduino_giga_r1/stm32h747xx/m7 firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 1 B, 1 B
- **I/O description hash:** `77271dae`
- **Support assets:**
  - `firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.conf`
  - `firmware/app/boards/arduino_giga_r1_stm32h747xx_m7.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | PI12 (red LED) |  | devicetree | 0 | On-board LED, active low in the board devicetree; not a field output. |
| DO1 | output | digital | `%QX0.1` | PJ13 (green LED) |  | devicetree | 0 | On-board LED, active low in the board devicetree; not a field output. |
| DI0 | input | digital | `%IX0.0` | PC13 (user button) |  | devicetree |  | On-board user button. |

### ESP32-S3-DevKitC-1 (N8R8)

- **Board ID:** `esp32-s3-devkitc`
- **IDE ID:** `esp32s3_devkitc`
- **Zephyr target:** `esp32s3_devkitc/esp32s3/procpu`
- **Variant:** `esp32s3/procpu`
- **Network:** Network-capable (Wi-Fi)
- **Support level:** cross-build (no hardware record)
- **Module:** ESP32-S3-WROOM-1-N8R8, 8 MB flash, 8 MB PSRAM (variant to be confirmed on the module)
- **Build command:** `west build -b esp32s3_devkitc/esp32s3/procpu firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 10 B, 1 B
- **I/O description hash:** `2e9abb09`
- **Support assets:**
  - `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.conf`
  - `firmware/app/boards/esp32s3_devkitc_esp32s3_procpu.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | GPIO38 | header J3 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. External LED with a series resistor. |
| DO1 | output | digital | `%QX0.1` | GPIO15 | header J1 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. |
| DO2 | output | digital | `%QX0.2` | GPIO16 | header J1 | profile | 0 | 3.3 V logic. Not 5 V tolerant. |
| DO3 | output | digital | `%QX0.3` | GPIO17 | header J1 | profile | 0 | 3.3 V logic. Not 5 V tolerant. |
| DI0 | input | digital | `%IX0.0` | GPIO0 (BOOT) | header J3 and BOOT button | devicetree |  | BOOT button, active low with an internal pull-up. A strapping pin: keep it high at reset. |
| DI1 | input | digital | `%IX0.1` | GPIO18 | header J1 | profile |  | 3.3 V logic. Not 5 V tolerant. Internal pull-up; connect a switch to GND. |
| DI2 | input | digital | `%IX0.2` | GPIO8 | header J1 | profile |  | 3.3 V logic. Not 5 V tolerant. Internal pull-up; connect a switch to GND. |
| DI3 | input | digital | `%IX0.3` | GPIO9 | header J1 | profile |  | 3.3 V logic. Not 5 V tolerant. Internal pull-up; connect a switch to GND. |
| AI0 | input | analog | `%IW4` | GPIO4 (ADC1 channel 3) | header J1 | profile |  | 0 V to about 3.1 V at 11 dB attenuation; do not exceed 3.3 V. 0..4095 -> 0.0 to 3.1 V. Nominal and uncalibrated: the ESP32-S3 converter is nonlinear near both ends. |

#### Not mapped

- `GPIO48 (RGB LED)`: the on-board LED is an addressable RGB part that needs the LED-strip driver

### STM32F746G Discovery

- **Board ID:** `stm32f746g-disco`
- **IDE ID:** `stm32f746g_disco`
- **Zephyr target:** `stm32f746g_disco/stm32f746xx`
- **Variant:** `stm32f746xx`
- **Network:** Network-capable (Ethernet)
- **Support level:** cross-build (no hardware record)
- **Build command:** `west build -b stm32f746g_disco/stm32f746xx firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 1 B, 1 B
- **I/O description hash:** `80927f2e`
- **Support assets:**
  - `firmware/app/boards/stm32f746g_disco.conf`
  - `firmware/app/boards/stm32f746g_disco.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | PI1 (LD1 green) |  | devicetree | 0 | On-board LED; not a field output. |
| DI0 | input | digital | `%IX0.0` | PI11 (user button) |  | devicetree |  | On-board user button. |

### STM32 Nucleo-H743ZI

- **Board ID:** `nucleo-h743zi`
- **IDE ID:** `nucleo_h743zi`
- **Zephyr target:** `nucleo_h743zi/stm32h743xx`
- **Variant:** `stm32h743xx`
- **Network:** Network-capable (Ethernet)
- **Support level:** cross-build (no hardware record)
- **Build command:** `west build -b nucleo_h743zi/stm32h743xx firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 1 B, 1 B
- **I/O description hash:** `4193575e`
- **Support assets:**
  - `firmware/app/boards/nucleo_h743zi.conf`
  - `firmware/app/boards/nucleo_h743zi.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | PB0 (LD1 green) |  | devicetree | 0 | On-board LED; not a field output. |
| DO1 | output | digital | `%QX0.1` | PE1 (LD2 yellow) |  | devicetree | 0 | On-board LED; not a field output. |
| DI0 | input | digital | `%IX0.0` | PC13 (user button) |  | devicetree |  | On-board user button. |

### Arduino Opta WiFi (STM32H747 M7)

- **Board ID:** `arduino-opta-wifi-m7`
- **IDE ID:** `arduino_opta_wifi`
- **Zephyr target:** `arduino_opta/stm32h747xx/m7`
- **Variant:** `stm32h747xx/m7`
- **Network:** Network-capable (Wi-Fi)
- **Support level:** cross-build (no hardware record)
- **Build command:** `west build -b arduino_opta/stm32h747xx/m7 firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 1 B, 1 B
- **I/O description hash:** `6ce9cc7a`
- **Support assets:**
  - `firmware/app/boards/arduino_opta_stm32h747xx_m7.conf`
  - `firmware/app/boards/arduino_opta_stm32h747xx_m7.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | PI0 (status LED D0) |  | devicetree | 0 | On-board status LED; not a field output. |
| DO1 | output | digital | `%QX0.1` | PI1 (status LED D1) |  | devicetree | 0 | On-board status LED; not a field output. |
| DO2 | output | digital | `%QX0.2` | PI3 (status LED D2) |  | devicetree | 0 | On-board status LED; not a field output. |
| DO3 | output | digital | `%QX0.3` | PH15 (status LED D3) |  | devicetree | 0 | On-board status LED; not a field output. |
| DO4 | output | digital | `%QX0.4` | PI6 (relay output 1) | relay output terminal 1 | devicetree | 0 | Relay contact: it can switch a field circuit. Observe the contact rating in the Arduino Opta documentation; not qualified here. |
| DO5 | output | digital | `%QX0.5` | PI5 (relay output 2) | relay output terminal 2 | devicetree | 0 | Relay contact: it can switch a field circuit. Observe the contact rating in the Arduino Opta documentation; not qualified here. |
| DO6 | output | digital | `%QX0.6` | PI7 (relay output 3) | relay output terminal 3 | devicetree | 0 | Relay contact: it can switch a field circuit. Observe the contact rating in the Arduino Opta documentation; not qualified here. |
| DO7 | output | digital | `%QX0.7` | PI4 (relay output 4) | relay output terminal 4 | devicetree | 0 | Relay contact: it can switch a field circuit. Observe the contact rating in the Arduino Opta documentation; not qualified here. |
| DI0 | input | digital | `%IX0.0` | PE4 (user button) |  | devicetree |  | On-board user button. |

#### Not mapped

- `I1 to I8 (field inputs)`: the pin documentation of the Arduino Opta field inputs is not established (OA-13); the board devicetree defines no digital input alias for them

### Waveshare RP2040-Zero

- **Board ID:** `waveshare-rp2040-zero`
- **IDE ID:** `waveshare_rp2040_zero`
- **Zephyr target:** `rp2040_zero/rp2040`
- **Variant:** `rp2040`
- **Network:** Serial-focused
- **Support level:** cross-build (no hardware record)
- **Build command:** `west build -b rp2040_zero/rp2040 firmware/app --pristine`
- **Reference anchor:** `docs/docs/reference/index.md#supported-boards`
- **Process image used (input, output):** 1 B, 1 B
- **I/O description hash:** `0d5edb3c`
- **Support assets:**
  - `firmware/app/boards/rp2040_zero_rp2040.conf`
  - `firmware/app/boards/rp2040_zero_rp2040.overlay`

#### I/O channels

| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO0 | output | digital | `%QX0.0` | GP2 | castellated edge pad GP2 | devicetree | 0 | 3.3 V logic. Not 5 V tolerant. RP2040 drive strength is configurable up to 12 mA per pin (datasheet, not qualified here). |
| DI0 | input | digital | `%IX0.0` | GP3 | castellated edge pad GP3 | devicetree |  | 3.3 V logic input with the RP2040 internal pull-up enabled by the profile; connect a switch to GND. Not 5 V tolerant. |

#### Not mapped

- `WS2812 RGB LED (GP16)`: an addressable LED needs the LED-strip driver; it is not a simple output
