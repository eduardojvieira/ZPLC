#!/usr/bin/env python3
"""Generate the I/O table of a board from its description (IO-001, IO-002, IO-005).

The Zephyr build runs this script (firmware/CMakeLists.txt) and compiles the C file it writes into the `zplc`
library, so the channels of a board are data of firmware/app/boards/boards.json and adding one changes no C source.

The generated file has three parts:

* the portable table (zplc_io_table(), see zplc_hal.h) with each channel's image address, HAL number, safe value and
  whether it is required;
* BUILD_ASSERTs that fail the build when the description and the devicetree disagree: a described alias that the
  devicetree does not define, a pin or a GPIO controller that is another one (IO-001);
* the devicetree bindings (zplc_io_zephyr.h) that the Zephyr HAL configures in zplc_hal_init (IO-018).

Usage:
    gen_io_table.py --manifest boards.json --zephyr-board rpi_pico/rp2040 --default-profile io-default.json -o out.c
    gen_io_table.py --description one-board.json -o out.c
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent


def _library():
    spec = importlib.util.spec_from_file_location("zplc_boards", _HERE / "zplc_boards.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules.setdefault("zplc_boards", module)
    spec.loader.exec_module(module)
    return module


boards_lib = _library()

ADC_DEFAULTS = {"gain": "ADC_GAIN_1", "reference": "ADC_REF_INTERNAL", "acquisition_time": "ADC_ACQ_TIME_DEFAULT"}


def _c_string(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def select_board(
    manifest: list[dict[str, Any]],
    zephyr_board: str | None = None,
    board_id: str | None = None,
    default: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The manifest entry of a Zephyr board target, or the default alias profile for a target that has none."""
    entry = boards_lib.find_board(manifest, zephyr_board=zephyr_board, board_id=board_id)
    if entry is not None:
        return entry
    if board_id is not None:
        raise ValueError(f"board id {board_id!r} is not in the board manifest")
    if default is None:
        raise ValueError(f"Zephyr board {zephyr_board!r} is not in the board manifest and no default profile was given")
    return default


def _digital_binding(channel: dict[str, Any], optional: bool) -> tuple[list[str], str]:
    """(BUILD_ASSERTs, GPIO spec initialiser) of a digital channel."""
    dt = channel["dt"]
    alias = dt["alias"]
    node = f"DT_ALIAS({alias})"
    spec = f"GPIO_DT_SPEC_GET({node}, gpios)"
    if optional:
        return [], f"COND_CODE_1(DT_NODE_EXISTS({node}), ({spec}), ({{0}}))"
    where = f"channel {channel['id']} ({channel['pin']})"
    pin = dt["pin"]
    controller = dt["controller"]
    missing = _c_string(f"I/O description: {where} names the devicetree alias {alias}, which this board does not define")
    wrong_pin = _c_string(f"I/O description: {where} disagrees with the devicetree: alias {alias} is not on pin {pin}")
    wrong_ctlr = _c_string(f"I/O description: {where} disagrees with the devicetree: alias {alias} is not on the {controller} controller")
    asserts = [
        f"BUILD_ASSERT(DT_NODE_EXISTS({node}),\n             {missing});",
        f"BUILD_ASSERT(COND_CODE_1(DT_NODE_EXISTS({node}), (DT_GPIO_PIN({node}, gpios) == {pin}), (1)),\n"
        f"             {wrong_pin});",
        f"BUILD_ASSERT(COND_CODE_1(DT_NODE_EXISTS({node}), "
        f"(DT_SAME_NODE(DT_GPIO_CTLR({node}, gpios), DT_NODELABEL({controller}))), (1)),\n"
        f"             {wrong_ctlr});",
    ]
    return asserts, spec


