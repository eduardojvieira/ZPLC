/**
 * ZPLC Full Compiler Pipeline Test
 *
 * SPDX-License-Identifier: MIT
 *
 * This test verifies the full compilation pipeline:
 * ST Source Code -> Parser -> AST -> Code Generator -> Assembly -> Assembler -> Bytecode
 *
 * NOTE: Uses only syntax features the current parser supports.
 */

import { compileST } from './src/compiler/index.ts';
import { assembleRaw, disassemble } from './src/assembler/index.ts';
import { getAllFnNames, getAllFBNames } from './src/compiler/stdlib/index.ts';

// ============================================================================
// Test Helpers
// ============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++;
        console.log(`  ✅ ${message}`);
    } else {
        failed++;
        console.error(`  ❌ ${message}`);
    }
}

function testCompile(name: string, stCode: string, expectedOpcodes: string[] = []): void {
    try {
        const assembly = compileST(stCode);
        const bytecode = assembleRaw(assembly);
        const disasm = disassemble(bytecode);

        assert(bytecode.length > 0, `${name}: generates bytecode (${bytecode.length} bytes)`);

        for (const opcode of expectedOpcodes) {
            const found = disasm.includes(opcode);
            assert(found, `${name}: contains ${opcode}`);
        }
    } catch (e) {
        failed++;
        console.error(`  ❌ ${name}: compilation failed - ${e}`);
    }
}

// ============================================================================
// Test 1: Basic Arithmetic Operations
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 1: Arithmetic Operations');
console.log('='.repeat(70));

testCompile('Integer Addition', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
END_VAR
    a := 10;
    b := 20;
    c := a + b;
END_PROGRAM
`, ['ADD']);

testCompile('Integer Subtraction', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
END_VAR
    c := a - b;
END_PROGRAM
`, ['SUB']);

testCompile('Integer Multiplication', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
END_VAR
    c := a * b;
END_PROGRAM
`, ['MUL']);

testCompile('Integer Division', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
END_VAR
    c := a / b;
END_PROGRAM
`, ['DIV']);

testCompile('Integer Modulo', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
END_VAR
    c := a MOD b;
END_PROGRAM
`, ['MOD']);  // MOD is an operator, not a function call

// Float arithmetic now correctly uses ADDF/SUBF/MULF/DIVF via type inference
testCompile('Float Arithmetic', `
PROGRAM Test
VAR
    x : REAL;
    y : REAL;
    z : REAL;
END_VAR
    x := 3.14;
    y := 2.0;
    z := x + y;
END_PROGRAM
`, ['ADDF', 'STORE32']);

testCompile('Float Subtraction', `
PROGRAM Test
VAR
    x : REAL;
    y : REAL;
    z : REAL;
END_VAR
    z := x - y;
END_PROGRAM
`, ['SUBF']);

testCompile('Float Multiplication', `
PROGRAM Test
VAR
    x : REAL;
    y : REAL;
    z : REAL;
END_VAR
    z := x * y;
END_PROGRAM
`, ['MULF']);

testCompile('Float Division', `
PROGRAM Test
VAR
    x : REAL;
    y : REAL;
    z : REAL;
END_VAR
    z := x / y;
END_PROGRAM
`, ['DIVF']);

// Test mixed INT + REAL type promotion
testCompile('Mixed Type Promotion', `
PROGRAM Test
VAR
    intVal : INT;
    realVal : REAL;
    result : REAL;
END_VAR
    result := realVal + intVal;
END_PROGRAM
`, ['ADDF']);  // INT + REAL promotes to float arithmetic

// ============================================================================
// Test 2: Logical Operations
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 2: Logical Operations');
console.log('='.repeat(70));

testCompile('Boolean AND', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
    c : BOOL;
END_VAR
    c := a AND b;
END_PROGRAM
`, ['AND']);

testCompile('Boolean OR', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
    c : BOOL;
END_VAR
    c := a OR b;
END_PROGRAM
`, ['OR']);

testCompile('Boolean XOR', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
    c : BOOL;
END_VAR
    c := a XOR b;
END_PROGRAM
`, ['XOR']);

testCompile('Boolean NOT', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
END_VAR
    b := NOT a;
END_PROGRAM
`, ['NOT']);

testCompile('NAND Function', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
    c : BOOL;
END_VAR
    c := NAND(a, b);
END_PROGRAM
`, ['AND', 'NOT']);

testCompile('NOR Function', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
    c : BOOL;
END_VAR
    c := NOR(a, b);
END_PROGRAM
`, ['OR', 'NOT']);

// ============================================================================
// Test 3: Comparison Operations
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 3: Comparison Operations');
console.log('='.repeat(70));

testCompile('Equal', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : BOOL;
END_VAR
    result := a = b;
END_PROGRAM
`, ['EQ']);

