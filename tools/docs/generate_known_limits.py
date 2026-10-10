#!/usr/bin/env python3
"""Known limits tables, rendered from the expected-failures list (VF-019, DOC-001).

The documentation says what the compiler and the standard library do not do yet. A table
written by hand rots the day a case is fixed, so the tables are generated:

* `tools/ci/expected-failures.json` says which conformance cases fail today and for which
  requirement (the compiler writers own it);
* `docs/known-limits.json` says, per requirement, what happens today, in English and in
  Spanish;
* this script renders one row per requirement that has at least one failing case, between
  GENERATED markers of the pages, with the titles of its failing cases. A requirement with
  no failing case has no row, so a row disappears by itself when its last case is fixed.

    python3 tools/docs/generate_known_limits.py           write the pages
    python3 tools/docs/generate_known_limits.py --check   exit 1 when a page is stale, or when
                                                          a requirement of the list has no
                                                          description in the mapping

Mapping entry:

    "CMP-057": {
      "page": "library",                   "language" (default) or "library"
      "en": "...", "es": "...",            a sentence that is true while any case fails
      "cases": {                           optional: one sentence per case, shown only while
        "TON elapsed time stops ...": {"en": "...", "es": "..."}   that case fails
      }
    }

The key of a case is its title in the list without the leading requirement identifier.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GENERATOR_REL = "tools/docs/generate_known_limits.py"
MAPPING_REL = "docs/known-limits.json"
FAILURES_REL = "tools/ci/expected-failures.json"
EN_DIR = "docs/docs"
ES_DIR = "docs/i18n/es/docusaurus-plugin-content-docs/current"

# page key -> page path below the language directory
PAGES = {
    "language": "languages/st.md",
    "library": "runtime/stdlib.md",
}
LANGS = ("en", "es")

HEADERS = {
    "en": ("Requirement", "What happens today", "Cases that fail today"),
    "es": ("Requisito", "Qué ocurre hoy", "Casos que fallan hoy"),
}
EMPTY = {
    "en": "No conformance case of this area is on the expected-failures list: no limit is recorded.",
    "es": "Ningún caso de conformidad de esta área figura en la lista de fallos esperados: no hay un límite registrado.",
}

ID_RE = re.compile(r"^[A-Z]+-[0-9]{3}$")
CASE_PREFIX_RE = re.compile(r"^[A-Z]+-[0-9]{3} ")
CODE_SPAN_RE = re.compile(r"`[^`]*`")


def marker_begin(name: str) -> str:
    return f"{{/* >>> GENERATED ({GENERATOR_REL}): {name}. Do not edit. >>> */}}"


def marker_end(name: str) -> str:
    return f"{{/* <<< END GENERATED: {name} <<< */}}"


def block_name(page: str) -> str:
    return f"known-limits-{page}"


def case_title(test: str) -> str:
    """The title of a case: the id of the list entry without the suite path and the leading requirement."""
    return CASE_PREFIX_RE.sub("", test.split(" > ")[-1], count=1)


def requirement_sort_key(identifier: str) -> tuple[str, int]:
    prefix, _, number = identifier.partition("-")
    return (prefix, int(number))


def load_failures(root: Path) -> dict[str, list[str]]:
    """Requirement -> titles of its failing cases, in the order of the list."""
    entries = json.loads((root / FAILURES_REL).read_text(encoding="utf-8"))
    failing: dict[str, list[str]] = {}
    for entry in entries:
        failing.setdefault(entry["requirement"], []).append(case_title(entry["test"]))
    return failing


def load_mapping(root: Path) -> dict[str, dict]:
    return json.loads((root / MAPPING_REL).read_text(encoding="utf-8"))


def mapping_errors(mapping: dict, failing: dict[str, list[str]]) -> list[str]:
    """(b): a requirement of the list without a description, and descriptions that cannot be rendered."""
    errors: list[str] = []
    for identifier in sorted(failing, key=requirement_sort_key):
        if identifier not in mapping:
            errors.append(
                f"{identifier} has failing cases ({len(failing[identifier])}) in {FAILURES_REL} "
                f"and no description in {MAPPING_REL}: add one, in English and Spanish"
            )
    for identifier, entry in mapping.items():
        where = f"{MAPPING_REL}: {identifier}"
        if not ID_RE.match(identifier):
            errors.append(f"{where}: the key must look like CMP-012")
            continue
        if not isinstance(entry, dict):
            errors.append(f"{where}: the value must be an object")
            continue
        if entry.get("page", "language") not in PAGES:
            errors.append(f"{where}: page must be one of {', '.join(PAGES)}")
        texts = [(lang, entry.get(lang)) for lang in LANGS]
        for case, refinement in (entry.get("cases") or {}).items():
            if not isinstance(refinement, dict):
                errors.append(f"{where}: case '{case}' must be an object with en and es")
                continue
            texts += [(f"{lang} of case '{case}'", refinement.get(lang)) for lang in LANGS]
        for label, text in texts:
            if not isinstance(text, str) or not text.strip():
                errors.append(f"{where}: {label} must be a non-empty sentence")
            elif re.search(r"[<{}]", CODE_SPAN_RE.sub("", text)):
                errors.append(f"{where}: {label} has a '<', '{{' or '}}' outside a code span, which the site would read as markup")
            elif "|" in CODE_SPAN_RE.sub("", text):
                errors.append(f"{where}: {label} has a '|' outside a code span, which would end the table cell")
    return errors


def code(text: str) -> str:
    """A title as a code span (no markup is read inside it), with the pipes that would end a table cell escaped."""
    fence = "``" if "`" in text else "`"
    return f"{fence}{text.replace('|', chr(92) + '|')}{fence}"


def row_text(entry: dict, titles: list[str], lang: str) -> str:
    sentences = [entry[lang].strip()]
    seen = set(sentences)
    for title in titles:
        refinement = (entry.get("cases") or {}).get(title)
        if refinement and refinement[lang].strip() not in seen:
            sentences.append(refinement[lang].strip())
            seen.add(refinement[lang].strip())
    return " ".join(sentences).replace("|", "\\|")


def render_table(mapping: dict, failing: dict[str, list[str]], page: str, lang: str) -> str:
    rows: list[str] = []
    for identifier in sorted(failing, key=requirement_sort_key):
        entry = mapping.get(identifier)
        if entry is None or entry.get("page", "language") != page:
            continue
        titles = failing[identifier]
        cases = "<br />".join(code(title) for title in titles)
        rows.append(f"| {identifier} | {row_text(entry, titles, lang)} | {cases} |")
    if not rows:
        return EMPTY[lang]
    head, sep = HEADERS[lang], "|---|---|---|"
    return "\n".join([f"| {head[0]} | {head[1]} | {head[2]} |", sep, *rows])


def apply_block(text: str, name: str, rendered: str, where: str) -> str:
    begin, end = marker_begin(name), marker_end(name)
    if text.count(begin) != 1 or text.count(end) != 1:
        raise ValueError(f"{where}: expected exactly one marker pair for '{name}' ({begin} ... {end})")
    head, rest = text.split(begin, 1)
    old, tail = rest.split(end, 1)
    if begin in old or end in head:
        raise ValueError(f"{where}: the marker pair for '{name}' is out of order")
    return f"{head}{begin}\n{rendered}\n{end}{tail}"


def build_outputs(root: Path = ROOT) -> dict[Path, str]:
    """Every page that carries a block, with the block rendered from the list and the mapping."""
    failing = load_failures(root)
    mapping = load_mapping(root)
    errors = mapping_errors(mapping, failing)
    if errors:
        raise ValueError("\n".join(errors))
    outputs: dict[Path, str] = {}
    for lang, directory in (("en", EN_DIR), ("es", ES_DIR)):
        for page, relative in PAGES.items():
            path = root / directory / relative
            text = outputs.get(path)
            if text is None:
                text = path.read_text(encoding="utf-8")
            outputs[path] = apply_block(
                text, block_name(page), render_table(mapping, failing, page, lang), str(path.relative_to(root))
            )
    return outputs


def notes(root: Path = ROOT) -> list[str]:
    """Things that are not errors: descriptions no case needs now, and failing cases with no sentence of their own."""
    failing = load_failures(root)
    mapping = load_mapping(root)
    result: list[str] = []
    unused = sorted((i for i in mapping if i not in failing), key=requirement_sort_key)
    if unused:
        result.append(
            f"descriptions with no failing case today (kept, not rendered): {', '.join(unused)}"
        )
    for identifier in sorted(failing, key=requirement_sort_key):
        refinements = (mapping.get(identifier) or {}).get("cases")
        if refinements is None:
            continue
        missing = [title for title in failing[identifier] if title not in refinements]
        if missing:
            result.append(f"{identifier}: failing cases without a sentence of their own: {', '.join(missing)}")
    return result


def check_outputs(outputs: dict[Path, str], root: Path = ROOT) -> list[str]:
    stale = []
    for path, expected in outputs.items():
        if path.read_text(encoding="utf-8") != expected:
            stale.append(f"stale generated block: {path.relative_to(root)}")
    return stale


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="exit 1 when a page is stale or a requirement has no description")
    args = parser.parse_args(argv)
    try:
        outputs = build_outputs(ROOT)
    except ValueError as error:
        for line in str(error).split("\n"):
            print(f"ERROR: {line}")
        return 1
    for note in notes(ROOT):
        print(f"note: {note}")
    if args.check:
        stale = check_outputs(outputs, ROOT)
        for item in stale:
            print(f"ERROR: {item}; run python3 {GENERATOR_REL}")
        if stale:
            return 1
        print("Known limits tables are fresh.")
        return 0
    for path, content in outputs.items():
        path.write_text(content, encoding="utf-8")
        print(f"Wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
