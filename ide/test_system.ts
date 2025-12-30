/**
 * Test script for ZPLC System Library v1.2
 *
 * Tests the system-level functions and FBs:
 * - Functions: UPTIME, CYCLE_TIME, WATCHDOG_RESET
 * - FBs: FIFO, LIFO
 *
 * Run with: bun run test_system.ts
 */

import { compileST, getAllFBNames, getAllFnNames } from './src/compiler/index.ts';
import { assemble } from './src/assembler/index.ts';

// Test programs using system functions
const TEST_PROGRAMS: { name: string; code: string; showAsm?: boolean }[] = [
    // ==========================================================================
    // SYSTEM FUNCTIONS
    // ==========================================================================
    {
        name: 'UPTIME - Get system uptime',
        code: `
PROGRAM UptimeTest
VAR
    ms : DINT;
    seconds : DINT;
END_VAR

    ms := UPTIME();
    seconds := ms / 1000;

END_PROGRAM
`
    },
    {
        name: 'CYCLE_TIME - Get last cycle time',
        code: `
PROGRAM CycleTimeTest
VAR
    cycle_us : DINT;
    is_slow : BOOL;
END_VAR

    cycle_us := CYCLE_TIME();
    is_slow := cycle_us > 10000;  // > 10ms

END_PROGRAM
`
    },
    {
        name: 'WATCHDOG_RESET - Reset watchdog',
        code: `
PROGRAM WatchdogTest
VAR
    counter : DINT;
END_VAR

    counter := counter + 1;
    WATCHDOG_RESET();

END_PROGRAM
`
    },

    // ==========================================================================
    // FIFO BUFFER
    // ==========================================================================
    {
        name: 'FIFO - Basic push/pop test',
        code: `
PROGRAM FifoTest
VAR
    buffer : FIFO;
    push_trigger : BOOL;
    pop_trigger : BOOL;
    input_val : DINT;
    output_val : DINT;
    is_empty : BOOL;
    is_full : BOOL;
    count : DINT;
END_VAR

    input_val := 42;
    push_trigger := TRUE;

    buffer(
        PUSH := push_trigger,
        POP := pop_trigger,
        RST := FALSE,
        DATA_IN := input_val,
        SIZE := 8
    );

    output_val := buffer.DATA_OUT;
    is_empty := buffer.EMPTY;
    is_full := buffer.FULL;
    count := buffer.COUNT;

END_PROGRAM
`,
        showAsm: true
    },

    // ==========================================================================
    // LIFO BUFFER (Stack)
    // ==========================================================================
    {
        name: 'LIFO - Basic push/pop test',
        code: `
PROGRAM LifoTest
VAR
    stack : LIFO;
    push_trigger : BOOL;
    pop_trigger : BOOL;
    input_val : DINT;
    output_val : DINT;
    is_empty : BOOL;
    count : DINT;
END_VAR

    input_val := 100;
    push_trigger := TRUE;

    stack(
        PUSH := push_trigger,
        POP := pop_trigger,
        RST := FALSE,
        DATA_IN := input_val,
        SIZE := 16
    );

    output_val := stack.DATA_OUT;
    is_empty := stack.EMPTY;
    count := stack.COUNT;

END_PROGRAM
`
    },

    // ==========================================================================
    // COMBINED TEST
    // ==========================================================================
    {
        name: 'System diagnostics - Combined test',
        code: `
PROGRAM SystemDiagnostics
VAR
    uptime_ms : DINT;
    uptime_seconds : DINT;
    uptime_minutes : DINT;
    cycle_time_us : DINT;
    slow_cycle_count : DINT;
    is_slow : BOOL;
END_VAR

    // Get uptime
    uptime_ms := UPTIME();
    uptime_seconds := uptime_ms / 1000;
    uptime_minutes := uptime_seconds / 60;

    // Check cycle time
    cycle_time_us := CYCLE_TIME();
    is_slow := cycle_time_us > 5000;  // > 5ms threshold

    IF is_slow THEN
        slow_cycle_count := slow_cycle_count + 1;
    END_IF;

    // Reset watchdog
    WATCHDOG_RESET();

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
const DIM = '\x1b[2m';

function runTests(): void {
    console.log(`${CYAN}========================================${RESET}`);
    console.log(`${CYAN}  ZPLC System Library v1.2 Tests${RESET}`);
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

// List system components in registry
function listSystemComponents(): void {
    const allFBs = getAllFBNames();
    const allFns = getAllFnNames();

    const systemFBs = ['FIFO', 'LIFO'];
    const systemFns = ['UPTIME', 'CYCLE_TIME', 'WATCHDOG_RESET'];

    console.log(`\n${CYAN}System Function Blocks:${RESET}`);
    for (const fb of systemFBs) {
        const status = allFBs.includes(fb) ? `${GREEN}[OK]${RESET}` : `${RED}[MISSING]${RESET}`;
        console.log(`  ${status} ${fb}`);
    }

    console.log(`\n${CYAN}System Functions:${RESET}`);
    for (const fn of systemFns) {
        const status = allFns.includes(fn) ? `${GREEN}[OK]${RESET}` : `${RED}[MISSING]${RESET}`;
        console.log(`  ${status} ${fn}`);
    }
    console.log('');
}

// Main
listSystemComponents();
runTests();
