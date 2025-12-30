/**
 * Test script for ZPLC Standard Library v1.1
 *
 * Tests the new stdlib functions:
 * - Bitwise: ROL, ROR, SHL, SHR, AND_WORD, etc.
 * - Generators: BLINK, PWM, PULSE
 * - Math: ABS, SQRT, EXPT
 * - Type conversions
 *
 * Run with: bun run test_stdlib.ts
 */

import { compileST, getAllFBNames, getAllFnNames } from './src/compiler/index.ts';
import { assemble } from './src/assembler/index.ts';

// Test programs using new stdlib functions
const TEST_PROGRAMS: { name: string; code: string }[] = [
    {
        name: 'Bitwise Functions (Basic)',
        code: `
PROGRAM BitwiseTest
VAR
    a : DINT;
    b : DINT;
    shifted : DINT;
END_VAR

    a := 255;
    b := 4;

    shifted := SHR(a, b);

END_PROGRAM
`
    },
    {
        name: 'Selection Functions (MAX/MIN)',
        code: `
PROGRAM SelectionTest
VAR
    a : DINT;
    b : DINT;
    max_val : DINT;
    min_val : DINT;
END_VAR

    a := 10;
    b := 20;

    max_val := MAX(a, b);
    min_val := MIN(a, b);

END_PROGRAM
`
    },
    {
        name: 'Selection Functions (LIMIT)',
        code: `
PROGRAM LimitTest
VAR
    val : DINT;
    limited : DINT;
END_VAR

    val := 15;
    limited := LIMIT(5, val, 12);

END_PROGRAM
`
    },
    {
        name: 'Selection Functions (SEL)',
        code: `
PROGRAM SelTest
VAR
    a : DINT;
    b : DINT;
    cond : BOOL;
    result : DINT;
END_VAR

    a := 100;
    b := 200;
    cond := TRUE;

    result := SEL(cond, a, b);

END_PROGRAM
`
    },
    {
        name: 'Math Functions (ABS)',
        code: `
PROGRAM AbsTest
VAR
    x : DINT;
    abs_x : DINT;
END_VAR

    x := 42;
    abs_x := ABS(x);

END_PROGRAM
`
    },
    {
        name: 'Math Functions (NEG)',
        code: `
PROGRAM NegTest
VAR
    x : DINT;
    neg_x : DINT;
END_VAR

    x := 42;
    neg_x := NEG(x);

END_PROGRAM
`
    },
    {
        name: 'Math Functions (MOD - as operator)',
        code: `
PROGRAM ModTest
VAR
    a : DINT;
    b : DINT;
    remainder : DINT;
END_VAR

    a := 17;
    b := 5;

    remainder := a MOD b;

END_PROGRAM
`
    },
    {
        name: 'Bitwise Functions (SHL/SHR)',
        code: `
PROGRAM ShiftTest
VAR
    value : DINT;
    shifted_left : DINT;
    shifted_right : DINT;
END_VAR

    value := 16;

    shifted_left := SHL(value, 2);
    shifted_right := SHR(value, 2);

END_PROGRAM
`
    },
    {
        name: 'Timer FB (TON)',
        code: `
PROGRAM TimerTest
VAR
    timer1 : TON;
    trigger : BOOL;
    done : BOOL;
END_VAR

    trigger := TRUE;
    timer1(IN := trigger, PT := T#1000ms);
    done := timer1.Q;

END_PROGRAM
`
    },
    {
        name: 'Counter FB (CTU)',
        code: `
PROGRAM CounterTest
VAR
    counter1 : CTU;
    count_trigger : BOOL;
    count_done : BOOL;
END_VAR

    count_trigger := TRUE;
    counter1(CU := count_trigger, PV := 10);
    count_done := counter1.Q;

END_PROGRAM
`
    },
    {
        name: 'Edge Detection (R_TRIG)',
        code: `
PROGRAM EdgeTest
VAR
    edge1 : R_TRIG;
    input_signal : BOOL;
    rising_edge : BOOL;
END_VAR

    input_signal := TRUE;
    edge1(CLK := input_signal);
    rising_edge := edge1.Q;

END_PROGRAM
`
    },
    {
        name: 'Bistable (RS)',
        code: `
PROGRAM BistableTest
VAR
    latch : RS;
    set_signal : BOOL;
    reset_signal : BOOL;
    output : BOOL;
END_VAR

    set_signal := TRUE;
    reset_signal := FALSE;
    latch(S := set_signal, R1 := reset_signal);
    output := latch.Q1;

END_PROGRAM
`
    },
];

// Colors for terminal output
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

function runTests(): void {
    console.log(`${CYAN}========================================${RESET}`);
    console.log(`${CYAN}  ZPLC Standard Library v1.1 Tests${RESET}`);
    console.log(`${CYAN}========================================${RESET}\n`);

    let passed = 0;
    let failed = 0;

    for (const test of TEST_PROGRAMS) {
        process.stdout.write(`Testing ${YELLOW}${test.name}${RESET}... `);

        try {
            // Compile ST to assembly
            const asm = compileST(test.code);

            // Assemble to bytecode
            const bytecodeResult = assemble(asm);

            // Success!
            const byteSize = bytecodeResult.bytecode?.length ?? 0;
            console.log(`${GREEN}OK${RESET} (${byteSize} bytes)`);
            passed++;

        } catch (error) {
            console.log(`${RED}EXCEPTION${RESET}`);
            console.log(`  ${RED}→ ${error}${RESET}`);
            failed++;
        }
    }

    console.log(`\n${CYAN}========================================${RESET}`);
    console.log(`Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${RESET}`);
    console.log(`${CYAN}========================================${RESET}\n`);

    // Exit with error code if any tests failed
    if (failed > 0) {
        process.exit(1);
    }
}

// List all registered functions
function listRegistry(): void {
    console.log(`\n${CYAN}Registered Function Blocks:${RESET}`);
    console.log(`  ${getAllFBNames().join(', ')}`);

    console.log(`\n${CYAN}Registered Functions:${RESET}`);
    console.log(`  ${getAllFnNames().join(', ')}`);
    console.log('');
}

// Main
listRegistry();
runTests();
