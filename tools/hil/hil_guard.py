"""The human-presence guard of the hardware commands (HIL-003, HIL-012).

A command that drives a board needs a person at an interactive terminal, and every physical step needs that person to
type the identity the board reports. Nothing here is a flag that turns it off: a run with no terminal exits with an
error, and the places a pipe or a script could stand in for a person (stdin that is not a terminal) are refused.
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone


class NotInteractive(Exception):
    pass


class IdentityMismatch(Exception):
    pass


class TerminalIo:
    """The terminal of the person who ran the command."""

    @property
    def interactive(self) -> bool:
        return bool(sys.stdin.isatty() and sys.stdout.isatty())

    def say(self, text: str) -> None:
        print(text, flush=True)

    def ask(self, prompt: str) -> str:
        return input(prompt)


class PipedIo:
    """What a command has when no person is there: it says things, and it cannot be asked."""

    interactive = False

    def say(self, text: str) -> None:
        print(text, flush=True)

    def ask(self, prompt: str) -> str:
        raise NotInteractive("a question was asked of a terminal that is not interactive")


def require_interactive(io, what: str) -> None:
    if not io.interactive:
        raise NotInteractive(
            f"{what} needs an interactive terminal: a person at the bench starts it and confirms each physical step. "
            "It is never started from a script, a pipe, MCP or an AI tool."
        )


def confirm_physical(io, step: dict, reported_identity: str, attempts: int = 2, wait_first: bool = False) -> dict:
    """Tell the person what to do, then require them to type `reported_identity`, the board the device says it is.

    `wait_first` asks for Enter before the identity: for a step the person has to carry out, such as a flash,
    after which the device is asked who it is.
    """
    io.say(f"\nPhysical step: {step.get('title', step['id'])}\n  {step['instruction']}")
    if wait_first:
        io.ask("  Press Enter when it is done: ")
    for attempt in range(1, attempts + 1):
        typed = io.ask(f"  Type the board identity the device reports ({reported_identity}) to confirm: ").strip()
        if typed == reported_identity:
            return {"confirmed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z", "confirmed_identity": typed}
        io.say(f"  That is not the identity the device reported ({attempt} of {attempts}).")
    raise IdentityMismatch(f"step {step['id']} was not confirmed: the identity typed is not {reported_identity!r}")
