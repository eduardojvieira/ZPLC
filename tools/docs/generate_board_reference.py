#!/usr/bin/env python3
"""Generate docs/docs/reference/boards.md (EN) and its Spanish copy from firmware/app/boards/boards.json.

The board table is one source for Studio, the docs, CI and the MCP tools (IO-012). This generator adds what the
manifest derives: the I/O description of each board (IO-001), the image sizes its channels need (IO-005), the
footprint from the size budget file that the CI size reports maintain (IO-014) and the support level derived from the
evidence records the manifest references (IO-015).
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "firmware/app/boards/boards.json"
LIBRARY = ROOT / "firmware/zephyr/scripts/zplc_boards.py"
SIZE_BUDGET = ROOT / "tools/firmware-test/size-budget.json"
OUTPUT_EN = ROOT / "docs/docs/reference/boards.md"
OUTPUT_ES = (
    ROOT / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/boards.md"
)


def _library():
    spec = importlib.util.spec_from_file_location("zplc_boards", LIBRARY)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


boards_lib = _library()


def load_boards() -> list[dict[str, object]]:
    data = json.loads(SOURCE.read_text())
    if not isinstance(data, list):
        raise ValueError("the board manifest must contain a list")
    return data


def load_budget() -> dict[str, dict[str, object]]:
    if not SIZE_BUDGET.is_file():
        return {}
    return json.loads(SIZE_BUDGET.read_text()).get("boards", {})


def network_summary(board: dict[str, object], spanish: bool) -> str:
    network_class = str(board["network_class"])
    interface = str(board["network_interface"])
    if network_class == "serial-focused":
        return "Enfoque serial" if spanish else "Serial-focused"
    if interface == "wifi":
        return "Capacidad de red (Wi-Fi)" if spanish else "Network-capable (Wi-Fi)"
    if interface == "ethernet":
        return (
            "Capacidad de red (Ethernet)" if spanish else "Network-capable (Ethernet)"
        )
    return "Capacidad de red" if spanish else "Network-capable"


def support(board: dict[str, object]) -> dict[str, object]:
    """The support level of a board: derived from its evidence records, never read from a field (IO-015)."""
    return boards_lib.support_level(board, ROOT)


def validation_summary(board: dict[str, object]) -> str:
    return str(support(board)["level"])


def kib(value: object) -> str:
    return f"{int(value) / 1024:.1f}"  # type: ignore[call-overload]


def mermaid_diagram(boards: list[dict[str, object]], spanish: bool) -> list[str]:
    serial_label = "Enfoque serial" if spanish else "Serial-focused"
    network_label = "Capacidad de red" if spanish else "Network-capable"
    lines = [
        "```mermaid",
        "flowchart TD",
        f'  serial["{serial_label}"]',
        f'  network["{network_label}"]',
    ]
    for index, board in enumerate(boards, start=1):
        node = f"b{index}"
        label = str(board["display_name"]).replace('"', "'")
        parent = (
            "serial" if str(board["network_class"]) == "serial-focused" else "network"
        )
        lines.append(f'  {node}["{label}"]')
        lines.append(f"  {parent} --> {node}")
    lines.append("```")
    return lines


def cell(text: object) -> str:
    return str(text).replace("|", "\\|")


def render_board_reference(boards: list[dict[str, object]], spanish: bool) -> str:
    budget = load_budget()
    title = "Supported Boards" if not spanish else "Placas Soportadas"
    description = (
        "Generated board reference for the ZPLC 2.0 candidate."
        if not spanish
        else "Referencia generada de placas para el candidato ZPLC 2.0."
    )
    intro = (
        "This page is generated from `firmware/app/boards/boards.json`, the one board manifest. Update the JSON or rerun `python3 tools/docs/generate_board_reference.py` instead of editing this file manually."
        if not spanish
        else "Esta página se genera desde `firmware/app/boards/boards.json`, el único manifiesto de placas. Actualizá el JSON o volvé a ejecutar `python3 tools/docs/generate_board_reference.py` en lugar de editar este archivo manualmente."
    )
    summary_title = "Board matrix" if not spanish else "Matriz de placas"
    footprint_title = "Footprint" if not spanish else "Huella de memoria"
    footprint_intro = (
        "Flash and RAM of `firmware/app` per board, from the linker memory table of the CI size report (`tools/firmware-test/size-budget.json`). They are host-build measurements, not hardware evidence. The last three columns are the memory regions the runtime configures for the board (work, retentive, code)."
        if not spanish
        else "Flash y RAM de `firmware/app` por placa, de la tabla de memoria del enlazador en el reporte de tamaño de CI (`tools/firmware-test/size-budget.json`). Son mediciones de compilación en host, no evidencia de hardware. Las últimas tres columnas son las regiones de memoria que el runtime configura para la placa (trabajo, retentiva, código)."
    )
    details_title = "Board details" if not spanish else "Detalle por placa"
    topology_title = "Topology" if not spanish else "Topología"
    assets_label = "Support assets" if not spanish else "Assets de soporte"
    build_label = "Build command" if not spanish else "Comando de build"
    docs_ref_label = "Reference anchor" if not spanish else "Ancla de referencia"
    board_col = "Display name" if not spanish else "Nombre visible"
    zephyr_col = "Zephyr target" if not spanish else "Target Zephyr"
    network_col = "Network" if not spanish else "Red"
    validation_col = "Support level" if not spanish else "Nivel de soporte"
    evidence_col = "Evidence records" if not spanish else "Registros de evidencia"
    io_title = "I/O channels" if not spanish else "Canales de E/S"
    unmapped_title = "Not mapped" if not spanish else "Sin mapear"

    lines = [
        "---",
        "slug: /reference/boards",
        "id: boards",
        f"title: {title}",
        f"sidebar_label: {title}",
        f"description: {description}",
        "tags: [reference, boards, generated]",
        "---",
        "",
        f"# {title}",
        "",
        "> [!IMPORTANT]",
        f"> {intro}",
        "",
        f"## {topology_title}",
        "",
    ]
    lines.extend(mermaid_diagram(boards, spanish))
    lines.extend(
        [
            "",
            f"## {summary_title}",
            "",
            f"| {board_col} | Board ID | IDE ID | {zephyr_col} | {network_col} | {validation_col} | {evidence_col} |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for board in boards:
        lines.append(
            "| {display_name} | `{board_id}` | `{ide_id}` | `{zephyr_board}` | {network} | {validation} | {evidence_count} |".format(
                display_name=cell(board["display_name"]),
                board_id=str(board["board_id"]),
                ide_id=str(board["ide_id"]),
                zephyr_board=str(board["zephyr_board"]),
                network=network_summary(board, spanish),
                validation=validation_summary(board),
                evidence_count=len(support(board)["records"]),  # type: ignore[arg-type]
            )
        )
    lines.extend(
        [
            "",
            f"## {footprint_title}",
            "",
            footprint_intro,
            "",
            "| Board ID | Flash (KiB) | Flash budget (KiB) | RAM (KiB) | RAM budget (KiB) | Work (KiB) | RETAIN (KiB) | Code (KiB) |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    not_measured = "not measured" if not spanish else "sin medir"
    for board in boards:
        entry = budget.get(str(board["board_id"]), {})
        measured = entry.get("measured") if isinstance(entry, dict) else None
        limits = entry.get("budget") if isinstance(entry, dict) else None
        memory = board["memory"]
        assert isinstance(memory, dict)
        if isinstance(measured, dict) and isinstance(limits, dict):
            sizes = [kib(measured["flash"]), kib(limits["flash"]), kib(measured["ram"]), kib(limits["ram"])]
        else:
            sizes = [not_measured] * 4
        lines.append(
            "| `{board_id}` | {sizes} | {work} | {retain} | {code} |".format(
                board_id=str(board["board_id"]),
                sizes=" | ".join(sizes),
                work=kib(memory["work_size"]),
                retain=kib(memory["retain_size"]),
                code=kib(memory["code_size_max"]),
            )
        )
    lines.extend(["", f"## {details_title}"])
    for board in boards:
        level = support(board)
        records = level["records"]
        assert isinstance(records, list)
        input_bytes, output_bytes = boards_lib.image_extent(board)
        lines.extend(
            [
                "",
                f"### {board['display_name']}",
                "",
                f"- **Board ID:** `{board['board_id']}`",
                f"- **IDE ID:** `{board['ide_id']}`",
                f"- **Zephyr target:** `{board['zephyr_board']}`",
                f"- **Variant:** `{board['variant']}`",
                f"- **Network:** {network_summary(board, spanish)}",
                f"- **{validation_col}:** {level['level']}"
                + (
                    ""
                    if records
                    else (
                        " (sin registro de hardware)" if spanish else " (no hardware record)"
                    )
                ),
            ]
        )
        for record in records:
            lines.append(
                f"  - `{record['ref']}`: firmware {record['firmware_version']}, commit `{str(record['commit'])[:12]}`, {record['result']}"
            )
        hardware = board.get("hardware")
        if isinstance(hardware, dict):
            lines.append(
                "- **{label}:** {module}, {flash} MB flash, {psram} MB PSRAM{confirmed}".format(
                    label="Module" if not spanish else "Módulo",
                    module=hardware["module"],
                    flash=hardware["flash_mb"],
                    psram=hardware["psram_mb"],
                    confirmed=""
                    if hardware.get("variant_confirmed")
                    else (
                        " (variante por confirmar en el módulo)"
                        if spanish
                        else " (variant to be confirmed on the module)"
                    ),
                )
            )
        lines.extend(
            [
                f"- **{build_label}:** `{board['build_command']}`",
                f"- **{docs_ref_label}:** `{board['docs_ref']}`",
                "- **{label}:** {inp} B, {out} B".format(
                    label="Process image used (input, output)"
                    if not spanish
                    else "Imagen de proceso usada (entrada, salida)",
                    inp=input_bytes,
                    out=output_bytes,
                ),
                "- **{label}:** `{hash}`".format(
                    label="I/O description hash" if not spanish else "Hash de la descripción de E/S",
                    hash=boards_lib.description_hash(board),
                ),
                f"- **{assets_label}:**",
            ]
        )
        for asset in board["support_assets"]:  # type: ignore[union-attr]
            lines.append(f"  - `{asset}`")
        io = board["io"]
        assert isinstance(io, dict)
        lines.extend(
            [
                "",
                f"#### {io_title}",
                "",
                "| Channel | Direction | Kind | Address | Pin | Location | Pin status | Safe | Electrical |"
                if not spanish
                else "| Canal | Dirección | Tipo | Dirección IEC | Pin | Ubicación | Estado del pin | Seguro | Eléctrico |",
                "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
            ]
        )
        for channel in boards_lib.sorted_channels(board):
            kind = str(channel["kind"])
            direction = str(channel["direction"])
            if spanish:
                kind = {"digital": "digital", "analog": "analógico"}[kind]
                direction = {"input": "entrada", "output": "salida"}[direction]
            note = str(channel["electrical"])
            scale = channel.get("range")
            if isinstance(scale, dict):
                note += " {raw} -> {lo} {to} {hi} {unit}.".format(
                    raw=f"{scale['raw_min']}..{scale['raw_max']}",
                    lo=scale["eng_min"],
                    hi=scale["eng_max"],
                    unit=scale["unit"],
                    to="a" if spanish else "to",
                )
            if channel.get("scaling"):
                note += f" {channel['scaling']}."
            lines.append(
                "| {id} | {direction} | {kind} | `{address}` | {pin} | {location} | {status} | {safe} | {note} |".format(
                    id=channel["id"],
                    direction=direction,
                    kind=kind,
                    address=channel["address"],
                    pin=cell(channel["pin"]),
                    location=cell(channel.get("location", "")),
                    status=channel["pin_status"],
                    safe=channel.get("safe", ""),
                    note=cell(note),
                )
            )
        unmapped = io.get("unmapped", [])
        if unmapped:
            lines.extend(["", f"#### {unmapped_title}", ""])
            for item in unmapped:
                lines.append(f"- `{item['terminal']}`: {item['reason']}")
    return "\n".join(line.rstrip() for line in lines).strip() + "\n"


def expected_outputs() -> dict[Path, str]:
    boards = load_boards()
    return {
        OUTPUT_EN: render_board_reference(boards, False),
        OUTPUT_ES: render_board_reference(boards, True),
    }


def write_outputs(outputs: dict[Path, str]) -> None:
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


def check_outputs(outputs: dict[Path, str]) -> int:
    stale: list[str] = []
    for path, expected in outputs.items():
        if not path.exists():
            stale.append(f"missing generated file: {path.relative_to(ROOT)}")
            continue
        if path.read_text() != expected:
            stale.append(f"stale generated file: {path.relative_to(ROOT)}")
    if stale:
        for item in stale:
            print(f"ERROR: {item}")
        return 1
    print("Board reference pages are fresh.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check", action="store_true", help="verify outputs are up to date"
    )
    args = parser.parse_args()
    outputs = expected_outputs()
    if args.check:
        return check_outputs(outputs)
    write_outputs(outputs)
    for path in outputs:
        print(f"Wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