testCompile('Not Equal', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : BOOL;
END_VAR
    result := a <> b;
END_PROGRAM
`, ['NE']);

testCompile('Less Than', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : BOOL;
END_VAR
    result := a < b;
END_PROGRAM
`, ['LT']);

testCompile('Less or Equal', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : BOOL;
END_VAR
    result := a <= b;
END_PROGRAM
`, ['LE']);

testCompile('Greater Than', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : BOOL;
END_VAR
    result := a > b;
END_PROGRAM
`, ['GT']);

testCompile('Greater or Equal', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : BOOL;
END_VAR
    result := a >= b;
END_PROGRAM
`, ['GE']);

// ============================================================================
// Test 4: Control Flow
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 4: Control Flow');
console.log('='.repeat(70));

testCompile('IF Statement', `
PROGRAM Test
VAR
    condition : BOOL;
    x : INT;
END_VAR
    IF condition THEN
        x := 1;
    END_IF;
END_PROGRAM
`, ['JZ']);

testCompile('IF-ELSE Statement', `
PROGRAM Test
VAR
    condition : BOOL;
    x : INT;
END_VAR
    IF condition THEN
        x := 1;
    ELSE
        x := 2;
    END_IF;
END_PROGRAM
`, ['JZ', 'JMP']);

testCompile('Nested IF', `
PROGRAM Test
VAR
    a : BOOL;
    b : BOOL;
    result : INT;
END_VAR
    IF a THEN
        IF b THEN
            result := 1;
        ELSE
            result := 2;
        END_IF;
    ELSE
        result := 3;
    END_IF;
END_PROGRAM
`, ['JZ', 'JMP']);

// ============================================================================
// Test 5: Function Blocks (Timers, Counters, etc.)
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 5: Function Blocks');
console.log('='.repeat(70));

testCompile('TON Timer', `
PROGRAM Test
VAR
    myTimer : TON;
    start : BOOL;
    done : BOOL;
END_VAR
    myTimer(IN := start, PT := T#1000ms);
    done := myTimer.Q;
END_PROGRAM
`, ['LOAD32', 'STORE32', 'GET_TICKS']);

testCompile('TOF Timer', `
PROGRAM Test
VAR
    offTimer : TOF;
    input : BOOL;
END_VAR
    offTimer(IN := input, PT := T#500ms);
END_PROGRAM
`, ['GET_TICKS']);

testCompile('R_TRIG Edge Detection', `
PROGRAM Test
VAR
    trigger : R_TRIG;
    input : BOOL;
    myPulse : BOOL;
END_VAR
    trigger(CLK := input);
    myPulse := trigger.Q;
END_PROGRAM
`, ['AND', 'NOT']);

testCompile('F_TRIG Edge Detection', `
PROGRAM Test
VAR
    trigger : F_TRIG;
    input : BOOL;
    myPulse : BOOL;
END_VAR
    trigger(CLK := input);
    myPulse := trigger.Q;
END_PROGRAM
`, ['AND', 'NOT']);

testCompile('CTU Counter', `
PROGRAM Test
VAR
    counter : CTU;
    countPulse : BOOL;
    reset : BOOL;
    done : BOOL;
END_VAR
    counter(CU := countPulse, RESET := reset, PV := 10);
    done := counter.Q;
END_PROGRAM
`, ['ADD', 'GE']);

testCompile('CTD Counter', `
PROGRAM Test
VAR
    counter : CTD;
    countDown : BOOL;
    load : BOOL;
    empty : BOOL;
END_VAR
    counter(CD := countDown, LOAD := load, PV := 10);
    empty := counter.Q;
END_PROGRAM
`, ['SUB', 'LE']);

testCompile('SR Bistable', `
PROGRAM Test
VAR
    latch : SR;
    setCmd : BOOL;
    resetCmd : BOOL;
    output : BOOL;
END_VAR
    latch(S1 := setCmd, R := resetCmd);
    output := latch.Q1;
END_PROGRAM
`, ['OR', 'AND', 'NOT']);

testCompile('RS Bistable', `
PROGRAM Test
VAR
    latch : RS;
    setCmd : BOOL;
    resetCmd : BOOL;
    output : BOOL;
END_VAR
    latch(S := setCmd, R1 := resetCmd);
    output := latch.Q1;
END_PROGRAM
`, ['OR', 'AND', 'NOT']);

testCompile('BLINK Generator', `
PROGRAM Test
VAR
    blinker : BLINK;
    enable : BOOL;
    myOutput : BOOL;
END_VAR
    blinker(ENABLE := enable, T_ON := T#500ms, T_OFF := T#500ms);
    myOutput := blinker.Q;
END_PROGRAM
`, ['GET_TICKS', 'SUB']);  // BLINK uses phase-based timing, not MOD

// ============================================================================
// Test 6: Selection Functions
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 6: Selection Functions');
console.log('='.repeat(70));

testCompile('MAX Function', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : INT;
END_VAR
    result := MAX(a, b);
END_PROGRAM
`, ['OVER', 'GT', 'DROP']);

testCompile('MIN Function', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    result : INT;
END_VAR
    result := MIN(a, b);
END_PROGRAM
`, ['OVER', 'LT', 'DROP']);

testCompile('LIMIT Function', `
PROGRAM Test
VAR
    value : INT;
    result : INT;
END_VAR
    result := LIMIT(0, value, 100);
END_PROGRAM
`, ['GT', 'SWAP', 'DROP']);

testCompile('SEL Function', `
PROGRAM Test
VAR
    selector : BOOL;
    a : INT;
    b : INT;
    result : INT;
END_VAR
    result := SEL(selector, a, b);
END_PROGRAM
`, ['JNZ', 'JMP']);

// ============================================================================
// Test 7: Math Functions
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 7: Math Functions');
console.log('='.repeat(70));

testCompile('ABS Function', `
PROGRAM Test
VAR
    x : INT;
    result : INT;
END_VAR
    result := ABS(x);
END_PROGRAM
`, ['ABS']);

testCompile('NEG Function', `
PROGRAM Test
VAR
    x : INT;
    result : INT;
END_VAR
    result := NEG(x);
END_PROGRAM
`, ['NEG']);

testCompile('ABSF Function', `
PROGRAM Test
VAR
    x : REAL;
    result : REAL;
END_VAR
    result := ABSF(x);
END_PROGRAM
`, ['ABSF']);

testCompile('NEGF Function', `
PROGRAM Test
VAR
    x : REAL;
    result : REAL;
END_VAR
    result := NEGF(x);
END_PROGRAM
`, ['NEGF']);

// ============================================================================
// Test 8: Bitwise Functions
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 8: Bitwise Functions');
console.log('='.repeat(70));

testCompile('SHL Function', `
PROGRAM Test
VAR
    value : DINT;
    result : DINT;
END_VAR
    result := SHL(value, 4);
END_PROGRAM
`, ['SHL']);

testCompile('SHR Function', `
PROGRAM Test
VAR
    value : DINT;
    result : DINT;
END_VAR
    result := SHR(value, 4);
END_PROGRAM
`, ['SHR']);

testCompile('ROL Function', `
PROGRAM Test
VAR
    value : DINT;
    result : DINT;
END_VAR
    result := ROL(value, 8);
END_PROGRAM
`, ['SHL', 'SHR', 'OR']);

testCompile('ROR Function', `
PROGRAM Test
VAR
    value : DINT;
    result : DINT;
END_VAR
    result := ROR(value, 8);
END_PROGRAM
`, ['SHL', 'SHR', 'OR']);

// ============================================================================
// Test 9: Type Conversion
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 9: Type Conversion');
console.log('='.repeat(70));

testCompile('INT_TO_REAL', `
PROGRAM Test
VAR
    intVal : INT;
    realVal : REAL;
END_VAR
    realVal := INT_TO_REAL(intVal);
END_PROGRAM
`, ['I2F']);

testCompile('REAL_TO_INT', `
PROGRAM Test
VAR
    realVal : REAL;
    intVal : INT;
END_VAR
    intVal := REAL_TO_INT(realVal);
END_PROGRAM
`, ['F2I']);

testCompile('BOOL_TO_INT', `
PROGRAM Test
VAR
    boolVal : BOOL;
    intVal : INT;
END_VAR
    intVal := BOOL_TO_INT(boolVal);
END_PROGRAM
`, ['LOAD8', 'STORE']);

testCompile('INT_TO_BOOL', `
PROGRAM Test
VAR
    intVal : INT;
    boolVal : BOOL;
END_VAR
    boolVal := INT_TO_BOOL(intVal);
END_PROGRAM
`, ['I2B']);

// ============================================================================
// Test 10: System Functions
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 10: System Functions');
console.log('='.repeat(70));

testCompile('UPTIME Function', `
PROGRAM Test
VAR
    uptime : DINT;
END_VAR
    uptime := UPTIME();
END_PROGRAM
`, ['GET_TICKS']);

testCompile('CYCLE_TIME Function', `
PROGRAM Test
VAR
    cycleTime : DINT;
END_VAR
    cycleTime := CYCLE_TIME();
END_PROGRAM
`, ['LOAD32']);  // CYCLE_TIME reads from system register at IPI 0x0FF0

// ============================================================================
// Test 11: Complex Expressions
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 11: Complex Expressions');
console.log('='.repeat(70));

testCompile('Complex Arithmetic', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
    d : INT;
END_VAR
    a := 1;
    b := 2;
    c := 3;
    d := (a + b) * c - a;
END_PROGRAM
`, ['ADD', 'MUL', 'SUB']);

testCompile('Chained Comparisons', `
PROGRAM Test
VAR
    a : INT;
    b : INT;
    c : INT;
    result : BOOL;
END_VAR
    result := (a < b) AND (b < c);
END_PROGRAM
`, ['LT', 'AND']);

testCompile('Mixed Logic', `
PROGRAM Test
VAR
    x : BOOL;
    y : BOOL;
    z : BOOL;
    result : BOOL;
END_VAR
    result := (x AND y) OR (NOT z);
END_PROGRAM
`, ['AND', 'OR', 'NOT']);

// ============================================================================
// Test 12: Memory Operations
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 12: Memory Operations');
console.log('='.repeat(70));

testCompile('8-bit Load/Store', `
PROGRAM Test
VAR
    byteVar : BOOL;
END_VAR
    byteVar := TRUE;
END_PROGRAM
`, ['STORE8']);

testCompile('16-bit Load/Store', `
PROGRAM Test
VAR
    intVar : INT;
END_VAR
    intVar := 1000;
END_PROGRAM
`, ['STORE16']);

testCompile('32-bit Load/Store', `
PROGRAM Test
VAR
    dwordVar : DINT;
END_VAR
    dwordVar := 100000;
END_PROGRAM
`, ['STORE32']);

testCompile('32-bit Float Load/Store', `
PROGRAM Test
VAR
    floatVar : REAL;
END_VAR
    floatVar := 3.14159;
END_PROGRAM
`, ['STORE32']);

// ============================================================================
// Test 13: Stdlib Registry Verification
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('TEST 13: Stdlib Registry');
console.log('='.repeat(70));

const allFunctions = getAllFnNames();
const allFBs = getAllFBNames();

console.log(`  Total registered functions: ${allFunctions.length}`);
console.log(`  Total registered function blocks: ${allFBs.length}`);

// Check key functions exist
const expectedFunctions = [
    // Selection
    'MAX', 'MIN', 'LIMIT', 'SEL', 'MUX',
    // Logic
    'NAND', 'NOR',
    // Math
    'ABS', 'ABSF', 'NEG', 'NEGF', 'MOD', 'SQRT', 'EXPT',
    // Trig
    'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2',
    // Logarithmic
    'LN', 'LOG', 'EXP',
    // Rounding
    'TRUNC', 'ROUND',
    // Bitwise
    'SHL', 'SHR', 'ROL', 'ROR',
    // Type conversion
    'INT_TO_REAL', 'REAL_TO_INT', 'BOOL_TO_INT', 'INT_TO_BOOL',
    // Scaling
    'NORM_X', 'SCALE_X',
    // System
    'UPTIME', 'CYCLE_TIME', 'WATCHDOG_RESET',
    // Strings
    'LEN', 'CONCAT', 'LEFT', 'RIGHT', 'MID', 'FIND', 'INSERT', 'DELETE', 'REPLACE', 'COPY', 'CLEAR', 'STRCMP', 'EQ_STRING', 'NE_STRING',
];

for (const fn of expectedFunctions) {
    assert(allFunctions.includes(fn), `Function ${fn} is registered`);
}

const expectedFBs = [
    // Timers
    'TON', 'TOF', 'TP',
    // Edge detection
    'R_TRIG', 'F_TRIG',
    // Bistables
    'RS', 'SR',
    // Counters
    'CTU', 'CTD', 'CTUD',
    // Generators
    'BLINK', 'PWM', 'PULSE',
    // Process control
    'HYSTERESIS', 'DEADBAND', 'LAG_FILTER', 'RAMP_REAL', 'INTEGRAL', 'DERIVATIVE', 'PID_Compact',
    // System
    'FIFO', 'LIFO',
];

for (const fb of expectedFBs) {
    assert(allFBs.includes(fb), `Function Block ${fb} is registered`);
}

assert(allFunctions.length === 61, `Total functions: 61 (actual: ${allFunctions.length})`);
assert(allFBs.length === 22, `Total function blocks: 22 (actual: ${allFBs.length})`);

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`\n  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  Total:    ${passed + failed}`);

if (failed > 0) {
    console.log('\n  ⚠️  Some tests failed! Check the output above.\n');
    process.exit(1);
} else {
    console.log('\n  🎉 All compiler pipeline tests passed!\n');
    process.exit(0);
}
