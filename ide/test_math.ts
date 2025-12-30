/**
 * Test script for ZPLC Math Library v1.2
 *
 * Tests the extended math functions:
 * - Rounding: TRUNC, ROUND
 * - Trigonometry: SIN, COS, TAN
 * - Inverse Trig: ASIN, ACOS, ATAN, ATAN2
 * - Logarithmic: LN, LOG, EXP
 *
 * These functions use Taylor series / polynomial approximations
 * implemented as inline bytecode generation.
 *
 * Run with: bun run test_math.ts
 */

import { compileST, getAllFnNames } from './src/compiler/index.ts';
import { assemble } from './src/assembler/index.ts';

// Test programs using math functions
const TEST_PROGRAMS: { name: string; code: string; showAsm?: boolean }[] = [
    // ==========================================================================
    // ROUNDING FUNCTIONS
    // ==========================================================================
    {
        name: 'TRUNC - Truncate to integer',
        code: `
PROGRAM TruncTest
VAR
    x : REAL;
    result : REAL;
END_VAR

    x := 3.7;
    result := TRUNC(x);  // Expected: 3.0

END_PROGRAM
`
    },
    {
        name: 'ROUND - Round to nearest integer',
        code: `
PROGRAM RoundTest
VAR
    x1 : REAL;
    x2 : REAL;
    r1 : REAL;
    r2 : REAL;
END_VAR

    x1 := 3.4;
    x2 := 3.6;
    r1 := ROUND(x1);  // Expected: 3.0
    r2 := ROUND(x2);  // Expected: 4.0

END_PROGRAM
`
    },

    // ==========================================================================
    // TRIGONOMETRY FUNCTIONS
    // ==========================================================================
    {
        name: 'SIN - Sine function',
        code: `
PROGRAM SinTest
VAR
    angle : REAL;
    result : REAL;
    pi : REAL;
    half_pi : REAL;
END_VAR

    pi := 3.14159265;
    half_pi := 1.57079633;

    // sin(0) = 0
    angle := 0.0;
    result := SIN(angle);

    // sin(pi/2) = 1
    angle := half_pi;
    result := SIN(angle);

    // sin(pi) = 0
    angle := pi;
    result := SIN(angle);

END_PROGRAM
`
    },
    {
        name: 'COS - Cosine function',
        code: `
PROGRAM CosTest
VAR
    angle : REAL;
    result : REAL;
    pi : REAL;
    half_pi : REAL;
END_VAR

    pi := 3.14159265;
    half_pi := 1.57079633;

    // cos(0) = 1
    angle := 0.0;
    result := COS(angle);

    // cos(pi/2) = 0
    angle := half_pi;
    result := COS(angle);

    // cos(pi) = -1
    angle := pi;
    result := COS(angle);

END_PROGRAM
`
    },
    {
        name: 'TAN - Tangent function',
        code: `
PROGRAM TanTest
VAR
    angle : REAL;
    result : REAL;
END_VAR

    // tan(0) = 0
    angle := 0.0;
    result := TAN(angle);

    // tan(pi/4) = 1
    angle := 0.785398163;
    result := TAN(angle);

END_PROGRAM
`
    },

    // ==========================================================================
    // INVERSE TRIGONOMETRY
    // ==========================================================================
    {
        name: 'ASIN - Arc sine',
        code: `
PROGRAM AsinTest
VAR
    x : REAL;
    result : REAL;
END_VAR

    // asin(0) = 0
    x := 0.0;
    result := ASIN(x);

    // asin(1) = pi/2 = 1.5708
    x := 1.0;
    result := ASIN(x);

    // asin(0.5) = pi/6 = 0.5236
    x := 0.5;
    result := ASIN(x);

END_PROGRAM
`
    },
    {
        name: 'ACOS - Arc cosine',
        code: `
PROGRAM AcosTest
VAR
    x : REAL;
    result : REAL;
END_VAR

    // acos(1) = 0
    x := 1.0;
    result := ACOS(x);

    // acos(0) = pi/2 = 1.5708
    x := 0.0;
    result := ACOS(x);

    // acos(-1) = pi = 3.1416
    x := -1.0;
    result := ACOS(x);

END_PROGRAM
`
    },
    {
        name: 'ATAN - Arc tangent',
        code: `
PROGRAM AtanTest
VAR
    x : REAL;
    result : REAL;
END_VAR

    // atan(0) = 0
    x := 0.0;
    result := ATAN(x);

    // atan(1) = pi/4 = 0.7854
    x := 1.0;
    result := ATAN(x);

END_PROGRAM
`
    },
    {
        name: 'ATAN2 - Two-argument arc tangent',
        code: `
PROGRAM Atan2Test
VAR
    y : REAL;
    x : REAL;
    result : REAL;
END_VAR

    // atan2(0, 1) = 0 (pointing right)
    y := 0.0;
    x := 1.0;
    result := ATAN2(y, x);

    // atan2(1, 0) = pi/2 (pointing up)
    y := 1.0;
    x := 0.0;
    result := ATAN2(y, x);

    // atan2(1, 1) = pi/4 (45 degrees)
    y := 1.0;
    x := 1.0;
    result := ATAN2(y, x);

END_PROGRAM
`
    },

    // ==========================================================================
    // LOGARITHMIC / EXPONENTIAL
    // ==========================================================================
    {
        name: 'LN - Natural logarithm',
        code: `
PROGRAM LnTest
VAR
    x : REAL;
    result : REAL;
    e : REAL;
END_VAR

    e := 2.71828183;

    // ln(1) = 0
    x := 1.0;
    result := LN(x);

    // ln(e) = 1
    x := e;
    result := LN(x);

    // ln(e^2) = 2
    x := 7.389056;
    result := LN(x);

END_PROGRAM
`
    },
    {
        name: 'LOG - Base-10 logarithm',
        code: `
PROGRAM LogTest
VAR
    x : REAL;
    result : REAL;
END_VAR

    // log(1) = 0
    x := 1.0;
    result := LOG(x);

    // log(10) = 1
    x := 10.0;
    result := LOG(x);

    // log(100) = 2
    x := 100.0;
    result := LOG(x);

END_PROGRAM
`
    },
    {
        name: 'EXP - Exponential (e^x)',
        code: `
PROGRAM ExpTest
VAR
    x : REAL;
    result : REAL;
END_VAR

    // exp(0) = 1
    x := 0.0;
    result := EXP(x);

    // exp(1) = e = 2.718
    x := 1.0;
    result := EXP(x);

    // exp(2) = e^2 = 7.389
    x := 2.0;
    result := EXP(x);

END_PROGRAM
`
    },

    // ==========================================================================
    // COMBINED TESTS
    // ==========================================================================
    {
        name: 'Pythagorean Identity: sin^2(x) + cos^2(x) = 1',
        code: `
PROGRAM PythagoreanTest
VAR
    angle : REAL;
    sin_val : REAL;
    cos_val : REAL;
    sin_sq : REAL;
    cos_sq : REAL;
    sum : REAL;
END_VAR

    angle := 0.5;  // Some arbitrary angle

    sin_val := SIN(angle);
    cos_val := COS(angle);

    sin_sq := sin_val * sin_val;
    cos_sq := cos_val * cos_val;

    sum := sin_sq + cos_sq;  // Should be very close to 1.0

END_PROGRAM
`
    },
    {
        name: 'Inverse identity: sin(asin(x)) = x',
        code: `
PROGRAM InverseIdentityTest
VAR
    x : REAL;
    asin_x : REAL;
    result : REAL;
END_VAR

    x := 0.5;

    asin_x := ASIN(x);
    result := SIN(asin_x);  // Should be 0.5

END_PROGRAM
`
    },
    {
        name: 'Log-Exp identity: exp(ln(x)) = x',
        code: `
PROGRAM LogExpIdentityTest
VAR
    x : REAL;
    ln_x : REAL;
    result : REAL;
END_VAR

    x := 5.0;

    ln_x := LN(x);
    result := EXP(ln_x);  // Should be 5.0

END_PROGRAM
`
    },
    {
        name: 'Scaling functions: NORM_X and SCALE_X',
        code: `
PROGRAM ScalingTest
VAR
    raw_value : REAL;
    normalized : REAL;
    scaled : REAL;
END_VAR

    // Normalize: 50 in range [0, 100] -> 0.5
    raw_value := 50.0;
    normalized := NORM_X(raw_value, 0.0, 100.0);

    // Scale: 0.5 to range [0, 1000] -> 500
    scaled := SCALE_X(normalized, 0.0, 1000.0);

END_PROGRAM
`
    },

    // ==========================================================================
    // DETAIL VIEW - Show generated assembly
    // ==========================================================================
    {
        name: 'SIN Implementation Detail',
        code: `
PROGRAM SinDetail
VAR
    x : REAL;
    y : REAL;
END_VAR

    x := 1.0;
    y := SIN(x);

END_PROGRAM
`,
        showAsm: true
    },
];

