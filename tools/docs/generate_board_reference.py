#!/usr/bin/env python3
"""Generate docs/docs/reference/boards.md (EN) and its Spanish copy from firmware/app/boards/boards.json,
and the board table inside the hardware support page (DOC-010, between its GENERATED markers).

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
# The hardware support page is written by hand; only the board table inside it is generated.
SUPPORT_EN = ROOT / "docs/docs/reference/capabilities-evidence.md"
SUPPORT_ES = (
    ROOT
    / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/capabilities-evidence.md"
)
GENERATOR = "tools/docs/generate_board_reference.py"
SUPPORT_BLOCK = "hardware-support-boards"


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


def community(board: dict[str, object]) -> list[dict[str, object]]:
    """The reports from users that name the board, at the community-reported level (HIL-011): leads, never records."""
    return boards_lib.community_reports(board, ROOT)


def validation_summary(board: dict[str, object]) -> str:
    return str(support(board)["level"])


def watchdog_line(board: dict[str, object], spanish: bool) -> str:
    """The hardware watchdog of the profile, and why it is off when it is (RT-020, HIL-011)."""
    watchdog = board.get("watchdog")
    label = "Hardware watchdog" if not spanish else "Watchdog de hardware"
    if not isinstance(watchdog, dict):
        return f"- **{label}:** " + ("sin declarar" if spanish else "not declared")
    states = {"disarm": ("disarmed", "desarmado"), "feed": ("kept fed", "alimentado"), "expire": ("left to expire", "se deja expirar")}

    def action(state: str) -> str:
        return states[str(watchdog[state])][1 if spanish else 0]

    if watchdog.get("enabled") is True:
        return (
            f"- **{label}:** "
            + (
                "activo, timeout {t} ms (hasta {m} ms según las tareas); en STOP {s}, en pausa o breakpoint {p}, en falla enganchada {f}"
                if spanish
                else "on, timeout {t} ms (up to {m} ms for the task set); in STOP {s}, paused or at a breakpoint {p}, in a latched fault {f}"
            ).format(
                t=watchdog["timeout_ms"], m=watchdog["max_timeout_ms"], s=action("stop"), p=action("pause"), f=action("fault")
            )
        )
    why = (
        "apagado: sin registro de hardware (HIL-010), el perfil lo mantiene apagado hasta que el tiempo de reinicio y las "
        "salidas seguras se registren en esta placa con él encendido"
        if spanish
        else "off: no hardware record (HIL-010), the profile keeps it off until the reset timing and the safe outputs are "
        "recorded on this board with it enabled"
    )
    return f"- **{label}:** {why}"


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
        else "Esta página se genera desde `firmware/app/boards/boards.json`, el único manifiesto de placas. Actualice el JSON o vuelva a ejecutar `python3 tools/docs/generate_board_reference.py` en lugar de editar este archivo manualmente."
    )
    description_title = "The I/O description" if not spanish else "La descripción de E/S"
    description_lines = (
        [
            "Each board entry of the manifest has an `io` object that lists the channels of the board. A channel has an `id`, a `direction` (`input` or `output`), a `kind` (`digital` or `analog`), the IEC `address` of its place in the process image (`%QX0.0`, `%IW4`), the `pin` or terminal printed on the board, its `electrical` notes, the `safe` value of an output, and a `dt` object with the devicetree alias, GPIO controller and pin (or the converter and channel) that the build checks.",
            "`pin_status` says where the pin comes from: `devicetree` is a pin that the board's own devicetree or the profile overlay defines and the build proves; `profile` is a header pin this profile chose, which needs the loopback bench of HIL-010 to be confirmed.",
            "To add a channel to a board, add the alias to its overlay and the entry to its description. The firmware I/O table is generated from the description at build time, so no C source changes, and the build fails when the description and the devicetree disagree. A word of the process image that no pin drives is not a channel: a project lists it under `io.virtual`.",
            "Studio reads the same file. The I/O mapping editor of the project settings lists the channels of the selected board with their pin names and marks a row on an address the board does not have; a build fails with an error that names the board and the variable when a variable is located where the board has no channel; and a hardware deploy is refused, with a message that names the board, when the firmware reports another description or the program touches an address without a channel.",
        ]
        if not spanish
        else [
            "Cada entrada de placa del manifiesto tiene un objeto `io` que lista los canales de la placa. Un canal tiene un `id`, una `direction` (`input` u `output`), un `kind` (`digital` o `analog`), la `address` IEC de su lugar en la imagen de proceso (`%QX0.0`, `%IW4`), el `pin` o borne impreso en la placa, sus notas `electrical`, el valor `safe` de una salida y un objeto `dt` con el alias de devicetree, el controlador GPIO y el pin (o el conversor y el canal) que el build verifica.",
            "`pin_status` dice de dónde sale el pin: `devicetree` es un pin que el devicetree de la placa o el overlay del perfil define y el build comprueba; `profile` es un pin de header que este perfil eligió y que necesita el banco de lazo de HIL-010 para confirmarse.",
            "Para agregar un canal a una placa, agregue el alias a su overlay y la entrada a su descripción. La tabla de E/S del firmware se genera desde la descripción al compilar, así que ningún fuente C cambia, y el build falla cuando la descripción y el devicetree no coinciden. Una palabra de la imagen de proceso que ningún pin maneja no es un canal: un proyecto la lista en `io.virtual`.",
            "Studio lee el mismo archivo. El editor de mapeo de E/S de la configuración del proyecto lista los canales de la placa seleccionada con sus nombres de pin y marca una fila en una dirección que la placa no tiene; un build falla con un error que nombra la placa y la variable cuando una variable está ubicada donde la placa no tiene canal; y un despliegue a hardware se rechaza, con un mensaje que nombra la placa, cuando el firmware informa otra descripción o el programa toca una dirección sin canal.",
        ]
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
        ":::note",
        intro,
        ":::",
        "",
        f"## {topology_title}",
        "",
    ]
    lines.extend(mermaid_diagram(boards, spanish))
    lines.extend(["", f"## {description_title}", ""])
    for paragraph in description_lines:
        lines.extend([paragraph, ""])
    lines.pop()
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
        for report in community(board):
            lines.append(
                f"  - `{report['ref']}`: "
                + ("reportado por la comunidad" if spanish else "community-reported")
                + f", firmware {report['firmware_version']}, commit `{str(report['commit'])[:12]}`, {report['result']}"
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
        lines.append(watchdog_line(board, spanish))
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
        ports = board.get("fieldbus", [])
        if ports:
            lines.extend(
                [
                    "",
                    "#### Fieldbus ports" if not spanish else "#### Puertos de bus de campo",
                    "",
                    "| Port | Protocol | UART | TX | RX | Location | Electrical |"
                    if not spanish
                    else "| Puerto | Protocolo | UART | TX | RX | Ubicación | Eléctrico |",
                    "| --- | --- | --- | --- | --- | --- | --- |",
                ]
            )
            for port in ports:  # type: ignore[union-attr]
                lines.append(
                    f"| {port['id']} | {port['protocol']} | `{port['uart']}` | {port['tx']} | {port['rx']} | "
                    f"{cell(port['location'])} | {cell(port['electrical'])} |"
                )
    return "\n".join(line.rstrip() for line in lines).strip() + "\n"


def render_support_table(boards: list[dict[str, object]], spanish: bool) -> str:
    """The one board status table (DOC-010): the level of each board comes from its evidence records, never by hand."""
    head = (
        "| Board | IDE ID | Zephyr target | Network | Support level | Evidence records |"
        if not spanish
        else "| Placa | ID del IDE | Destino Zephyr | Red | Nivel de soporte | Registros de evidencia |"
    )
    none = "ninguno" if spanish else "none"
    lines = [head, "| --- | --- | --- | --- | --- | --- |"]
    for board in boards:
        status = support(board)
        records = [
            f"{item['result']} on {item['firmware_version']} (`{str(item['commit'])[:7]}`)"
            if not spanish
            else f"{item['result']} en {item['firmware_version']} (`{str(item['commit'])[:7]}`)"
            for item in status["records"]  # type: ignore[union-attr]
        ]
        # a report from a user is listed beside the records and is never one of them (HIL-011)
        records += [
            f"{'reportado por la comunidad' if spanish else 'community-reported'}: {item['result']} "
            f"{'en' if spanish else 'on'} {item['firmware_version']} (`{str(item['commit'])[:7]}`)"
            for item in community(board)
        ]
        lines.append(
            "| {name} | `{ide}` | `{target}` | {network} | `{level}` | {records} |".format(
                name=cell(board["display_name"]),
                ide=board["ide_id"],
                target=board["zephyr_board"],
                network=network_summary(board, spanish),
                level=status["level"],
                records=cell("; ".join(records)) if records else none,
            )
        )
    verified = sum(1 for board in boards if support(board)["level"] != "cross-build")
    if verified == 0:
        summary = (
            "Ninguna placa tiene un registro de hardware: cada fila dice que el firmware compila para esa placa, y nada más."
            if spanish
            else "No board has a hardware record: each row says that the firmware builds for that board, and nothing more."
        )
    else:
        summary = (
            f"{verified} de {len(boards)} placas tienen un registro de hardware que pasó; las demás solo compilan."
            if spanish
            else f"{verified} of {len(boards)} boards have a passing hardware record; the others only build."
        )
    return "\n".join(lines) + "\n\n" + summary


def block_markers(name: str) -> tuple[str, str]:
    return (
        f"{{/* >>> GENERATED ({GENERATOR}): {name}. Do not edit. >>> */}}",
        f"{{/* <<< END GENERATED: {name} <<< */}}",
    )


def replace_block(text: str, name: str, body: str, path: Path) -> str:
    begin, end = block_markers(name)
    start = text.find(begin)
    stop = text.find(end)
    if start < 0 or stop < start:
        raise ValueError(
            f"{path.relative_to(ROOT)} has no `{begin}` ... `{end}` markers for the generated board table"
        )
    return text[: start + len(begin)] + "\n\n" + body + "\n\n" + text[stop:]


def expected_outputs() -> dict[Path, str]:
    boards = load_boards()
    outputs = {
        OUTPUT_EN: render_board_reference(boards, False),
        OUTPUT_ES: render_board_reference(boards, True),
    }
    for path, spanish in ((SUPPORT_EN, False), (SUPPORT_ES, True)):
        outputs[path] = replace_block(
            path.read_text(), SUPPORT_BLOCK, render_support_table(boards, spanish), path
        )
    return outputs


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
