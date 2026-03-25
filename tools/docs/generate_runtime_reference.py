#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
INCLUDE_DIR = ROOT / "firmware/lib/zplc_core/include"
OUTPUT_EN = ROOT / "docs/docs/reference/runtime-api.md"
OUTPUT_ES = (
    ROOT
    / "docs/i18n/es/docusaurus-plugin-content-docs/current/reference/runtime-api.md"
)

TYPE_LABELS = {"enum": "Enum", "struct": "Struct", "typedef": "Typedef"}
TYPE_LABELS_ES = {
    "enum": "Enumeración",
    "struct": "Estructura",
    "typedef": "Typedef",
}
EXCLUDED_MACROS = {
    "ZPLC_CORE_H",
    "ZPLC_SCHEDULER_H",
    "ZPLC_LOADER_H",
    "ZPLC_ISA_H",
    "ZPLC_HAL_H",
    "ZPLC_DEBUG_H",
    "ZPLC_COMM_DISPATCH_H",
    "ZPLC_PACKED",
}
CONTROL_KEYWORDS = ("if", "for", "while", "switch", "return", "sizeof")
FUNCTION_PREFIXES = ("zplc_", "hil_")


@dataclass
class CommentInfo:
    summary: str = ""
    description: list[str] = field(default_factory=list)
    params: list[tuple[str, str]] = field(default_factory=list)
    returns: str = ""
    notes: list[str] = field(default_factory=list)


@dataclass
class FunctionDoc:
    name: str
    signature: str
    return_type: str
    params: list[tuple[str, str]]
    comment: CommentInfo


@dataclass
class MacroDoc:
    name: str
    value: str
    comment: CommentInfo


@dataclass
class TypeDoc:
    name: str
    kind: str
    signature: str
    comment: CommentInfo


@dataclass
class HeaderDoc:
    path: Path
    title: str
    comment: CommentInfo
    functions: list[FunctionDoc] = field(default_factory=list)
    macros: list[MacroDoc] = field(default_factory=list)
    types: list[TypeDoc] = field(default_factory=list)


