#!/usr/bin/env python3
"""Generate the 64-bit and LREAL conformance cases of CMP-011 to CMP-016 (conformance/cmp/cmp-015-*).

The expected values are computed here, with Python integers and struct (IEEE 754 binary64 of the
host's double, one correctly rounded operation at a time), so that no expectation is the output of the
compiler or of the VM under test. Every case writes its results to the output image: a 64-bit value
is two UDINT cells, low word first (`%QD0`, `%QD1`), a BOOL is a bit of `%QX512.n`.

    python3 tools/ci/gen_cmp015_cases.py            write the cases
    python3 tools/ci/gen_cmp015_cases.py --check    exit 1 when a committed case differs

Run from the repository root. The cases are plain files: edit the generator, not them.
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "conformance/cmp"

M64 = (1 << 64) - 1
INT_MIN = -(1 << 63)
INT_MAX = (1 << 63) - 1


def u64(v: int) -> int:
    return v & M64


def s64(v: int) -> int:
    v &= M64
    return v - (1 << 64) if v >> 63 else v


def dbits(x: float) -> int:
    return struct.unpack("<Q", struct.pack("<d", x))[0]


def dval(bits: int) -> float:
    return struct.unpack("<d", struct.pack("<Q", bits))[0]


def f32(x: float) -> float:
    return struct.unpack("<f", struct.pack("<f", x))[0]


QNAN = 0x7FF8000000000000


def st_real(x: float) -> str:
    """An ST real literal for x: a decimal point always, the exponent as 1.0E-5."""
    text = repr(float(x))
    if "e" in text:
        mantissa, exponent = text.split("e")
        if "." not in mantissa:
            mantissa += ".0"
        return f"{mantissa}E{int(exponent)}"
    return text if "." in text else text + ".0"


def st_int(v: int) -> str:
    return str(v)


class Case:
    TAGS = ["arch-sensitive", "64-bit", "float"]

    def __init__(self, slug: str, title: str, program: str, requirement: str = "CMP-015",
                 matrix: tuple[str, ...] = ("data-types.lint-ulint-lword",), tags: list[str] | None = None,
                 note: str = "", scans: int = 1):
        self.slug = slug
        self.title = title
        self.program = program
        self.requirement = requirement
        self.matrix = list(matrix)
        self.tags = list(tags) if tags is not None else list(self.TAGS)
        self.note = note
        self.scans = scans
        self.decls: list[str] = []
        self.retained: list[str] = []
        self.stmts: list[str] = []
        self.expect: list[dict] = []
        self.warnings: list[tuple[str, int]] = []
        self.warn_on: list[str] = []   # statements that must carry the IMPLICIT_NARROWING warning
        self.fault = False
        self.dword = 0          # next %QD index
        self.nbyte = 0          # next %QB1024+n
        self.nword = 0          # next %QW600+n
        self.bit = 0            # next %QX512.n
        self.extra_top = ""     # functions and types before the program

    # --- inputs and statements
    def var(self, decl: str) -> None:
        self.decls.append(decl)

    def keep(self, decl: str) -> None:
        """A VAR RETAIN declaration."""
        self.retained.append(decl)

    def do(self, stmt: str) -> None:
        self.stmts.append(stmt)

    # --- outputs
    def _addr_wide(self) -> int:
        index = self.dword
        self.dword += 2
        return index

    def out64(self, name: str, st_type: str, expr: str, value: int) -> None:
        index = self._addr_wide()
        self.decls.append(f"{name} AT %QD{index} : {st_type};")
        self.stmts.append(f"{name} := {expr};")
        bits = u64(value)
        self.expect.append({"at": f"%QD{index}", "type": "UDINT", "value": bits & 0xFFFFFFFF})
        self.expect.append({"at": f"%QD{index + 1}", "type": "UDINT", "value": bits >> 32})

    def outd(self, name: str, expr: str, value: float) -> None:
        """An LREAL output: two cells with the IEEE 754 pattern of `value` (a float, or an int pattern for NaN)."""
        bits = value if isinstance(value, int) else dbits(value)
        self.out64(name, "LREAL", expr, bits)

    def outb(self, name: str, expr: str, truth: bool) -> None:
        byte, bit = divmod(self.bit, 8)
        self.bit += 1
        self.decls.append(f"{name} AT %QX{512 + byte}.{bit} : BOOL;")
        self.stmts.append(f"{name} := {expr};")
        self.expect.append({"at": f"%QX{512 + byte}.{bit}", "type": "BOOL", "value": bool(truth)})

    def outdint(self, name: str, st_type: str, expr: str, value: int, cell: str | None = None) -> None:
        """A 32-bit or narrower integer output; the cell has the width of its type: %QB, %QW or %QD."""
        cell = cell or st_type
        width = {"SINT": "B", "USINT": "B", "BYTE": "B", "INT": "W", "UINT": "W", "WORD": "W"}.get(cell, "D")
        if width == "D":
            address = f"%QD{self.dword}"
            self.dword += 1
        elif width == "B":
            address = f"%QB{1024 + self.nbyte}"
            self.nbyte += 1
        else:
            address = f"%QW{600 + self.nword}"
            self.nword += 1
        self.decls.append(f"{name} AT {address} : {st_type};")
        self.stmts.append(f"{name} := {expr};")
        self.expect.append({"at": address, "type": cell, "value": value})

    def outreal(self, name: str, expr: str, value: float) -> None:
        index = self.dword
        self.dword += 1
        self.decls.append(f"{name} AT %QD{index} : REAL;")
        self.stmts.append(f"{name} := {expr};")
        self.expect.append({"at": f"%QD{index}", "type": "REAL", "value": f32(value)})

    # --- files
    def source(self) -> str:
        lines = []
        if self.extra_top:
            lines.append(self.extra_top.rstrip("\n"))
            lines.append("")
        lines.append(f"PROGRAM {self.program}")
        lines.append("VAR")
        lines += [f"  {d}" for d in self.decls]
        lines.append("END_VAR")
        if self.retained:
            lines.append("VAR RETAIN")
            lines += [f"  {d}" for d in self.retained]
            lines.append("END_VAR")
        lines += [f"  {s}" for s in self.stmts]
        lines.append("END_PROGRAM")
        return "\n".join(lines) + "\n"

    def expectation(self) -> dict:
        doc: dict = {
            "requirement": self.requirement,
            "title": self.title,
            "matrix": self.matrix,
            "tags": self.tags,
            "scans": self.scans,
            "scanMs": 10,
        }
        if self.note:
            doc["note"] = self.note
        if self.fault:
            doc["fault"] = True
        else:
            doc["expect"] = self.expect
        if self.warnings:
            doc["warnings"] = [{"code": code, "line": line} for code, line in self.warnings]
        # key order of the committed cases: requirement, title, matrix, tags, note, scans, scanMs, expect
        order = ["requirement", "title", "matrix", "tags", "note", "scans", "scanMs", "fault", "expect", "warnings"]
        return {k: doc[k] for k in order if k in doc}


CASES: list[Case] = []


def case(*args, **kwargs) -> Case:
    c = Case(*args, **kwargs)
    CASES.append(c)
    return c


# ----------------------------------------------------------------------------- LINT
c = case("lint-multiplication-wraps-at-64-bits", "LINT multiplication is the low 64 bits of the product", "Product",
         note="Two's complement multiplication modulo 2^64 (CMP-015, CMP-016): the product of two LINT is the low 64 bits.")
vals = {"a": 3, "b": 4, "c": 4294967295, "d": -3, "e": 4294967296, "f": INT_MAX, "g": INT_MIN, "h": -1, "i": 123456789012, "j": 987}
for k, v in vals.items():
    c.var(f"{k} : LINT := {st_int(v)};")
c.out64("p1", "LINT", "a * b", s64(vals["a"] * vals["b"]))
c.out64("p2", "LINT", "c * c", s64(vals["c"] * vals["c"]))
c.out64("p3", "LINT", "d * b", s64(vals["d"] * vals["b"]))
c.out64("p4", "LINT", "e * e", s64(vals["e"] * vals["e"]))
c.out64("p5", "LINT", "f * 2", s64(vals["f"] * 2))
c.out64("p6", "LINT", "g * h", s64(vals["g"] * vals["h"]))
c.out64("p7", "LINT", "i * j", s64(vals["i"] * vals["j"]))
c.out64("p8", "LINT", "-e * e", s64(-vals["e"] * vals["e"]))

c = case("ulint-multiplication-is-unsigned", "ULINT multiplication gives the unsigned 64-bit product", "UnsignedProduct",
         note="The low 64 bits of the product are the same pattern for signed and unsigned operands; the result is read as unsigned.")
c.var("big : ULINT := 18446744073709551615;")
c.var("half : ULINT := 9223372036854775808;")
c.var("t : ULINT := 3;")
c.var("w : LWORD := 16#0123456789ABCDEF;")
c.out64("p1", "ULINT", "big * big", (M64 * M64) & M64)
c.out64("p2", "ULINT", "half * t", (1 << 63) * 3 & M64)
c.out64("p3", "LWORD", "w * 16#10", (0x0123456789ABCDEF * 16) & M64)
c.out64("p4", "ULINT", "half * 2", 0)

c = case("lint-division-truncates-toward-zero", "LINT division and MOD follow the sign of the dividend", "Quotients",
         requirement="CMP-016", note="IEC 61131-3 division truncates toward zero; MOD takes the sign of the dividend; MIN / -1 wraps to MIN and MIN MOD -1 is 0 (CMP-016).")
nums = {"p7": 7, "m7": -7, "p2": 2, "m2": -2, "p3": 3, "m3": -3, "big": 1000000000000, "seven": 7, "min": INT_MIN, "m1": -1, "max": INT_MAX}
for k, v in nums.items():
    c.var(f"{k} : LINT := {st_int(v)};")
def tdiv(a, b):
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q
def tmod(a, b):
    return a - b * tdiv(a, b)
c.out64("q1", "LINT", "p7 / p2", tdiv(7, 2))
c.out64("q2", "LINT", "m7 / p2", tdiv(-7, 2))
c.out64("q3", "LINT", "p7 / m2", tdiv(7, -2))
c.out64("q4", "LINT", "m7 / m2", tdiv(-7, -2))
c.out64("q5", "LINT", "big / seven", tdiv(1000000000000, 7))
c.out64("q6", "LINT", "min / m1", INT_MIN)
c.out64("q7", "LINT", "max / m1", -INT_MAX)
c.out64("r1", "LINT", "p7 MOD p3", tmod(7, 3))
c.out64("r2", "LINT", "m7 MOD p3", tmod(-7, 3))
c.out64("r3", "LINT", "p7 MOD m3", tmod(7, -3))
c.out64("r4", "LINT", "big MOD seven", tmod(1000000000000, 7))
c.out64("r5", "LINT", "min MOD m1", 0)
c.out64("r6", "LINT", "m7 MOD m3", tmod(-7, -3))

c = case("ulint-division-above-2-63", "ULINT division and MOD treat the dividend as unsigned", "UnsignedQuotients",
         requirement="CMP-012", matrix=("data-types.lint-ulint-lword",),
         note="Unsigned division: a ULINT above 2^63 is a large positive number, not a negative one (CMP-012, CMP-015).")
c.var("top : ULINT := 18446744073709551615;")
c.var("mid : ULINT := 9223372036854775808;")
c.var("two : ULINT := 2;")
c.var("ten : ULINT := 10;")
c.var("three : ULINT := 3;")
c.var("seven : ULINT := 7;")
c.out64("q1", "ULINT", "top / two", M64 // 2)
c.out64("q2", "ULINT", "mid / three", (1 << 63) // 3)
c.out64("q3", "ULINT", "top / top", 1)
c.out64("q4", "ULINT", "two / top", 0)
c.out64("r1", "ULINT", "top MOD ten", M64 % 10)
c.out64("r2", "ULINT", "mid MOD seven", (1 << 63) % 7)
c.out64("r3", "ULINT", "top MOD mid", M64 % (1 << 63))

for slug, title, decl, expr, requirement in (
    ("lint-division-by-zero-faults", "LINT division by zero ends the scan in a VM fault, as DINT does", "n : LINT := 5; z : LINT;", "n / z", "CMP-016"),
    ("lint-modulo-by-zero-faults", "LINT MOD by zero ends the scan in a VM fault", "n : LINT := 5; z : LINT;", "n MOD z", "CMP-016"),
    ("ulint-division-by-zero-faults", "ULINT division by zero ends the scan in a VM fault", "n : ULINT := 5; z : ULINT;", "n / z", "CMP-016"),
    ("ulint-modulo-by-zero-faults", "ULINT MOD by zero ends the scan in a VM fault", "n : ULINT := 5; z : ULINT;", "n MOD z", "CMP-016"),
):
    c = case(slug, title, "ByZero", requirement=requirement, tags=["arch-sensitive", "64-bit", "division"],
             note="Division and modulo by zero fault on every width and platform (CMP-016).")
    for part in decl.split("; "):
        c.var(part if part.endswith(";") else part + ";")
    c.var("r AT %QD0 : " + decl.split(":")[1].split(":=")[0].strip().rstrip(";") + ";")
    c.do(f"r := {expr};")
    c.fault = True

c = case("lint-mixed-width-arithmetic", "A DINT, a LINT and a literal in one expression are computed in 64 bits", "Mixed",
         note="The wider operand decides the width of an operation (CMP-015); a DINT operand is sign-extended, a UDINT zero-extended.")
c.var("small : DINT := -2147483648;")
c.var("unsigned : UDINT := 4294967295;")
c.var("wide : LINT := 1000000;")
c.out64("s1", "LINT", "wide * small", s64(1000000 * -2147483648))
c.out64("s2", "LINT", "wide + unsigned", s64(1000000 + 4294967295))
c.out64("s3", "LINT", "small - wide", s64(-2147483648 - 1000000))
c.out64("s4", "LINT", "wide * 4000000000", s64(1000000 * 4000000000))
c.out64("s5", "LINT", "wide / small", tdiv(1000000, -2147483648))
c.outb("gt", "wide > small", True)
c.outb("ge_unsigned", "wide * 5000 >= unsigned", True)

c = case("lint-abs-and-negate", "ABS and unary minus on LINT", "AbsNeg",
         note="ABS of INT64_MIN is INT64_MIN and so is its negation: the same defined result as DINT (CMP-016).")
c.var("neg : LINT := -9000000000;")
c.var("min : LINT := -9223372036854775808;")
c.var("pos : LINT := 9000000000;")
c.out64("a1", "LINT", "ABS(neg)", 9000000000)
c.out64("a2", "LINT", "ABS(min)", INT_MIN)
c.out64("a3", "LINT", "ABS(pos)", 9000000000)
c.out64("n1", "LINT", "-neg", 9000000000)
c.out64("n2", "LINT", "-min", INT_MIN)
c.out64("n3", "LINT", "-pos", -9000000000)

c = case("lword-shifts-and-rotates-use-64-bits", "SHL, SHR, ROL and ROR on an LWORD work on all 64 bits", "Shifts",
         requirement="CMP-014", matrix=("data-types.lint-ulint-lword", "functions.shift-rotate-and-word-logic"),
         tags=["arch-sensitive", "64-bit", "shifts"],
         note="A shift of 64 or more gives 0; a rotation takes its count modulo 64 and keeps every bit (CMP-014, CMP-015).")
c.var("v : LWORD := 16#8000000000000001;")
c.var("w : LWORD := 16#0123456789ABCDEF;")
def rol(x, n): n %= 64; return u64((x << n) | (x >> (64 - n))) if n else x
def ror(x, n): n %= 64; return u64((x >> n) | (x << (64 - n))) if n else x
V, Wv = 0x8000000000000001, 0x0123456789ABCDEF
c.out64("l1", "LWORD", "SHL(v, 1)", u64(V << 1))
c.out64("l2", "LWORD", "SHL(w, 32)", u64(Wv << 32))
c.out64("l3", "LWORD", "SHL(w, 63)", u64(Wv << 63))
c.out64("l4", "LWORD", "SHL(w, 64)", 0)
c.out64("r1", "LWORD", "SHR(v, 1)", V >> 1)
c.out64("r2", "LWORD", "SHR(w, 36)", Wv >> 36)
c.out64("r3", "LWORD", "SHR(v, 63)", 1)
c.out64("r4", "LWORD", "SHR(v, 64)", 0)
c.out64("o1", "LWORD", "ROL(v, 1)", rol(V, 1))
c.out64("o2", "LWORD", "ROL(w, 40)", rol(Wv, 40))
c.out64("o3", "LWORD", "ROL(w, 0)", Wv)
c.out64("o4", "LWORD", "ROL(w, 64)", Wv)
c.out64("p1", "LWORD", "ROR(v, 1)", ror(V, 1))
c.out64("p2", "LWORD", "ROR(w, 12)", ror(Wv, 12))
c.out64("p3", "LWORD", "ROR(w, 65)", ror(Wv, 65))

c = case("lint-compare-signed-and-unsigned-order", "The same 64 bits order differently as LINT and as ULINT", "Order",
         note="LINT compares as two's complement, ULINT and LWORD as unsigned (CMP-012, CMP-015).")
c.var("sl : LINT := -1;")
c.var("su : ULINT := 18446744073709551615;")
c.var("zero : LINT := 0;")
c.var("zu : ULINT := 0;")
c.var("lo : LINT := -9223372036854775808;")
c.var("hi : LINT := 9223372036854775807;")
c.var("w1 : LWORD := 16#8000000000000000;")
c.var("w2 : LWORD := 16#7FFFFFFFFFFFFFFF;")
c.outb("a", "sl < zero", True)
c.outb("b", "su > zu", True)
c.outb("c", "lo < hi", True)
c.outb("d", "lo <= lo", True)
c.outb("e", "hi >= hi", True)
c.outb("f", "w1 > w2", True)
c.outb("g", "w1 = 16#8000000000000000", True)
c.outb("h", "sl <> zero", True)
c.outb("i", "hi > lo", True)
c.outb("j", "su < zu", False)
c.outb("k", "(lo + hi) = -1", True)

c = case("lint-literals-over-the-full-range", "Literals of the full 64-bit range, in decimal, hexadecimal, octal and binary", "Literals",
         requirement="CMP-012", matrix=("data-types.lint-ulint-lword", "literals.decimal-real-exponent-boolean"),
         note="A literal is the number it writes, as long as the type holds it (CMP-012, CMP-018).")
c.var("a : LINT := -9223372036854775808;")
c.var("b : LINT := 9223372036854775807;")
c.var("c : ULINT := 18446744073709551615;")
c.var("d : LWORD := 16#FFFFFFFFFFFFFFFF;")
c.var("e : LWORD := 16#DEADBEEFCAFEBABE;")
c.var("f : LINT := 16#7FFFFFFFFFFFFFFF;")
c.var("g : ULINT := 8#1777777777777777777777;")
c.var("h : LWORD := 2#1000000000000000000000000000000000000000000000000000000000000001;")
c.var("i : LINT := LINT#-9;")
c.var("j : LWORD := LWORD#16#FF00;")
c.var("k : LREAL := LREAL#0.1;")
for name, v in (("a", INT_MIN), ("b", INT_MAX), ("f", INT_MAX)):
    c.out64(f"o_{name}", "LINT", name, v)
c.out64("o_c", "ULINT", "c", M64)
c.out64("o_d", "LWORD", "d", M64)
c.out64("o_e", "LWORD", "e", 0xDEADBEEFCAFEBABE)
c.out64("o_g", "ULINT", "g", M64)
c.out64("o_h", "LWORD", "h", (1 << 63) | 1)
c.out64("o_i", "LINT", "i", -9)
c.out64("o_j", "LWORD", "j", 0xFF00)
c.outd("o_k", "k", 0.1)
c.out64("o_typed", "LINT", "LINT#4294967296 + LINT#1", 4294967297)

# ----------------------------------------------------------------------------- FOR and CASE
c = case("lint-for-counter-crosses-32-bits", "A FOR loop counts a LINT across 2^32", "WideFor",
         requirement="CMP-015", matrix=("data-types.lint-ulint-lword", "statements.for"),
         note="A 64-bit counter is a full two-word variable: start, end, step and the increment are 64-bit (CMP-015).")
c.var("i : LINT;")
c.var("sum : LINT;")
c.var("n : LINT;")
c.var("down : LINT;")
c.do("sum := 0;")
c.do("FOR i := 4294967294 TO 4294967298 DO")
c.do("  sum := sum + i;")
c.do("  n := n + 1;")
c.do("END_FOR;")
c.do("down := 0;")
c.do("FOR i := 4294967298 TO 4294967294 BY -2 DO")
c.do("  down := down + 1;")
c.do("END_FOR;")
c.decls += ["res_sum AT %QD0 : LINT;", "res_n AT %QD2 : LINT;", "res_down AT %QD4 : LINT;", "res_i AT %QD6 : LINT;"]
c.do("res_sum := sum;")
c.do("res_n := n;")
c.do("res_down := down;")
c.do("res_i := i;")
c.dword = 8
exp_sum = sum(range(4294967294, 4294967299))
for index, v in ((0, exp_sum), (2, 5), (4, 3), (6, 4294967292)):
    c.expect.append({"at": f"%QD{index}", "type": "UDINT", "value": u64(v) & 0xFFFFFFFF})
    c.expect.append({"at": f"%QD{index + 1}", "type": "UDINT", "value": u64(v) >> 32})

c = case("ulint-for-counter-up-to-the-top", "A FOR loop with a ULINT counter and a constant step", "TopFor",
         requirement="CMP-015", matrix=("data-types.lint-ulint-lword", "statements.for"), note="The counter is compared as unsigned.")
c.var("k : ULINT;")
c.var("hits : ULINT;")
c.var("res_hits AT %QD0 : ULINT;")
c.var("res_k AT %QD2 : ULINT;")
c.do("FOR k := 18446744073709551610 TO 18446744073709551613 DO")
c.do("  hits := hits + 1;")
c.do("END_FOR;")
c.do("res_hits := hits;")
c.do("res_k := k;")
c.dword = 4
for index, v in ((0, 4), (2, 18446744073709551614)):
    c.expect.append({"at": f"%QD{index}", "type": "UDINT", "value": v & 0xFFFFFFFF})
    c.expect.append({"at": f"%QD{index + 1}", "type": "UDINT", "value": v >> 32})

c = case("lint-case-selector-and-labels", "CASE selects on a LINT with labels beyond 32 bits, ranges and ELSE", "WideCase",
         requirement="CMP-015", matrix=("data-types.lint-ulint-lword", "statements.case"),
         note="The selector and the labels are 64-bit values (CMP-015).")
c.var("sel : LINT;")
c.var("r1 AT %QD0 : DINT;")
c.var("r2 AT %QD1 : DINT;")
c.var("r3 AT %QD2 : DINT;")
c.var("r4 AT %QD3 : DINT;")
c.do("sel := 5000000000;")
c.do("CASE sel OF")
c.do("  1: r1 := 1;")
c.do("  5000000000: r1 := 2;")
c.do("  -5000000000: r1 := 3;")
c.do("ELSE r1 := 9;")
c.do("END_CASE;")
c.do("sel := -5000000000;")
c.do("CASE sel OF")
c.do("  1: r2 := 1;")
c.do("  5000000000: r2 := 2;")
c.do("  -5000000000: r2 := 3;")
c.do("ELSE r2 := 9;")
c.do("END_CASE;")
c.do("sel := 9000000000000000000;")
c.do("CASE sel OF")
c.do("  1..10: r3 := 1;")
c.do("  8000000000000000000..9223372036854775807: r3 := 2;")
c.do("ELSE r3 := 9;")
c.do("END_CASE;")
c.do("sel := 77;")
c.do("CASE sel OF")
c.do("  1..10: r4 := 1;")
c.do("  4294967296: r4 := 2;")
c.do("END_CASE;")
c.do("r4 := r4 + 40;")
for idx, v in enumerate((2, 3, 2, 40)):
    c.expect.append({"at": f"%QD{idx}", "type": "DINT", "value": v})
c.dword = 4

c = case("ulint-case-label-above-2-63", "CASE on a ULINT matches a label above 2^63", "UnsignedCase",
         requirement="CMP-015", matrix=("data-types.lint-ulint-lword", "statements.case"), note="A ULINT label is unsigned.")
c.var("sel : ULINT := 18446744073709551615;")
c.var("r AT %QD0 : DINT;")
c.do("CASE sel OF")
c.do("  0: r := 1;")
c.do("  9223372036854775808..18446744073709551615: r := 2;")
c.do("ELSE r := 3;")
c.do("END_CASE;")
c.expect.append({"at": "%QD0", "type": "DINT", "value": 2})
c.dword = 1

# ----------------------------------------------------------------------------- LREAL
c = case("lreal-addition-subtraction-keep-52-bits", "LREAL + and - give the IEEE 754 double result", "DoubleSum",
         note="IEEE 754 binary64, round to nearest even (CMP-015, CMP-013).", matrix=("data-types.lreal",))
c.var("a : LREAL := 0.1;")
c.var("b : LREAL := 0.2;")
c.var("big : LREAL := 10000000000.0;")
c.var("huge : LREAL := 1.0E16;")
c.var("tiny : LREAL := 1.0E-300;")
c.outd("s1", "a + b", 0.1 + 0.2)
c.outd("s2", "b - a", 0.2 - 0.1)
c.outd("s3", "big + 1.0", 10000000000.0 + 1.0)
c.outd("s4", "huge + 1.0", 1.0e16 + 1.0)
c.outd("s5", "huge + 3.0", 1.0e16 + 3.0)
c.outd("s6", "tiny + huge", 1.0e-300 + 1.0e16)
c.outd("s7", "a - a", 0.0)
c.outd("s8", "-a - b", -0.1 - 0.2)

c = case("lreal-multiplication-and-division", "LREAL * and / give the IEEE 754 double result", "DoubleProduct",
         note="IEEE 754 binary64, round to nearest even; overflow is an infinity and underflow is gradual.", matrix=("data-types.lreal",))
c.var("a : LREAL := 0.1;")
c.var("three : LREAL := 3.0;")
c.var("seven : LREAL := 7.0;")
c.var("max : LREAL := 1.7976931348623157E308;")
c.var("min : LREAL := 2.2250738585072014E-308;")
c.var("two : LREAL := 2.0;")
c.var("neg : LREAL := -1.5;")
c.outd("m1", "a * three", 0.1 * 3.0)
c.outd("m2", "neg * neg", 2.25)
c.outd("m3", "max * two", math.inf)
c.outd("m4", "min / two", 2.2250738585072014e-308 / 2.0)
c.outd("m5", "min / 4503599627370496.0", 2.2250738585072014e-308 / 4503599627370496.0)
c.outd("d1", "1.0 / three", 1.0 / 3.0)
c.outd("d2", "a / seven", 0.1 / 7.0)
c.outd("d3", "max / two", 1.7976931348623157e308 / 2.0)
c.outd("d4", "neg / two", -0.75)

c = case("lreal-division-by-zero-faults", "LREAL division by zero ends the scan in a VM fault, as REAL does", "DoubleByZero",
         requirement="CMP-016", matrix=("data-types.lreal",), tags=["arch-sensitive", "64-bit", "float", "division"],
         note="Division by 0.0 or -0.0 faults whatever the dividend, as DIVF does (CMP-016).")
c.var("n : LREAL := 1.0;")
c.var("z : LREAL;")
c.var("r AT %QD0 : LREAL;")
c.do("r := n / z;")
c.fault = True

c = case("lreal-comparisons-and-nan", "LREAL comparison: ordering, signed zeros, infinities and NaN", "DoubleCompare",
         requirement="CMP-013", matrix=("data-types.lreal",),
         note="IEEE 754: -0.0 equals +0.0, every ordered comparison with a NaN is false and <> is true.")
c.var("one : LREAL := 1.0;")
c.var("two : LREAL := 2.0;")
c.var("nzero : LREAL := -0.0;")
c.var("zero : LREAL := 0.0;")
c.var("max : LREAL := 1.7976931348623157E308;")
c.var("inf : LREAL;")
c.var("nan : LREAL;")
c.var("close : LREAL := 1.0000000000000002;")
c.do("inf := max * 10.0;")
c.do("nan := inf - inf;")
c.outb("lt", "one < two", True)
c.outb("le", "one <= one", True)
c.outb("gt", "two > one", True)
c.outb("ge", "two >= two", True)
c.outb("eq0", "nzero = zero", True)
c.outb("lt0", "nzero < zero", False)
c.outb("ne_close", "one <> close", True)
c.outb("lt_close", "one < close", True)
c.outb("inf_gt", "inf > max", True)
c.outb("neg_inf_lt", "-inf < -max", True)
c.outb("nan_eq", "nan = nan", False)
c.outb("nan_ne", "nan <> nan", True)
c.outb("nan_lt", "nan < one", False)
c.outb("nan_gt", "nan > one", False)
c.outb("nan_le", "one <= nan", False)
c.outb("nan_ge", "nan >= nan", False)
c.outb("inf_eq", "inf = inf", True)

c = case("lreal-nan-and-infinity-propagate", "NaN and infinity propagate through LREAL arithmetic", "DoubleSpecials",
         requirement="CMP-016", matrix=("data-types.lreal",),
         note="Every NaN the VM makes is the quiet NaN 0x7FF8000000000000 (RT-005); an overflow is an infinity.")
c.var("max : LREAL := 1.7976931348623157E308;")
c.var("one : LREAL := 1.0;")
c.var("zero : LREAL := 0.0;")
c.var("inf : LREAL;")
c.var("nan : LREAL;")
c.do("inf := max * 10.0;")
c.do("nan := inf - inf;")
c.outd("i1", "inf", math.inf)
c.outd("i2", "-inf", -math.inf)
c.outd("i3", "inf + one", math.inf)
c.outd("i4", "one / inf", 0.0)
c.outd("i5", "-one / inf", -0.0)
c.outd("n1", "nan", QNAN)
c.outd("n2", "nan + one", QNAN)
c.outd("n3", "zero * inf", QNAN)
c.outd("n4", "inf / inf", QNAN)
c.outd("z1", "-zero", -0.0)

c = case("lreal-literals-with-exponent", "LREAL literals in every notation the language reads", "DoubleLiterals",
         requirement="CMP-013", matrix=("data-types.lreal", "literals.decimal-real-exponent-boolean"),
         note="A real literal is the nearest double of the number it writes.")
c.var("a : LREAL := 1.0E-3;")
c.var("b : LREAL := 1.5E2;")
c.var("c : LREAL := 2.5e-3;")
c.var("d : LREAL := 1.7976931348623157E308;")
c.var("e : LREAL := 4.9E-324;")
c.var("f : LREAL := -123456789.123456789;")
c.var("g : LREAL := 3.141592653589793;")
c.var("h : LREAL := 100;")
c.var("i : LREAL := -7;")
c.var("j : LREAL := 1.0E+10;")
for name, x in (("a", 1.0e-3), ("b", 150.0), ("c", 2.5e-3), ("d", 1.7976931348623157e308), ("e", 4.9e-324),
                ("f", -123456789.123456789), ("g", math.pi), ("h", 100.0), ("i", -7.0), ("j", 1.0e10)):
    c.outd(f"o_{name}", name, x)

c = case("lreal-mixed-with-integers-and-real", "LREAL meets integers and REAL: the narrower side is converted", "DoubleMixed",
         requirement="CMP-015", matrix=("data-types.lreal", "functions.implicit-widening-conversion"),
         note="IEC 61131-3 widens implicitly: an integer or a REAL goes to LREAL, exactly where the value is exact (CMP-015).")
c.var("d : LREAL := 0.5;")
c.var("i : DINT := -3;")
c.var("u : UDINT := 4294967295;")
c.var("l : LINT := 9007199254740993;")
c.var("r : REAL := 0.1;")
c.var("w : ULINT := 18446744073709551615;")
c.outd("m1", "d + i", 0.5 - 3)
c.outd("m2", "d * u", 0.5 * 4294967295)
c.outd("m3", "d + l", 0.5 + float(9007199254740993))
c.outd("m4", "d + r", 0.5 + f32(0.1))
c.outd("m5", "w * 1.0", float(M64))
c.outreal("m6", "r + 1", f32(f32(0.1) + 1.0))
c.outd("m7", "i", -3.0)
c.outd("m8", "u", 4294967295.0)
c.outd("m9", "l", float(9007199254740993))

c = case("lreal-literal-takes-the-type-of-its-context", "A real literal in an LREAL expression is a double", "DoubleContext",
         requirement="CMP-015", matrix=("data-types.lreal",),
         note="A literal without a type prefix takes the type the expression needs; REAL#0.1 is the REAL.")
c.var("x : LREAL := 0.0;")
c.var("half : LREAL := 0.5;")
c.outd("c1", "0.1 + 0.2", 0.1 + 0.2)
c.outd("c2", "x + 0.1", 0.1)
c.outd("c3", "half * 0.1", 0.5 * 0.1)
c.outd("c4", "REAL#0.1 + x", f32(0.1))
c.outd("c5", "LREAL#0.1 * 3", 0.1 * 3)
c.outd("c6", "1.0 / 3.0", 1.0 / 3.0)
c.outd("c7", "-0.5 * 4", -2.0)

c = case("lreal-conversion-functions", "The conversion functions between LREAL, REAL and the integers", "DoubleConversions",
         requirement="CMP-057", matrix=("data-types.lreal", "functions.other-conversions"),
         note="A conversion to an integer rounds to nearest, an exact half to the even integer, and saturates at the limits of the destination; NaN gives 0 (CMP-057).")
c.var("h : LREAL := 2.5;")
c.var("h3 : LREAL := 3.5;")
c.var("n : LREAL := -2.5;")
c.var("big : LREAL := 1.0E30;")
c.var("neg : LREAL := -1.0E30;")
c.var("exact : LREAL := 9007199254740992.0;")
c.var("three : LREAL := 3.9;")
c.var("zero : LREAL := 0.0;")
c.var("nan : LREAL;")
c.var("rbig : REAL := 16777216.0;")
c.do("nan := (1.0E308 * 10.0) - (1.0E308 * 10.0);")
c.outdint("d1", "DINT", "LREAL_TO_DINT(h)", 2)
c.outdint("d2", "DINT", "LREAL_TO_DINT(h3)", 4)
c.outdint("d3", "DINT", "LREAL_TO_DINT(n)", -2)
c.outdint("d4", "DINT", "LREAL_TO_DINT(big)", 2147483647)
c.outdint("d5", "DINT", "LREAL_TO_DINT(neg)", -2147483648)
c.outdint("d6", "DINT", "LREAL_TO_DINT(nan)", 0)
c.outdint("d7", "DINT", "LREAL_TO_DINT(three)", 4)
c.outdint("u1", "UDINT", "LREAL_TO_UDINT(big)", 4294967295)
c.outdint("u2", "UDINT", "LREAL_TO_UDINT(n)", 0)
c.outdint("u3", "UDINT", "LREAL_TO_UDINT(3000000000.4)", 3000000000)
c.outdint("s1", "SINT", "LREAL_TO_SINT(300.0)", 127)
c.out64("l1", "LINT", "LREAL_TO_LINT(exact)", 9007199254740992)
c.out64("l2", "LINT", "LREAL_TO_LINT(neg)", INT_MIN)
c.out64("l3", "LINT", "LREAL_TO_LINT(big)", INT_MAX)
c.out64("l4", "LINT", "LREAL_TO_LINT(n)", -2)
c.out64("l5", "ULINT", "LREAL_TO_ULINT(big)", M64)
c.out64("l6", "ULINT", "LREAL_TO_ULINT(n)", 0)
c.out64("l7", "ULINT", "LREAL_TO_ULINT(18446744073709549568.0)", 18446744073709549568)
c.outreal("f1", "LREAL_TO_REAL(0.1)", f32(0.1))
c.outd("e1", "REAL_TO_LREAL(rbig)", 16777216.0)
c.outd("e2", "LINT_TO_LREAL(-9007199254740993)", float(-9007199254740993))
c.outd("e3", "ULINT_TO_LREAL(18446744073709551615)", float(M64))
c.outd("e4", "DINT_TO_LREAL(-5)", -5.0)
c.outd("e5", "UDINT_TO_LREAL(4294967295)", 4294967295.0)
c.outd("e6", "LWORD_TO_LREAL(16#8000000000000000)", float(1 << 63))
c.outb("b1", "LREAL_TO_BOOL(zero)", False)
c.outb("b2", "LREAL_TO_BOOL(h)", True)
c.outb("b3", "LREAL_TO_BOOL(nan)", True)


def round_to_f32(v: int) -> float:
    """The integer v rounded once to the nearest binary32, ties to even (exact integer arithmetic)."""
    sign = -1 if v < 0 else 1
    v = abs(v)
    n = v.bit_length()
    if n <= 24:
        return float(sign * v)
    drop = n - 24
    q, r = divmod(v, 1 << drop)
    half = 1 << (drop - 1)
    if r > half or (r == half and (q & 1)):
        q += 1
    return sign * q * (2.0 ** drop)


c.outreal("f2", f"LINT_TO_REAL({(1 << 60) + (1 << 36) + 1})", round_to_f32((1 << 60) + (1 << 36) + 1))
c.outreal("f3", "ULINT_TO_REAL(18446744073709551615)", round_to_f32(M64))

c = case("lreal-abs-sqrt-limit-select", "ABS, SQRT, MAX, MIN, LIMIT, SEL and MUX on LREAL and LINT", "DoubleFunctions",
         requirement="CMP-015", matrix=("data-types.lreal", "functions.basic-conversions"),
         note="SQRT of an LREAL is the correctly rounded root, and 0.0 for 0.0 and below as it is for a REAL.")
c.var("a : LREAL := -2.0;")
c.var("two : LREAL := 2.0;")
c.var("neg : LREAL := -4.0;")
c.var("tiny : LREAL := 1.0E-310;")
c.var("lo : LREAL := -1.5;")
c.var("hi : LREAL := 1.5;")
c.var("x : LREAL := 7.25;")
c.var("la : LINT := -5000000000;")
c.var("lb : LINT := 6000000000;")
c.var("sel : BOOL := TRUE;")
c.var("k : DINT := 2;")
c.outd("f1", "ABS(a)", 2.0)
c.outd("f2", "SQRT(two)", math.sqrt(2.0))
c.outd("f3", "SQRT(neg)", 0.0)
c.outd("f4", "SQRT(tiny)", math.sqrt(1.0e-310))
c.outd("f5", "MAX(a, two)", 2.0)
c.outd("f6", "MIN(a, two)", -2.0)
c.outd("f7", "LIMIT(lo, x, hi)", 1.5)
c.outd("f8", "LIMIT(lo, -9.0, hi)", -1.5)
c.outd("f9", "LIMIT(lo, 0.25, hi)", 0.25)
c.outd("f10", "SEL(sel, a, two)", 2.0)
c.outd("f11", "MUX(k, a, two, x)", 7.25)
c.out64("g1", "LINT", "MAX(la, lb)", 6000000000)
c.out64("g2", "LINT", "MIN(la, lb)", -5000000000)
c.out64("g3", "LINT", "LIMIT(-1000000000000, la, 1000000000000)", -5000000000)
c.out64("g4", "LINT", "LIMIT(0, la, lb)", 0)
c.out64("g5", "LINT", "SEL(sel, la, lb)", 6000000000)
c.out64("g6", "LINT", "MUX(0, la, lb)", -5000000000)

c = case("lreal-trunc-and-round", "TRUNC and ROUND on LREAL are exact", "DoubleRounding",
         requirement="CMP-057", matrix=("data-types.lreal", "functions.basic-conversions"),
         note="TRUNC goes toward zero; ROUND takes an exact half away from zero and is exact where adding 0.5 would not be.")
c.var("a : LREAL := 2.7;")
c.var("b : LREAL := -2.7;")
c.var("h : LREAL := 2.5;")
c.var("nh : LREAL := -2.5;")
c.var("almost : LREAL := 0.49999999999999994;")
c.var("edge : LREAL := 4503599627370495.5;")
c.var("huge : LREAL := 1.0E300;")
c.var("small : LREAL := 0.3;")
c.outd("t1", "TRUNC(a)", 2.0)
c.outd("t2", "TRUNC(b)", -2.0)
c.outd("t3", "TRUNC(huge)", 1.0e300)
c.outd("t4", "TRUNC(small)", 0.0)
c.outd("r1", "ROUND(h)", 3.0)
c.outd("r2", "ROUND(nh)", -3.0)
c.outd("r3", "ROUND(almost)", 0.0)
c.outd("r4", "ROUND(edge)", 4503599627370496.0)
c.outd("r5", "ROUND(a)", 3.0)
c.outd("r6", "ROUND(huge)", 1.0e300)

c = case("lreal-transcendental-functions-compute-in-real", "SIN, COS, EXP, LN, ATAN of an LREAL are LREAL results of REAL accuracy", "DoubleLibrary",
         requirement="CMP-015", matrix=("data-types.lreal",), tags=["arch-sensitive", "64-bit", "float", "float-conversion"],
         note="The transcendental functions round an LREAL argument to REAL, compute in REAL and widen back: the result is an LREAL with about seven significant digits (documented in the standard-library reference).")
c.var("x : LREAL := 0.5;")
c.var("ten : LREAL := 10.0;")
c.var("e1 : LREAL := 1.0;")
c.var("tol : LREAL := 0.00001;")
c.outb("sin_ok", "ABS(SIN(x) - " + st_real(math.sin(0.5)) + ") < tol", True)
c.outb("cos_ok", "ABS(COS(x) - " + st_real(math.cos(0.5)) + ") < tol", True)
c.outb("exp_ok", "ABS(EXP(e1) - " + st_real(math.e) + ") < tol", True)
c.outb("ln_ok", "ABS(LN(ten) - " + st_real(math.log(10.0)) + ") < tol", True)
c.outb("atan_ok", "ABS(ATAN(x) - " + st_real(math.atan(0.5)) + ") < tol", True)
c.outb("sqrt_ok", "SQRT(ten) = " + st_real(math.sqrt(10.0)), True)

# ----------------------------------------------------------------------------- places and calls
c = case("lreal-and-lint-in-arrays-structures-and-calls", "LREAL and LINT in an array, a structure and through function calls", "WidePlaces",
         requirement="CMP-015", matrix=("data-types.lreal", "data-types.lint-ulint-lword", "data-types.arrays-bounds-and-element-types"),
         note="A two-cell value is stored at its declared width in an array element and a structure member, and travels through a FUNCTION parameter and result as two cells.")
c.extra_top = """TYPE Sample :
STRUCT
  weight : LREAL;
  count : LINT;
  flag : BOOL;
