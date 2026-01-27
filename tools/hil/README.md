# ZPLC Multi-Language HIL Test Suite

This directory contains a comprehensive Hardware-in-the-Loop (HIL) test suite for all IEC 61131-3 languages supported by ZPLC:
- **IL** (Instruction List)
- **LD** (Ladder Diagram)
- **FBD** (Function Block Diagram)
- **SFC** (Sequential Function Chart)
- **ST** (Structured Text) - via legacy tests

## Structure

```
tools/hil/
├── run_all_languages.py    # MAIN RUNNER: Executes all suites
├── language_tester.py      # Common test infrastructure (Compile, Run, Assert, Poke)
│
├── test_il_suite.py        # IL Test Runner
├── il_tests/               # IL Source Files (.il)
│   ├── arithmetic.il
│   ├── comparison.il
│   ├── logic.il
│   └── jumps.il
│
├── test_ld_suite.py        # LD Test Runner
├── ld_tests/               # LD Source Files (.ld.json)
│   ├── basic_coil.ld.json
│   ├── series_contacts.ld.json
│   ├── parallel_contacts.ld.json
│   └── timer_ton.ld.json
│
├── test_fbd_suite.py       # FBD Test Runner
├── fbd_tests/              # FBD Source Files (.fbd.json)
│   ├── not_gate.fbd.json
│   ├── and_gate.fbd.json
│   └── math_ops.fbd.json
│
└── test_sfc_suite.py       # SFC Test Runner
    ├── sfc_tests/          # SFC Source Files (.sfc.json)
    ├── single_step.sfc.json
    └── two_states.sfc.json
```

## How to Run

1. Connect the RP2040 device via USB.
2. Run the main suite:
   ```bash
   python3 tools/hil/run_all_languages.py
   ```

## Test Coverage

| Language | Feature | Status | Test File |
|----------|---------|--------|-----------|
| **IL**   | Arithmetic (ADD,SUB,MUL,DIV,MOD) | ✅ Implemented | `arithmetic.il` |
| **IL**   | Comparison (GT,LT,EQ,NE) | ✅ Implemented | `comparison.il` |
| **IL**   | Logic (AND,OR,XOR,NOT) | ✅ Implemented | `logic.il` |
| **IL**   | Jumps (JMP, JMPC) | ✅ Implemented | `jumps.il` |
| **LD**   | Basic Coil | ✅ Implemented | `basic_coil.ld.json` |
| **LD**   | Series Contacts (AND) | ✅ Implemented | `series_contacts.ld.json` |
| **LD**   | Parallel Contacts (OR) | ✅ Implemented | `parallel_contacts.ld.json` |
| **LD**   | Timer (TON) | ✅ Implemented | `timer_ton.ld.json` |
| **FBD**  | Logic Gates (NOT, AND) | ✅ Implemented | `not_gate`, `and_gate` |
| **FBD**  | Math (ADD) | ✅ Implemented | `math_ops.fbd.json` |
| **SFC**  | Steps & Actions | ✅ Implemented | `single_step.sfc.json` |
| **SFC**  | Time Transitions | ✅ Implemented | `two_states.sfc.json` |

## Troubleshooting

- **Timeout / Frozen**: If `run_all_languages.py` hangs, perform a hard reset on the RP2040.
- **Compilation Errors**: Check `packages/zplc-ide/src/cli/index.ts` logs. The test runner prints CLI output.