def clean_inline(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def escape_mdx_text(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("<", "\\<")
    )


def escape_cell(text: str) -> str:
    if not text:
        return "—"
    return escape_mdx_text(text).replace("|", "\\|")


def clean_comment(block: list[str]) -> CommentInfo:
    body: list[str] = []
    for line in block:
        stripped = line.strip()
        stripped = stripped.removeprefix("/**").removeprefix("/*")
        stripped = stripped.removesuffix("*/")
        stripped = stripped.lstrip("*").strip()
        body.append(stripped)

    info = CommentInfo()
    current: tuple[str, int | None] | None = None

    for raw in body:
        line = raw.strip()
        if not line:
            current = None
            continue
        if line.startswith("@brief"):
            info.summary = clean_inline(line[len("@brief") :])
            current = ("summary", None)
            continue
        if line.startswith("SPDX-License-Identifier"):
            current = None
            continue
        if line.startswith("@param"):
            rest = clean_inline(line[len("@param") :])
            if rest.startswith("[") and "]" in rest:
                rest = rest.split("]", 1)[1].strip()
            parts = rest.split(None, 1)
            name = parts[0] if parts else "—"
            desc = parts[1] if len(parts) > 1 else ""
            info.params.append((name, desc))
            current = ("param", len(info.params) - 1)
            continue
        if line.startswith("@return"):
            info.returns = clean_inline(line[len("@return") :])
            current = ("returns", None)
            continue
        if line.startswith("@note"):
            info.notes.append(clean_inline(line[len("@note") :]))
            current = ("note", len(info.notes) - 1)
            continue
        if line.startswith("@"):
            current = None
            continue

        if current is None:
            info.description.append(line)
            continue

        tag, index = current
        if tag == "summary":
            info.summary = clean_inline(f"{info.summary} {line}")
        elif tag == "param" and index is not None:
            name, desc = info.params[index]
            info.params[index] = (name, clean_inline(f"{desc} {line}"))
        elif tag == "returns":
            info.returns = clean_inline(f"{info.returns} {line}")
        elif tag == "note" and index is not None:
            info.notes[index] = clean_inline(f"{info.notes[index]} {line}")
        else:
            info.description.append(line)

    if not info.summary:
        for line in info.description:
            if line:
                info.summary = clean_inline(line)
                break
    return info


def strip_inline_comments(line: str) -> str:
    without_block = re.sub(r"/\*.*?\*/", "", line)
    without_line = without_block.split("//", 1)[0]
    return without_line.rstrip()


def has_comment_content(comment: CommentInfo) -> bool:
    return bool(
        comment.summary
        or comment.description
        or comment.params
        or comment.returns
        or comment.notes
    )


def collect_block_comment(lines: list[str], start: int) -> tuple[list[str], int]:
    block = [lines[start]]
    index = start
    while index < len(lines) and "*/" not in lines[index]:
        index += 1
        if index < len(lines):
            block.append(lines[index])
    return block, index + 1


def collect_define(lines: list[str], start: int) -> tuple[str, int]:
    parts = [strip_inline_comments(lines[start])]
    index = start + 1
    while parts[-1].endswith("\\") and index < len(lines):
        parts.append(strip_inline_comments(lines[index]))
        index += 1
    return clean_inline(" ".join(parts)), index


def parse_macro(declaration: str) -> tuple[str, str] | None:
    match = re.match(
        r"#define\s+(?P<name>[A-Za-z_]\w*)(?P<fn>\s*\()?(?P<rest>.*)$", declaration
    )
    if not match:
        return None
    name = match.group("name")
    if name in EXCLUDED_MACROS:
        return None
    if match.group("fn"):
        return None
    value = clean_inline(match.group("rest"))
    return name, value


def collect_until_semicolon(lines: list[str], start: int) -> tuple[str, int]:
    parts: list[str] = []
    brace_depth = 0
    index = start
    while index < len(lines):
        raw = strip_inline_comments(lines[index]).strip()
        parts.append(raw)
        brace_depth += raw.count("{") - raw.count("}")
        if ";" in raw and brace_depth <= 0:
            return clean_inline(" ".join(parts)).split(";", 1)[0].strip(), index + 1
        index += 1
    raise ValueError(f"unterminated declaration starting at line {start + 1}")


def collect_typedef_block(lines: list[str], start: int) -> tuple[str, int]:
    raw_parts: list[str] = []
    brace_depth = 0
    saw_brace = False
    index = start
    while index < len(lines):
        original = lines[index]
        raw_parts.append(original)
        brace_depth += original.count("{") - original.count("}")
        saw_brace = saw_brace or ("{" in original)
        if ";" in original and (not saw_brace or brace_depth <= 0):
            combined = "\n".join(raw_parts)
            combined = re.sub(r"/\*.*?\*/", "", combined, flags=re.S)
            combined = re.sub(r"//.*", "", combined)
            return clean_inline(combined).split(";", 1)[0].strip(), index + 1
        index += 1
    raise ValueError(f"unterminated typedef starting at line {start + 1}")


def find_first_function_body_brace(text: str) -> int | None:
    paren_depth = 0
    for index, char in enumerate(text):
        if char == "(":
            paren_depth += 1
        elif char == ")":
            paren_depth = max(0, paren_depth - 1)
        elif char == "{" and paren_depth == 0:
            return index
    return None


def skip_brace_block(lines: list[str], start: int, open_braces: int) -> int:
    index = start + 1
    brace_depth = open_braces
    while index < len(lines) and brace_depth > 0:
        brace_depth += lines[index].count("{") - lines[index].count("}")
        index += 1
    return index


def collect_function_declaration(lines: list[str], start: int) -> tuple[str, int]:
    parts: list[str] = []
    index = start
    paren_depth = 0
    while index < len(lines):
        raw = strip_inline_comments(lines[index]).strip()
        parts.append(raw)
        combined = clean_inline(" ".join(parts))

        paren_depth += raw.count("(") - raw.count(")")
        body_brace_index = find_first_function_body_brace(combined)
        if body_brace_index is not None and paren_depth <= 0:
            signature = clean_inline(combined[:body_brace_index]).strip()
            open_braces = combined[: body_brace_index + 1].count("{") - combined[
                : body_brace_index + 1
            ].count("}")
            return signature, skip_brace_block(lines, index, open_braces)
        if ";" in raw and paren_depth <= 0:
            signature = clean_inline(combined.split(";", 1)[0]).strip()
            return signature, index + 1
        index += 1

    raise ValueError(f"unterminated function declaration starting at line {start + 1}")


def looks_like_function_start(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if stripped.startswith(("#", "typedef", "/*", "*", "}", 'extern "C"')):
        return False
    if "(" not in stripped:
        return False
    first_token = stripped.split(None, 1)[0]
    if first_token in CONTROL_KEYWORDS:
        return False
    return True


def parse_function_signature(signature: str) -> tuple[str, str, list[tuple[str, str]]]:
    match = re.search(
        r"(?P<prefix>.+?)\b(?P<name>[A-Za-z_]\w*)\s*\((?P<params>.*)\)$",
        signature,
    )
    if not match:
        raise ValueError(signature)

    return_type = clean_inline(match.group("prefix"))
    name = match.group("name")
    params_raw = match.group("params").strip()
    params: list[tuple[str, str]] = []
    if params_raw and params_raw != "void":
        for part in [clean_inline(chunk) for chunk in params_raw.split(",")]:
            if part == "...":
                params.append(("...", "variadic"))
                continue
            token_match = re.match(r"(?P<type>.+?)(?P<name>[A-Za-z_]\w*)$", part)
            if not token_match:
                params.append((part, ""))
                continue
            params.append(
                (
                    token_match.group("name"),
                    clean_inline(token_match.group("type").rstrip()),
                )
            )
    return name, return_type, params


def parse_type_name(signature: str) -> str:
    function_pointer = re.search(
        r"\(\s*\*\s*(?P<name>[A-Za-z_]\w*)\s*\)\s*\(", signature
    )
    if function_pointer:
        return function_pointer.group("name")

    block_alias = re.search(r"}\s*(?P<name>[A-Za-z_]\w*)$", signature)
    if block_alias:
        return block_alias.group("name")

    tokens = re.findall(r"[A-Za-z_]\w*", signature)
    return tokens[-1] if tokens else "anonymous"


def parse_header(path: Path) -> HeaderDoc:
    lines = path.read_text(encoding="utf-8").splitlines()
    header_comment = CommentInfo(summary=path.name)
    pending_comment: CommentInfo | None = None
    saw_header_comment = False
    functions: list[FunctionDoc] = []
    macros: list[MacroDoc] = []
    types: list[TypeDoc] = []

    index = 0
    while index < len(lines):
        stripped = lines[index].strip()

        if not stripped:
            index += 1
            continue

        if stripped.startswith("/*"):
            block, next_index = collect_block_comment(lines, index)
            if stripped.startswith("/**"):
                parsed = clean_comment(block)
                if not saw_header_comment and any("@file" in line for line in block):
                    header_comment = parsed
                    saw_header_comment = True
                    pending_comment = None
                elif has_comment_content(parsed):
                    pending_comment = parsed
                else:
                    pending_comment = None
            else:
                pending_comment = None
            index = next_index
            continue

        if stripped.startswith("#define"):
            declaration, next_index = collect_define(lines, index)
            parsed = parse_macro(declaration)
            if parsed is not None:
                name, value = parsed
                macros.append(
                    MacroDoc(
                        name=name,
                        value=value,
                        comment=pending_comment or CommentInfo(),
                    )
                )
            pending_comment = None
            index = next_index
            continue

        if stripped.startswith("#"):
            pending_comment = None
            index += 1
            continue

        if stripped.startswith("typedef enum") or stripped.startswith("typedef struct"):
            signature, next_index = collect_typedef_block(lines, index)
            kind = "enum" if stripped.startswith("typedef enum") else "struct"
            types.append(
                TypeDoc(
                    name=parse_type_name(signature),
                    kind=kind,
                    signature=f"{signature};",
                    comment=pending_comment or CommentInfo(),
                )
            )
            pending_comment = None
            index = next_index
            continue

        if stripped.startswith("typedef "):
            signature, next_index = collect_until_semicolon(lines, index)
            types.append(
                TypeDoc(
                    name=parse_type_name(signature),
                    kind="typedef",
                    signature=f"{signature};",
                    comment=pending_comment or CommentInfo(),
                )
            )
            pending_comment = None
            index = next_index
            continue

        if looks_like_function_start(stripped):
            try:
                signature, next_index = collect_function_declaration(lines, index)
                name, return_type, params = parse_function_signature(signature)
            except ValueError:
                pending_comment = None
                index += 1
                continue

            functions.append(
                FunctionDoc(
                    name=name,
                    signature=f"{signature};",
                    return_type=return_type,
                    params=params,
                    comment=pending_comment or CommentInfo(),
                )
            )
            pending_comment = None
            index = next_index
            continue

        pending_comment = None
        index += 1

    return HeaderDoc(
        path=path,
        title=path.name,
        comment=header_comment,
        functions=functions,
        macros=macros,
        types=types,
    )


def load_headers() -> list[HeaderDoc]:
    return [parse_header(path) for path in sorted(INCLUDE_DIR.glob("*.h"))]


def semantic_errors(headers: list[HeaderDoc]) -> list[str]:
    errors: list[str] = []

    for header in headers:
        if not header.functions and not header.types and not header.macros:
            errors.append(f"{header.path.name}: no public API entries were detected")

        for function in header.functions:
            if not function.name.startswith(FUNCTION_PREFIXES):
                errors.append(
                    f"{header.path.name}: suspicious function name '{function.name}'"
                )
            if any(marker in function.signature for marker in ("/*", "*/", "@brief")):
                errors.append(
                    f"{header.path.name}: function signature for '{function.name}' contains comment text"
                )

        for item in header.types:
            if item.name == "anonymous" or "*/" in item.name:
                errors.append(f"{header.path.name}: suspicious type name '{item.name}'")
            if any(marker in item.signature for marker in ("/*", "*/", "@brief")):
                errors.append(
                    f"{header.path.name}: type signature for '{item.name}' contains comment text"
                )

        for macro in header.macros:
            if any(marker in macro.value for marker in ("/*", "*/", "@brief")):
                errors.append(
                    f"{header.path.name}: macro '{macro.name}' contains comment text"
                )

    return errors


def render_function_params_table(function: FunctionDoc, spanish: bool) -> list[str]:
    header = (
        "| Name | Type | Source description |"
        if not spanish
        else "| Nombre | Tipo | Descripción fuente |"
    )
    lines = [header, "| --- | --- | --- |"]
    param_docs = {name: desc for name, desc in function.comment.params}
    if not function.params:
        lines.append(f"| — | — | {'None.' if not spanish else 'Ninguno.'} |")
        return lines
    for name, param_type in function.params:
        lines.append(
            "| `{name}` | `{type_}` | {desc} |".format(
                name=escape_cell(name),
                type_=escape_cell(param_type or "—"),
                desc=escape_cell(param_docs.get(name, "")),
            )
        )
    return lines


def render_types_table(types: list[TypeDoc], spanish: bool) -> list[str]:
    if not types:
        return ["None." if not spanish else "Ninguno."]
    header = (
        "| Name | Kind | Source summary |"
        if not spanish
        else "| Nombre | Tipo | Resumen fuente |"
    )
    labels = TYPE_LABELS_ES if spanish else TYPE_LABELS
    lines = [header, "| --- | --- | --- |"]
    for item in types:
        lines.append(
            "| `{name}` | {kind} | {summary} |".format(
                name=escape_cell(item.name),
                kind=labels.get(item.kind, item.kind),
                summary=escape_cell(item.comment.summary),
            )
        )
    return lines


def render_macros_table(macros: list[MacroDoc], spanish: bool) -> list[str]:
    if not macros:
        return ["None." if not spanish else "Ninguno."]
    header = (
        "| Name | Value | Source summary |"
        if not spanish
        else "| Nombre | Valor | Resumen fuente |"
    )
    lines = [header, "| --- | --- | --- |"]
    for item in macros:
        lines.append(
            "| `{name}` | `{value}` | {summary} |".format(
                name=escape_cell(item.name),
                value=escape_cell(item.value),
                summary=escape_cell(item.comment.summary),
            )
        )
    return lines


def render_function_block(function: FunctionDoc, spanish: bool) -> list[str]:
    summary_label = "Source summary" if not spanish else "Resumen fuente"
    params_label = "Parameters" if not spanish else "Parámetros"
    return_label = "Source return value" if not spanish else "Retorno fuente"
    notes_label = "Source notes" if not spanish else "Notas fuente"
    no_summary = (
        "No summary found in the header comment."
        if not spanish
        else "No se encontró un resumen en el comentario del header."
    )

    lines = [f"#### `{function.name}`", "", "```c", function.signature, "```", ""]
    lines.append(
        f"**{summary_label}:** {escape_mdx_text(function.comment.summary) or no_summary}"
    )
    if function.comment.description:
        lines.extend(["", escape_mdx_text(" ".join(function.comment.description))])
    lines.extend(["", f"**{params_label}**", ""])
    lines.extend(render_function_params_table(function, spanish))
    if function.comment.returns:
        lines.extend(
            ["", f"**{return_label}:** {escape_mdx_text(function.comment.returns)}"]
        )
    if function.comment.notes:
        lines.extend(["", f"**{notes_label}:**"])
        for note in function.comment.notes:
            lines.append(f"- {escape_mdx_text(note)}")
    return lines


def render_runtime_reference(headers: list[HeaderDoc], spanish: bool) -> str:
    title = "Runtime API" if not spanish else "API del Runtime"
    description = (
        "Generated reference for the public ZPLC runtime headers that ship with v1.5.0."
        if not spanish
        else "Referencia generada para los headers públicos del runtime ZPLC incluidos en v1.5.0."
    )
    intro = (
        "This page is generated from the public C headers under `firmware/lib/zplc_core/include/`. Edit the headers or rerun `python3 tools/docs/generate_runtime_reference.py` instead of editing this file manually."
        if not spanish
        else "Esta página se genera a partir de los headers públicos en C bajo `firmware/lib/zplc_core/include/`. Editá los headers o volvé a ejecutar `python3 tools/docs/generate_runtime_reference.py` en lugar de editar este archivo manualmente."
    )
    parity_note = (
        "The Spanish wrapper text is localized, while API names, signatures, and source-derived descriptions remain anchored to the English headers to avoid documentation drift."
        if not spanish
        else "El texto envolvente está localizado al español, mientras que los nombres de API, las firmas y las descripciones derivadas del código se mantienen ancladas a los headers en inglés para evitar drift documental."
    )
    headers_title = "Source headers" if not spanish else "Headers fuente"
    functions_title = "Functions" if not spanish else "Funciones"
    types_title = "Types" if not spanish else "Tipos"
    macros_title = "Constants and macros" if not spanish else "Constantes y macros"
    source_label = "Source" if not spanish else "Fuente"
    none_message = (
        "None detected in this header."
        if not spanish
        else "No se detectaron elementos en este header."
    )

    lines = [
        "---",
        "slug: /reference/runtime-api",
        "id: runtime-api",
        f"title: {title}",
        f"sidebar_label: {title}",
        f"description: {description}",
        "tags: [reference, runtime, generated]",
        "---",
        "",
        f"# {title}",
        "",
        "> [!IMPORTANT]",
        f"> {intro}",
        "",
        f"> {parity_note}",
        "",
        f"## {headers_title}",
        "",
    ]
    for header in headers:
        lines.append(f"- `{header.path.relative_to(ROOT)}`")

    for header in headers:
        lines.extend(["", f"## `{header.title}`", ""])
        if header.comment.summary:
            lines.extend([escape_mdx_text(header.comment.summary), ""])
        if header.comment.description:
            lines.extend([escape_mdx_text(" ".join(header.comment.description)), ""])
        lines.append(f"{source_label}: `{header.path.relative_to(ROOT)}`")
        lines.extend(["", f"### {functions_title}", ""])
        if header.functions:
            for function in header.functions:
                lines.extend(render_function_block(function, spanish))
                lines.append("")
        else:
            lines.extend([none_message, ""])
        lines.extend([f"### {types_title}", ""])
        lines.extend(render_types_table(header.types, spanish))
        lines.extend(["", f"### {macros_title}", ""])
        lines.extend(render_macros_table(header.macros, spanish))

    return "\n".join(line.rstrip() for line in lines).strip() + "\n"


def expected_outputs() -> dict[Path, str]:
    headers = load_headers()
    return {
        OUTPUT_EN: render_runtime_reference(headers, False),
        OUTPUT_ES: render_runtime_reference(headers, True),
    }


def write_outputs(outputs: dict[Path, str]) -> None:
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def check_outputs(outputs: dict[Path, str]) -> int:
    stale: list[str] = []
    for path, expected in outputs.items():
        if not path.exists():
            stale.append(f"missing generated file: {path.relative_to(ROOT)}")
            continue
        if path.read_text(encoding="utf-8") != expected:
            stale.append(f"stale generated file: {path.relative_to(ROOT)}")
    if stale:
        for item in stale:
            print(f"ERROR: {item}")
        return 1
    print("Runtime API reference pages are fresh.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check", action="store_true", help="verify outputs are up to date"
    )
    args = parser.parse_args()
    headers = load_headers()
    errors = semantic_errors(headers)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    outputs = {
        OUTPUT_EN: render_runtime_reference(headers, False),
        OUTPUT_ES: render_runtime_reference(headers, True),
    }
    if args.check:
        return check_outputs(outputs)
    write_outputs(outputs)
    for path in outputs:
        print(f"Wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