def render_io_table(board: dict[str, Any], source_label: str) -> str:
    """The C source of the I/O table of one board entry. Raises ValueError when the description is invalid."""
    errors = boards_lib.validate_io_description(board, None)
    if errors:
        raise ValueError("; ".join(errors))

    channels = boards_lib.sorted_channels(board)
    numbering = boards_lib.hal_numbering(board)
    input_bytes, output_bytes = boards_lib.image_extent(board)
    digest = boards_lib.description_hash(board)
    board_id = board["board_id"]

    table_rows: list[str] = []
    gpio_rows: list[str] = []
    adc_rows: list[str] = []
    asserts: list[str] = []
    needs_adc = False

    for channel in channels:
        address = boards_lib.parse_address(channel["address"])
        optional = bool(channel.get("optional"))
        required = 0 if optional else 1
        is_output = channel["direction"] == "output"
        kind = "ZPLC_IO_KIND_ANALOG" if channel["kind"] == "analog" else "ZPLC_IO_KIND_DIGITAL"
        direction = "ZPLC_IO_DIR_OUTPUT" if is_output else "ZPLC_IO_DIR_INPUT"
        bit = address.bit if address.bit is not None else 0
        safe = int(channel.get("safe", 0)) if is_output else 0
        table_rows.append(
            f"    {{{_c_string(channel['id'])}, {_c_string(channel['pin'])}, {address.byte}U, {kind}, {direction}, "
            f"{bit}U, {numbering[channel['id']]}U, {safe}U, {required}U}},"
        )
        if channel["kind"] == "digital":
            lines, spec = _digital_binding(channel, optional)
            asserts.extend(lines)
            gpio_rows.append(
                f"    /* {channel['id']} {channel['pin']} */\n"
                f"    {{.spec = {spec},\n"
                f"     .is_output = {1 if is_output else 0}U, .safe = {safe}U, .required = {required}U}},"
            )
        else:
            dt = channel["dt"]
            node = f"DT_NODELABEL({dt['controller']})"
            cfg = {key: dt.get(key, ADC_DEFAULTS[key]) for key in ADC_DEFAULTS}
            device = f"COND_CODE_1(DT_NODE_HAS_STATUS_OKAY({node}), (DEVICE_DT_GET({node})), (NULL))"
            adc_rows.append(
                f"    /* {channel['id']} {channel['pin']} */\n"
                f"    {{.dev = {device},\n"
                f"     .cfg = {{.gain = {cfg['gain']}, .reference = {cfg['reference']},\n"
                f"             .acquisition_time = {cfg['acquisition_time']}, .channel_id = {dt['channel']},\n"
                f"             .differential = 0}},\n"
                f"     .resolution = {channel['resolution_bits']}U, .required = {required}U}},"
            )
            if not optional:
                needs_adc = True
                message = _c_string(
                    f"I/O description: channel {channel['id']} ({channel['pin']}) needs the converter node "
                    f"{dt['controller']}, which the devicetree does not enable"
                )
                asserts.append(f"BUILD_ASSERT(DT_NODE_HAS_STATUS_OKAY({node}),\n             {message});")

    out: list[str] = []
    out.append("/* Generated by firmware/zephyr/scripts/gen_io_table.py: do not edit.")
    out.append(f" * Source:      {source_label}")
    out.append(f" * Board:       {board_id}")
    out.append(f" * Description: {len(channels)} channels, hash {digest}")
    out.append(" */")
    out.append("#include <zephyr/devicetree.h>")
    out.append("#include <zephyr/sys/util.h>")
    out.append("#include <zplc_hal.h>")
    out.append('#include "zplc_io_zephyr.h"')
    out.append("")
    out.append("/* Image bytes the channels of the board need (IO-005). */")
    out.append(f"#define ZPLC_IO_INPUT_BYTES_NEEDED {input_bytes}U")
    out.append(f"#define ZPLC_IO_OUTPUT_BYTES_NEEDED {output_bytes}U")
    out.append("")
    out.append("BUILD_ASSERT(CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES == 0 || CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES >= ZPLC_IO_INPUT_BYTES_NEEDED,")
    out.append('             "CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES is smaller than the input image the channels of the board description need");')
    out.append("BUILD_ASSERT(CONFIG_ZPLC_IO_OUTPUT_IMAGE_BYTES == 0 || CONFIG_ZPLC_IO_OUTPUT_IMAGE_BYTES >= ZPLC_IO_OUTPUT_BYTES_NEEDED,")
    out.append('             "CONFIG_ZPLC_IO_OUTPUT_IMAGE_BYTES is smaller than the output image the channels of the board description need");')
    out.append("BUILD_ASSERT(ZPLC_IO_INPUT_BYTES_NEEDED <= 0xFF0U,")
    out.append('             "the input channels of the board description reach the system registers of the input image");')
    out.append("")
    if asserts:
        out.append("/* The description and the devicetree must agree (IO-001): each failure names the channel. */")
        out.extend(asserts)
        out.append("")
    out.append("static const zplc_io_channel_t io_channels[] = {")
    out.extend(table_rows if table_rows else ["    {NULL, NULL, 0U, 0U, 0U, 0U, 0U, 0U, 0U},"])
    out.append("};")
    out.append("")
    out.append("static const zplc_io_table_t io_description = {")
    out.append(f"    {_c_string(board_id)},")
    out.append(f"    0x{digest}U,")
    out.append("    (CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES != 0) ? CONFIG_ZPLC_IO_INPUT_IMAGE_BYTES : ZPLC_IO_INPUT_BYTES_NEEDED,")
    out.append("    (CONFIG_ZPLC_IO_OUTPUT_IMAGE_BYTES != 0) ? CONFIG_ZPLC_IO_OUTPUT_IMAGE_BYTES : ZPLC_IO_OUTPUT_BYTES_NEEDED,")
    out.append(f"    {len(channels)}U,")
    out.append("    io_channels,")
    out.append("};")
    out.append("")
    out.append("const zplc_io_table_t *zplc_io_table(void) { return &io_description; }")
    out.append("")
    out.append("/* Devicetree bindings: HAL gpio channel n is entry n, outputs first (zplc_hal_zephyr.c). */")
    out.append("const struct zplc_io_gpio_binding zplc_io_gpio_bindings[] = {")
    out.extend(gpio_rows if gpio_rows else ["    {{0}, 0U, 0U, 0U},"])
    out.append("};")
    out.append(f"const uint16_t zplc_io_gpio_binding_count = {len(gpio_rows)}U;")
    out.append("")
    out.append("#ifdef CONFIG_ADC")
    out.append("/* HAL adc channel n is entry n, by image address. */")
    out.append("const struct zplc_io_adc_binding zplc_io_adc_bindings[] = {")
    out.extend(adc_rows if adc_rows else ["    {NULL, {0}, 0U, 0U},"])
    out.append("};")
    out.append(f"const uint16_t zplc_io_adc_binding_count = {len(adc_rows)}U;")
    if needs_adc:
        out.append("#else")
        out.append('#error "The I/O description lists an analog input channel that is not optional: enable CONFIG_ADC"')
    out.append("#endif")
    out.append("")
    return "\n".join(out)


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as error:
        raise ValueError(f"cannot read {path}: {error}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, help="the board manifest (boards.json)")
    parser.add_argument("--zephyr-board", help="Zephyr board target, e.g. rpi_pico/rp2040")
    parser.add_argument("--board-id", help="board id of the manifest, instead of the Zephyr board target")
    parser.add_argument("--default-profile", type=Path, help="profile used for a Zephyr target that is not in the manifest")
    parser.add_argument("--description", type=Path, help="one board entry, instead of the manifest (tests, new boards)")
    parser.add_argument("-o", "--output", type=Path, required=True)
    args = parser.parse_args(argv)

    try:
        if args.description is not None:
            board = _load_json(args.description)
            if isinstance(board, list):
                board = select_board(board, zephyr_board=args.zephyr_board, board_id=args.board_id)
            label = str(args.description.name)
        else:
            if args.manifest is None:
                raise ValueError("give --manifest or --description")
            manifest = _load_json(args.manifest)
            default = _load_json(args.default_profile) if args.default_profile else None
            board = select_board(manifest, zephyr_board=args.zephyr_board, board_id=args.board_id, default=default)
            label = f"{args.manifest.name} ({board['board_id']})"
        text = render_io_table(board, label)
    except ValueError as error:
        print(f"gen_io_table: {error}", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Write only when the text changed so that an unchanged description does not rebuild the library.
    if not args.output.exists() or args.output.read_text() != text:
        args.output.write_text(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
