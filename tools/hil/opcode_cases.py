"""Opcode-level device scripts as tables: a program of raw bytecode, and what the HIL trace must show (HIL-004).

The trace frames (`{"t":"opcode","op":...,"sp":...,"tos":...}`) are printed only by a firmware image built with
CONFIG_ZPLC_HIL_DEBUG=y. Release images do not carry them (HIL-013), and then these scripts exit 77, which is a
skipped run and not a pass. A device that says nothing about it, or a runtime that cannot trace, fails them.
"""
from __future__ import annotations

import struct
import sys
from typing import Callable

from zplc_tester import ZPLCTester  # first: it puts tools/contract on sys.path
from zplc_contract import VmError  # noqa: E402

ERR = {error.name: int(error) for error in VmError}


def u32(value: int) -> int:
    return value & 0xFFFFFFFF


def f32(value: float) -> int:
    """The bit pattern of a REAL, which is what a 32-bit stack slot holds."""
    return struct.unpack("<I", struct.pack("<f", value))[0]


def push32(value: int) -> list[int]:
    return list(struct.pack("<I", u32(value)))


def pushf(value: float) -> list[int]:
    return list(struct.pack("<f", value))


def trace_unsupported(tester: ZPLCTester) -> bool:
    """True when the device itself says it has no HIL trace mode."""
    answer = tester.send("zplc hil mode verbose")
    return "not found" in answer or "ERROR" in answer or "disabled" in answer.lower()


def run(tester: ZPLCTester, cases: list[dict], prelude: Callable[[ZPLCTester], None] | None = None) -> int:
    """Run each case on the device and judge its trace. A case holds:

    name   the check's name
    code   the bytecode, a list of ints
    tos    the top of stack the last opcode trace must show, compared as 32 bits (-1 and 0xFFFFFFFF are the same)
    tos_gt a value the top of stack must exceed (a clock reading)
    real   instead of tos: a float the top of stack must decode to, within 1e-5
    sp     the stack depth the last opcode trace must show
    ops    opcode names that must appear in the trace
    error  the name of the VmError the trace must report
    pre    a function that prepares memory after the reset and before the program runs
    """
    if trace_unsupported(tester):
        tester.skip("this firmware image has no HIL trace (CONFIG_ZPLC_HIL_DEBUG is off); build with it to run the opcode scripts")
        tester.close()
        return tester.finish()
    for case in cases:
        try:
            traces = tester.run_bytecode(case["code"], before_start=case.get("pre"))
        except Exception as error:  # an upload or a device error is this case's failure, with its message
            tester.check(case["name"], False, f"{type(error).__name__}: {error}")
            continue
        tos, sp = tester.get_last_tos(traces), tester.get_last_sp(traces)
        problems = []
        if "tos" in case and (tos is None or u32(tos) != u32(case["tos"])):
            problems.append(f"tos={tos!r}, wanted {case['tos']!r}")
        if "tos_gt" in case and (tos is None or u32(tos) <= case["tos_gt"]):
            problems.append(f"tos={tos!r}, wanted more than {case['tos_gt']!r}")
        if "real" in case:
            got = None if tos is None else struct.unpack("<f", struct.pack("<I", u32(tos)))[0]
            if got is None or abs(got - case["real"]) > 1e-5:
                problems.append(f"tos={got!r}, wanted {case['real']!r}")
        if "sp" in case and sp != case["sp"]:
            problems.append(f"sp={sp!r}, wanted {case['sp']!r}")
        for name in case.get("ops", []):
            if not any(t.get("t") == "opcode" and t.get("op") == name for t in traces):
                problems.append(f"no {name} in the trace")
        if "error" in case:
            seen = next((t.get("code") for t in traces if t.get("t") == "error"), None)
            if seen != ERR[case["error"]]:
                problems.append(f"error={seen!r}, wanted {case['error']} ({ERR[case['error']]})")
        tester.check(case["name"], not problems, "; ".join(problems))
    tester.close()
    return tester.finish()


def script(main: Callable[[], int]) -> None:
    sys.exit(main())
