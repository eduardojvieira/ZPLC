# Compiler and runtime support for the course gaps of L7

The course review (`.cache/claude-ux-review/lessons-check/README.md`, finding L7) lists what the course does not teach yet: TP, CTD, CTUD, a user FUNCTION, WHILE, REPEAT, bit and word operations and VAR_GLOBAL; FOR, ARRAY and STRUCT in one lesson each; RETAIN and STRING in one each; REAL first used in lesson 77. The owner's brief (logbook L278, 2026-11-23) asks that, before a lesson is proposed for one of them, the compiler and the runtime are shown to support it, and that a construct they do not support is reported as a compiler gap instead of a lesson.

This page is that check, made on 2026-11-24 on `feat/course-l7-tools` (from `feat/plant-simulation` 9bc50c48).

## Method

For each construct and each language where it exists, a probe is the smallest program that uses it and a scenario that checks what it does. The probe is run the way a lesson's Check runs a learner's program: a lesson-shaped workspace (`zplc.json` with one cyclic 10 ms task, the program in `src/`, the scenario in `tests/`) given to `scenarioRun` of the Tool API, which compiles it with the repository compiler and runs the scenario on a fresh native POSIX session.

A plain lesson scenario reads and writes only BOOL inputs and outputs (`%IX`, `%QX`), so each probe turns the value under test into a BOOL output, such as `AndW := Sel AND ((VAndW AND WORD#16#FF) = WORD#16#34)`; each check has one value before the input `Sel` turns TRUE at 50 ms and the other after it, so a check that is always TRUE or always FALSE fails. Timers and counters are checked over time: TP keeps its pulse for PT after a short IN and ends it while a long IN is still TRUE; CTD loads PV and reaches Q after three counts; CTUD reaches QU after two counts up, QD after two down, and QD again after R.

The probes are one test file, `packages/zplc-ide/src/learn/l7Support.test.ts`, beside the lesson Check tests. They are not conformance cases (`conformance/`): a conformance case states the value the IEC standard requires, runs the VM through the loader with cells at direct addresses, and a known defect is listed in `tools/ci/expected-failures.json`, so the suite expects it to fail. The question here is a different one, whether a lesson can teach the construct today, and it is answered by the path a lesson's Check takes. A probe for a gap expects the diagnostic the build gives, so the suite stays green while the gap is open and the test fails the day the gap closes, which is the day to write the lesson.

Evidence level: host, native POSIX runtime (`zplc_runtime` built from `firmware/lib/zplc_core`), virtual clock of the scenario. Not a target, not HIL.

## Matrix

"Teach" means a lesson can teach it: the probe compiles and its scenario passes. "Gap" means a compiler gap: the build refuses the probe, with the diagnostic quoted. "—" means the construct is not a block or an instruction of that language (a statement, a declaration or a type of Structured Text); an SFC action body is Structured Text, so what Structured Text supports works there.

| Construct                               | ST        | LD      | FBD     | IL        | SFC                 |
| --------------------------------------- | --------- | ------- | ------- | --------- | ------------------- |
| TP                                      | Teach     | Teach   | Teach   | Teach     | Teach               |
| CTD                                     | Teach     | Teach   | Teach   | Teach     | Teach               |
| CTUD                                    | Teach     | Teach   | Teach   | Teach     | Teach               |
| User FUNCTION                           | Teach     | Gap (1) | Teach   | Gap (2)   | Teach               |
| WHILE                                   | Teach     | —       | —       | —         | — (ST in an action) |
| REPEAT                                  | Teach     | —       | —       | —         | — (ST in an action) |
| AND, OR, XOR, NOT on BYTE, WORD, DWORD  | Teach     | Gap (3) | Teach   | Teach (4) | Teach               |
| SHL, SHR, ROL, ROR on BYTE, WORD, DWORD | Teach     | Gap (3) | Gap (5) | Gap (6)   | Teach               |
| VAR_GLOBAL                              | Teach     | —       | —       | —         | —                   |
| FOR                                     | Teach     | —       | —       | —         | — (ST in an action) |
| ARRAY                                   | Teach     | —       | —       | —         | —                   |
| STRUCT                                  | Teach     | —       | —       | —         | —                   |
| RETAIN                                  | Teach (7) | —       | —       | —         | —                   |
| STRING                                  | Teach     | —       | —       | —         | —                   |
| REAL                                    | Teach     | —       | —       | —         | —                   |