// Colors for terminal output
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function runTests(): void {
    console.log(`${CYAN}========================================${RESET}`);
    console.log(`${CYAN}  ZPLC Math Library v1.2 Tests${RESET}`);
    console.log(`${CYAN}========================================${RESET}\n`);

    let passed = 0;
    let failed = 0;

    for (const test of TEST_PROGRAMS) {
        process.stdout.write(`Testing ${YELLOW}${test.name}${RESET}... `);

        try {
            // Compile ST to assembly
            const asm = compileST(test.code);

            // Show assembly if requested
            if (test.showAsm) {
                console.log(`\n${DIM}--- Generated Assembly ---${RESET}`);
                const lines = asm.split('\n');
                for (const line of lines) {
                    console.log(`${DIM}${line}${RESET}`);
                }
                console.log(`${DIM}--- End Assembly ---${RESET}`);
            }

            // Assemble to bytecode
            const bytecodeResult = assemble(asm);

            // Success!
            const byteSize = bytecodeResult.bytecode?.length ?? 0;
            console.log(`${GREEN}OK${RESET} (${byteSize} bytes)`);
            passed++;

        } catch (error) {
            console.log(`${RED}EXCEPTION${RESET}`);
            console.log(`  ${RED}${error}${RESET}`);
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

// List math functions in registry
function listMathFunctions(): void {
    const allFns = getAllFnNames();
    
    const mathFns = [
        'TRUNC', 'ROUND',
        'SIN', 'COS', 'TAN',
        'ASIN', 'ACOS', 'ATAN', 'ATAN2',
        'LN', 'LOG', 'EXP',
        'SQRT', 'EXPT', 'ABS', 'ABSF',
        'NORM_X', 'SCALE_X'
    ];

    console.log(`\n${CYAN}Math Functions in Registry:${RESET}`);
    for (const fn of mathFns) {
        const status = allFns.includes(fn) ? `${GREEN}[OK]${RESET}` : `${RED}[MISSING]${RESET}`;
        console.log(`  ${status} ${fn}`);
    }
    console.log('');
}

// Main
listMathFunctions();
runTests();
