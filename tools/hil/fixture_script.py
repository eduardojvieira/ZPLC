"""What a fixture-driven device script does: run some fixtures of fixtures.json and exit with the verdict (HIL-004, HIL-005)."""
from __future__ import annotations

import sys

from language_tester import LanguageTester, fixtures_of


def main(ids: list[str] | None = None, language: str | None = None, tester: LanguageTester | None = None) -> int:
    chosen = fixtures_of(ids=ids, language=language)
    if not chosen:
        raise SystemExit(f"no fixture matches ids={ids} language={language}")
    return (tester or LanguageTester()).run_fixtures(chosen)


def script(ids: list[str] | None = None, language: str | None = None) -> None:
    """The body of `if __name__ == "__main__"` of a script that only runs fixtures."""
    sys.exit(main(ids, language))