1. **LD, user FUNCTION.** `Function 'e0_1' names the unknown function 'Triple'`. A Ladder function box holds only the functions of its own table (GT, GE, EQ, NE, LE, LT, ADD, SUB, MUL, DIV, MOD, MOVE, LIMIT, MIN, MAX; `src/models/ldSupport.ts`), and a function of the project cannot be placed as a function block either (`ldToSTValidation.ts`: "A project function is not placeable"). A user FUNCTION_BLOCK can be placed (conformance case LNG-008). The reference page `docs/docs/reference/language-ld.md` says "User function blocks and functions in LD and FBD: Works", which is true of FBD only.
2. **IL, user FUNCTION.** `IL Parse error at 11:5: Unknown mnemonic 'Triple'`: IL has no call of a function by its name (the IEC form `LD V` / `Triple` / `ST R`); it calls function blocks only (CAL, CALC, CALCN).
3. **LD, word logic.** `Function 'e0_1' names the unknown function 'AND'`: AND, OR, XOR and NOT on words are operators, not functions, so no box places them. Contacts give AND, OR and NOT on BOOL only. Since LNG-030 a box calls SHL, SHR, ROL and ROR.
4. **IL, word logic.** Works with an untyped hexadecimal literal (`AND 16#FF`). The IL lexer does not read a typed literal: `WORD#16#1234` gives `IL Lexer error at 4:25: Unexpected character: #`, in a declaration as in an operand.
5. **FBD, shifts.** `FBD block 'op0' (SHL): this block type is not supported by the FBD transpiler`, and the same for SHR, ROL and ROR. The block catalogue lists them under Bitwise, and the FBD palette hides them because the transpiler does not translate them (`src/editors/fbd/palette.ts`), so a learner cannot place one. The FBD model gives a block it does not know one input port, IN (`getDefaultPorts` in `src/models/fbd.ts`), so a SHL block cannot even have N wired; the probe declares both ports to reach the transpiler.
6. **IL, shifts.** `IL Parse error at 6:5: Unknown mnemonic 'SHL'`. The conformance matrix agrees (`conformance/matrix.json`, row `il.typed-accumulator-function-calls-and-shifts`, status "missing"), but the reference page `docs/docs/reference/language-il.md` says "Works" for that row.
7. **RETAIN.** It compiles, the compiler places the variable in the retentive region (`region` `RETAIN` in the debug map, test `RETAIN in ST: the compiler places a RETAIN variable in the retentive region`), and inside one run it behaves as any variable. What RETAIN is for, keeping the value across a restart, cannot be checked by a lesson: a scenario has no restart event. A lesson can teach the declaration and where it goes, and its Check cannot grade retention. That is a gap of the scenario format, not of the compiler. The project skill `.agents/skills/zplc-plc-programmer/SKILL.md` still says "Source `RETAIN` is unsupported", which CMP-029 and this probe contradict.

Every ST probe also checks the less obvious half of its construct: REPEAT runs its body once when UNTIL is already true; FOR runs a negative step (10 TO 1 BY -3 is four turns); the shifts and rotations keep the width of their type (ROL of BYTE 16#81 is 16#03, SHL of WORD 16#4001 by 2 is 16#0004, ROR of DWORD 1 is 16#80000000); NOT of a BYTE is a BYTE (16#5A, not 16#FFFFFF5A); the global is declared in its own file, written by the program and read by a function block through VAR_EXTERNAL; STRING checks CONCAT, LEN, LEFT, FIND and `=`; REAL checks INT_TO_REAL, REAL_TO_INT, a band comparison and an exact binary fraction.

## Evidence

Each cell is one test of `packages/zplc-ide/src/learn/l7Support.test.ts`, named `<construct> in <language>: a lesson can teach it` or `<construct> in <language>: a gap, the run shows it`; the constructs are named `TP`, `CTD`, `CTUD`, `user FUNCTION`, `WHILE`, `REPEAT`, `AND, OR, XOR, NOT on BYTE, WORD, DWORD`, `SHL, SHR, ROL, ROR`, `VAR_GLOBAL`, `FOR`, `ARRAY`, `STRUCT`, `RETAIN`, `STRING`, `REAL`. 40 tests (39 probes and the RETAIN placement), 40 pass on 2026-11-24 in 3.5 s.

A probe is not a test of nothing: with a wrong expectation (TP held TRUE at 350 ms, ROL of BYTE 16#81 expected 16#02) all seven probes concerned failed.

## Other findings of the probe runs

- **LD reserves the names of library blocks.** A Ladder output named `Pulse` is refused: `outputs variable name 'Pulse' is not a safe identifier`, and the coil then `must reference a declared variable`. The LD validator treats every token type of the Structured Text lexer as a keyword (`src/transpiler/ldToSTValidation.ts`, `ST_KEYWORDS`), and the lexer has a token for PULSE, a library block; the compiler does not reserve library block names (CMP-033), and the same name works in ST. The probes use `Lamp`.
- **LD refuses an initial value for a BYTE local**: `local variable 'VAndB' initialValue is unsupported for BYTE`.

## What a lesson can teach now

All of L7 can be taught in Structured Text, and SFC actions can use all of it. In the graphical languages and IL: TP, CTD and CTUD everywhere; a user FUNCTION in FBD and SFC, not in LD or IL; word logic in FBD, IL and SFC, not in LD; shifts and rotations in ST and SFC only. RETAIN can be taught, but not graded by Check. The gaps (1) to (6) are compiler gaps and are reported here, not fixed.
