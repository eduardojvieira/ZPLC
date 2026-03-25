#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "firmware/app/boards/supported-boards.v1.5.0.json"
OUTPUT_EN = ROOT / "docs/docs/reference/boards.md"
OUTPUT_ES = (
    ROOT / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/boards.md"
)


def load_boards() -> list[dict[str, object]]:
    data = json.loads(SOURCE.read_text())
    if not isinstance(data, list):
        raise ValueError("supported board manifest must contain a list")
    return data


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


def validation_summary(board: dict[str, object]) -> str:
    return str(board["validation_level"])


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


def render_board_reference(boards: list[dict[str, object]], spanish: bool) -> str:
    title = "Supported Boards" if not spanish else "Placas Soportadas"
    description = (
        "Generated board reference for the ZPLC v1.5.0 release."
        if not spanish
        else "Referencia generada de placas para el release ZPLC v1.5.0."
    )
    intro = (
        "This page is generated from `firmware/app/boards/supported-boards.v1.5.0.json`. Update the JSON or rerun `python3 tools/docs/generate_board_reference.py` instead of editing this file manually."
        if not spanish
        else "Esta página se genera desde `firmware/app/boards/supported-boards.v1.5.0.json`. Actualizá el JSON o volvé a ejecutar `python3 tools/docs/generate_board_reference.py` en lugar de editar este archivo manualmente."
    )
    summary_title = "Board matrix" if not spanish else "Matriz de placas"
    details_title = "Board details" if not spanish else "Detalle por placa"
    topology_title = "Topology" if not spanish else "Topología"
    assets_label = "Support assets" if not spanish else "Assets de soporte"
    build_label = "Build command" if not spanish else "Comando de build"
    docs_ref_label = "Reference anchor" if not spanish else "Ancla de referencia"
    board_col = "Display name" if not spanish else "Nombre visible"
    zephyr_col = "Zephyr target" if not spanish else "Target Zephyr"
    network_col = "Network" if not spanish else "Red"
    validation_col = "Validation" if not spanish else "Validación"

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
            f"| {board_col} | Board ID | IDE ID | {zephyr_col} | {network_col} | {validation_col} |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )
    for board in boards:
        lines.append(
            "| {display_name} | `{board_id}` | `{ide_id}` | `{zephyr_board}` | {network} | {validation} |".format(
                display_name=str(board["display_name"]),
                board_id=str(board["board_id"]),
                ide_id=str(board["ide_id"]),
                zephyr_board=str(board["zephyr_board"]),
                network=network_summary(board, spanish),
                validation=validation_summary(board),
            )
        )
    lines.extend(["", f"## {details_title}"])
    for board in boards:
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
                f"- **Validation:** {validation_summary(board)}",
                f"- **{build_label}:** `{board['build_command']}`",
                f"- **{docs_ref_label}:** `{board['docs_ref']}`",
                f"- **{assets_label}:**",
            ]
        )
        for asset in board["support_assets"]:
            lines.append(f"  - `{asset}`")
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
