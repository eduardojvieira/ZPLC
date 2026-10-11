---
slug: /guides/port-to-a-board
id: port-to-a-board
title: Port ZPLC to a new board
sidebar_label: Port to a board
description: "Add a Zephyr board to the list of supported boards: the board files, the manifest entry, the cross-build and the size budget, and what stays unproven until a board runs it."
tags: [how-to, boards, firmware]
---

# Port ZPLC to a new board

A board joins ZPLC when it has a Zephyr port, two small files of board settings, one
entry in the board manifest, a place in the continuous-integration cross-build and a
size budget. This page lists those steps in order and says what each one proves.

:::caution A new board is a cross-build, not a tested board
Following this page gives a board that **builds** and whose pins and memory sizes are
described. Nothing here runs a program on it. The manifest keeps `evidence_refs`
empty until a hardware record exists, and the
[hardware support](../reference/capabilities-evidence.md) page lists the board at the
lowest level, `cross-build`.
:::

## What you need

- A Zephyr board target that `west boards` lists, written with its qualifiers:
  `nucleo_h743zi/stm32h743xx` is the board, then the SoC, then the CPU when there is more than one.
- The firmware test workspace, which keeps the Zephyr tree that `west.yml` pins
  outside the repository ([Zephyr workspace setup](../reference/zephyr-workspace-setup.md)):

```bash
tools/firmware-test/setup.sh
```

## 1. Write the two board files

Add `<target>.conf` and `<target>.overlay` to `firmware/app/boards/`. `<target>` is the
Zephyr board target with each `/` replaced by `_`: `rpi_pico/rp2040` is
`rpi_pico_rp2040`. A board with one SoC may use the short name, as `nucleo_h743zi.conf` does.

- The `.conf` is Kconfig: the console, the storage the settings use, and the three
  sizes of the program store. They default to 8192 bytes of work memory, 4096 of
  retained memory and 45056 of program, and a board with less memory sets them here
  (`CONFIG_ZPLC_WORK_MEMORY_SIZE`, `CONFIG_ZPLC_RETAIN_MEMORY_SIZE`,
  `CONFIG_ZPLC_CODE_SIZE_MAX`).
- The `.overlay` is devicetree: the aliases that the pins are reached through
  (`led0`, `sw0`) and the storage partition, if the board does not define one.

Start from the pair of the board that is closest to yours.

## 2. Describe the board in the manifest

Add one entry to `firmware/app/boards/boards.json`. Studio, the command line, the
build and the hardware support page all read this file, so it is the only place that
says what the board is. This is the shape of an entry, for a board that does not
exist:

```json zplc-board
{
  "board_id": "example-board",
  "display_name": "Example Board",
  "ide_id": "example_board",
  "zephyr_board": "example_board/example_soc",
  "variant": "example_soc",
  "memory": { "work_size": 8192, "retain_size": 4096, "code_size_max": 24576 },
  "support_assets": [
    "firmware/app/boards/example_board_example_soc.conf",
    "firmware/app/boards/example_board_example_soc.overlay"
  ],
  "build_command": "west build -b example_board/example_soc firmware/app --pristine",
  "network_class": "serial-focused",
  "network_interface": "none",
  "evidence_refs": [],
  "docs_ref": "docs/docs/reference/capabilities-evidence.md",
  "io": {
    "schema_version": 1,
    "channels": [
      {
        "id": "DO0", "direction": "output", "kind": "digital", "address": "%QX0.0",
        "pin": "PA5 (LED)", "dt": { "alias": "led0", "controller": "gpioa", "pin": 5 },
        "safe": 0, "electrical": "On-board LED; not a field output.",
        "pin_status": "devicetree", "source": "firmware/app/boards/example_board_example_soc.overlay"
      },
      {
        "id": "DI0", "direction": "input", "kind": "digital", "address": "%IX0.0",
        "pin": "PA0 (button)", "dt": { "alias": "sw0", "controller": "gpioa", "pin": 0 },
        "electrical": "On-board user button.",
        "pin_status": "devicetree", "source": "firmware/app/boards/example_board_example_soc.overlay"
      }
    ],
    "unmapped": []
  }
}
```

What the manifest holds, and the rule that refuses a wrong value:

| Key | What to write | What is checked |
| --- | --- | --- |
| `board_id`, `ide_id`, `zephyr_board` | Three names for the same board: the firmware name, the name a project file uses in `target.board`, and the Zephyr target | None of them repeats a name that another board has |
| `memory` | The three sizes of step 1 | The build stops when they differ from the `.conf` |
| `network_class`, `network_interface` | `serial-focused`, `network-capable` or `other`; `none`, `wifi` or `ethernet` | Only these words are accepted |
| `evidence_refs` | An empty list | A path must be a hardware record that exists; the level is derived from the records and is never written by hand |
| `io.channels` | One entry per pin that a program can reach, at most 64 | Each channel has an address of the right direction and width, no two share a bit, an output has its safe value, and a digital channel names its devicetree alias, controller and pin |
| `io.unmapped` | The terminals that exist and that ZPLC does not use, each with a reason | An entry has a terminal and a reason |

An analog output is not supported by any port, so leave it out of the description.
The addresses of the channels are the ones a project maps with `AT %I0.0`
([Map variables to pins](./map-io.md)).

## 3. Add the board to the cross-build

Add an item to the `zephyr-cross-build` matrix of `.github/workflows/ci.yml`. `tidy_board`
is the `board_id` of the manifest:

```yaml
- id: example-board
  board: example_board/example_soc
  tidy_board: example-board
```

The validator that CI runs fails when a board of the manifest is missing from the
matrix, when the matrix has a board that the manifest does not, and when a file of
`support_assets` does not exist:

```bash
python3 tools/hil/validate_supported_boards.py
```

The static analysis starts a new board with no tolerated findings in `firmware/app`,
so a finding that the board's build reports has to be fixed.

## 4. Build it and give it a size budget

Build the application for the board and read its flash and RAM use:

```bash
tools/firmware-test/run.sh size example-board
```

The board builds, and the report fails the first time because the board has no budget.
The logs are under `$ZPLC_FW_WS/out/size`. Add the board to
`tools/firmware-test/size-budget.json` with its `zephyr_board` and the linker regions
that the build prints for flash and for RAM (copy the entry of a board with the same
SoC), then record the measured size and the budget that the margin policy gives it:

```bash
python3 tools/firmware-test/fwtest.py size --budget tools/firmware-test/size-budget.json --logs "$ZPLC_FW_WS/out/size" --rebaseline
```

From then on a change that grows the image past the budget fails the build of this board.
The budget comes from a host build, not from hardware.

## 5. Regenerate the reference

The hardware support page lists every board of the manifest and its level, and the
board reference page holds the pin table. Both are generated:

```bash
python3 tools/docs/generate_board_reference.py
```

The new board appears at `cross-build`. Add its name to the `target.board` list of
`packages/zplc-ide/zplc.schema.json` too, so that a project file may name it.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| The manifest entry above follows every rule of the manifest, and does not repeat a name of another board | `bun tools/docs/check-docs-config.ts` runs it through the validator of the manifest, with the manifest of this repository | Host |
| The order of the steps and the commands | Read from the firmware build files, the size tool and the validator of this repository | Host |
| A real port | Not executed: no new board was ported while this page was written | None |
| The board runs a program | Not verified: needs a hardware record | None |

## See also

- [Hardware support](../reference/capabilities-evidence.md) and [Boards](../reference/boards.md).
- [Firmware testing](../development/firmware-testing.md): what the size and cross-build checks prove.
- [Safety and limitations](../safety-and-limitations.md).