END_STRUCT
END_TYPE

FUNCTION Lerp : LREAL
VAR_INPUT
  a : LREAL;
  b : LREAL;
  t : LREAL;
END_VAR
  Lerp := a + (b - a) * t;
END_FUNCTION

FUNCTION Scale : LINT
VAR_INPUT
  base : LINT;
  factor : ULINT;
END_VAR
  Scale := base * factor;
END_FUNCTION"""
c.var("values : ARRAY[0..3] OF LREAL := [0.5, 0.25, 0.125, 0.0625];")
c.var("counts : ARRAY[1..3] OF LINT := [10000000000, -20000000000, 30000000000];")
c.var("s : Sample;")
c.var("sum : LREAL;")
c.var("total : LINT;")
c.var("i : DINT;")
c.do("sum := 0.0;")
c.do("total := 0;")
c.do("FOR i := 0 TO 3 DO")
c.do("  sum := sum + values[i];")
c.do("END_FOR;")
c.do("FOR i := 1 TO 3 DO")
c.do("  total := total + counts[i];")
c.do("END_FOR;")
c.do("s.weight := 0.1;")
c.do("s.count := 5000000000;")
c.do("s.flag := TRUE;")
c.do("s.weight := s.weight + 0.2;")
c.do("s.count := s.count * 3;")
c.outd("o_sum", "sum", 0.5 + 0.25 + 0.125 + 0.0625)
c.out64("o_total", "LINT", "total", 20000000000)
c.outd("o_weight", "s.weight", 0.1 + 0.2)
c.out64("o_count", "LINT", "s.count", 15000000000)
c.outb("o_flag", "s.flag", True)
c.outd("o_lerp", "Lerp(1.0, 2.0, 0.1)", 1.0 + (2.0 - 1.0) * 0.1)
c.outd("o_lerp2", "Lerp(values[0], values[3], 0.5)", 0.5 + (0.0625 - 0.5) * 0.5)
c.out64("o_scale", "LINT", "Scale(-3000000000, 4)", -12000000000)

c = case("lreal-keeps-its-value-between-scans", "An LREAL and a LINT accumulate over scans, and a retained LREAL is initialised once", "Accumulate",
         requirement="CMP-015", matrix=("data-types.lreal", "data-types.lint-ulint-lword"), scans=4,
         note="A program variable keeps its value from one scan to the next; a RETAIN variable takes its declared value only when the retentive memory holds no saved state (CMP-029).")
c.var("acc : LREAL;")
c.var("n : LINT := 4294967295;")
c.keep("kept : LREAL := 100.25;")
c.do("acc := acc + 0.1;")
c.do("n := n + 1;")
c.do("kept := kept * 2.0;")
c.outd("o_acc", "acc", ((0.0 + 0.1) + 0.1 + 0.1) + 0.1)
c.out64("o_n", "LINT", "n", 4294967295 + 4)
c.outd("o_kept", "kept", 100.25 * 16)

c = case("lreal-narrowed-to-real-is-reported", "An LREAL assigned to a REAL builds with the IMPLICIT_NARROWING warning and is rounded", "Narrowing",
         requirement="CMP-005", matrix=("data-types.lreal", "functions.implicit-widening-conversion"),
         note="IEC 61131-3 widens implicitly only; the narrowing is not refused (the bundled projects use it) but reported, as the integer narrowing is (CMP-005, CMP-016).")
c.var("d : LREAL := 0.1;")
c.var("big : LREAL := 1.0E300;")
c.var("r AT %QD0 : REAL;")
c.var("s AT %QD1 : REAL;")
c.do("r := d;")
c.do("s := big;")
c.dword = 2
c.expect.append({"at": "%QD0", "type": "REAL", "value": f32(0.1)})
# 1.0E300 rounds to an infinity as a REAL; the runner reads finite REAL cells only: read the bit pattern as UDINT
c.stmts.pop()
c.decls.pop()
c.do("s := d * 2.0;")
c.decls.append("s AT %QD1 : REAL;")
c.expect.append({"at": "%QD1", "type": "REAL", "value": f32(0.2)})
c.warn_on = ["r := d;", "s := d * 2.0;"]

c = case("lint-and-lword-bit-access", "A bit of a LINT or an LWORD above bit 31 is read and written", "WideBits",
         requirement="CMP-032", matrix=("data-types.lint-ulint-lword",),
         note="Bit access works on the declared width: bits 0 to 63 of a 64-bit type (CMP-032).")
c.var("w : LWORD := 16#0000000100000000;")
c.var("l : LINT;")
c.outb("b32", "w.32", True)
c.outb("b31", "w.31", False)
c.do("l := 0;")
c.do("l.63 := TRUE;")
c.do("l.0 := TRUE;")
c.do("w.63 := TRUE;")
c.do("w.32 := FALSE;")
c.out64("o_l", "LINT", "l", INT_MIN | 1)
c.out64("o_w", "LWORD", "w", 1 << 63)

c = case("integer-width-conversion-functions", "The conversion functions between the 64-bit and the narrower integers", "WidthConversions",
         requirement="CMP-057", matrix=("data-types.lint-ulint-lword", "functions.other-conversions"),
         note="A conversion to a narrower integer keeps the low bits; to a wider one it keeps the value (a sign word or a zero word); to BOOL it tests both words (CMP-057).")
c.outdint("n1", "DINT", "LINT_TO_DINT(5000000000)", 705032704)
c.outdint("n2", "UDINT", "ULINT_TO_UDINT(18446744073709551615)", 4294967295)
c.outdint("n3", "INT", "LINT_TO_INT(-4294967297)", -1)
c.outdint("n4", "BYTE", "LWORD_TO_BYTE(16#1234567890ABCDEF)", 0xEF)
c.out64("w1", "LINT", "DINT_TO_LINT(-1)", -1)
c.out64("w2", "LINT", "UDINT_TO_LINT(4294967295)", 4294967295)
c.out64("w3", "ULINT", "DINT_TO_ULINT(-1)", M64)
c.out64("w4", "LWORD", "BYTE_TO_LWORD(200)", 200)
c.out64("w5", "ULINT", "LINT_TO_ULINT(-1)", M64)
c.out64("w6", "LINT", "ULINT_TO_LINT(18446744073709551615)", -1)
c.outb("b1", "LINT_TO_BOOL(0)", False)
c.outb("b2", "LINT_TO_BOOL(4294967296)", True)
c.outb("b3", "LWORD_TO_BOOL(16#8000000000000000)", True)
c.outd("r1", "LINT_TO_LREAL(-1)", -1.0)


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale: list[str] = []
    for item in CASES:
        name = f"cmp-015-{item.slug}"
        source = item.source()
        if item.warn_on:
            # the narrowing warning points at the line of each narrowing assignment
            lines = source.split("\n")
            item.warnings = [("IMPLICIT_NARROWING", number + 1) for number, line in enumerate(lines) if line.strip() in item.warn_on]
        text = json.dumps(item.expectation(), indent=2) + "\n"
        for suffix, body in ((".st", source), (".expect.json", text)):
            path = OUT / (name + suffix)
            if check:
                if not path.exists() or path.read_text() != body:
                    stale.append(str(path.relative_to(ROOT)))
            else:
                path.write_text(body)
    if check:
        for path in stale:
            print(f"stale: {path}", file=sys.stderr)
        return 1 if stale else 0
    print(f"wrote {len(CASES)} cases to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
