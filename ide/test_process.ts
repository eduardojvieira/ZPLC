/**
 * Test script for ZPLC Process Library (ZPLC_Process)
 *
 * Tests the new process control functions:
 * - Scaling: NORM_X, SCALE_X
 * - Control: PID_Compact, HYSTERESIS, DEADBAND
 * - Signal Processing: LAG_FILTER, RAMP_REAL, INTEGRAL, DERIVATIVE
 *
 * Run with: bun run test_process.ts
 */

import { compileST, getAllFBNames, getAllFnNames } from './src/compiler/index.ts';
import { assemble } from './src/assembler/index.ts';

// Test programs using process control blocks
const TEST_PROGRAMS: { name: string; code: string }[] = [
    // =========================================================================
    // Scaling Functions
    // =========================================================================
    {
        name: 'NORM_X - Normalize 0-100 to 0.0-1.0',
        code: `
PROGRAM NormTest
VAR
    raw_value : REAL;
    normalized : REAL;
END_VAR

    raw_value := 50.0;
    normalized := NORM_X(0.0, raw_value, 100.0);

END_PROGRAM
`
    },
    {
        name: 'SCALE_X - Scale 0.0-1.0 to 4-20mA',
        code: `
PROGRAM ScaleTest
VAR
    normalized : REAL;
    milliamps : REAL;
END_VAR

    normalized := 0.5;
    milliamps := SCALE_X(4.0, normalized, 20.0);

END_PROGRAM
`
    },

    // =========================================================================
    // Control Blocks
    // =========================================================================
    {
        name: 'HYSTERESIS - Temperature control',
        code: `
PROGRAM HystTest
VAR
    hyst1 : HYSTERESIS;
    temperature : REAL;
    heater_on : BOOL;
END_VAR

    temperature := 22.5;
    hyst1(IN := temperature, HIGH := 25.0, LOW := 20.0);
    heater_on := hyst1.Q;

END_PROGRAM
`
    },
    {
        name: 'DEADBAND - Noise suppression',
        code: `
PROGRAM DeadbandTest
VAR
    db1 : DEADBAND;
    sensor_reading : REAL;
    filtered_value : REAL;
END_VAR

    sensor_reading := 100.5;
    db1(IN := sensor_reading, WIDTH := 1.0);
    filtered_value := db1.OUT;

END_PROGRAM
`
    },

    // =========================================================================
    // Signal Processing
    // =========================================================================
    {
        name: 'LAG_FILTER - First-order low-pass',
        code: `
PROGRAM LagTest
VAR
    filter1 : LAG_FILTER;
    input_signal : REAL;
    smoothed : REAL;
END_VAR

    input_signal := 100.0;
    filter1(IN := input_signal, GAIN := 0.1);
    smoothed := filter1.OUT;

END_PROGRAM
`
    },
    {
        name: 'RAMP_REAL - Rate limiter',
        code: `
PROGRAM RampTest
VAR
    ramp1 : RAMP_REAL;
    setpoint : REAL;
    ramped_output : REAL;
END_VAR

    setpoint := 100.0;
    ramp1(IN := setpoint, RATE := 1.0);
    ramped_output := ramp1.OUT;

END_PROGRAM
`
    },
    {
        name: 'INTEGRAL - Accumulator',
        code: `
PROGRAM IntegralTest
VAR
    int1 : INTEGRAL;
    flow_rate : REAL;
    total_volume : REAL;
    do_reset : BOOL;
END_VAR

    flow_rate := 10.0;
    do_reset := FALSE;
    int1(IN := flow_rate, DT := 0.01, RESET := do_reset);
    total_volume := int1.OUT;

END_PROGRAM
`
    },
    {
        name: 'DERIVATIVE - Rate of change',
        code: `
PROGRAM DerivTest
VAR
    deriv1 : DERIVATIVE;
    position : REAL;
    velocity : REAL;
END_VAR

    position := 50.0;
    deriv1(IN := position, DT := 0.01);
    velocity := deriv1.OUT;

END_PROGRAM
`
    },

    // =========================================================================
    // PID Controller
    // =========================================================================
    {
        name: 'PID_Compact - Temperature controller',
        code: `
PROGRAM PIDTest
VAR
    pid1 : PID_Compact;
    setpoint : REAL;
    process_var : REAL;
    control_output : REAL;
END_VAR

    setpoint := 100.0;
    process_var := 95.0;
    
    pid1(
        SP := setpoint,
        PV := process_var,
        KP := 2.0,
        KI := 0.5,
        KD := 0.1,
        DT := 0.1,
        OUT_MIN := 0.0,
        OUT_MAX := 100.0
    );
    
    control_output := pid1.OUT;

END_PROGRAM
`
    },

    // =========================================================================
    // Combined Example
    // =========================================================================
    {
        name: 'Combined: Scale + PID + Ramp',
        code: `
PROGRAM CombinedTest
VAR
    (* Input scaling *)
    raw_sensor : REAL;
    scaled_pv : REAL;
    
    (* PID controller *)
    controller : PID_Compact;
    setpoint : REAL;
    
    (* Output ramping *)
    output_ramp : RAMP_REAL;
    final_output : REAL;
END_VAR

    (* Scale raw 0-4095 ADC to 0-100% *)
    raw_sensor := 2048.0;
    scaled_pv := SCALE_X(0.0, NORM_X(0.0, raw_sensor, 4095.0), 100.0);
    
    (* Run PID *)
    setpoint := 75.0;
    controller(
        SP := setpoint,
        PV := scaled_pv,
        KP := 1.0,
        KI := 0.1,
        KD := 0.05,
        DT := 0.1,
        OUT_MIN := 0.0,
        OUT_MAX := 100.0
    );
    
    (* Ramp the output *)
    output_ramp(IN := controller.OUT, RATE := 5.0);
    final_output := output_ramp.OUT;

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
    console.log(`${CYAN}  ZPLC Process Library Tests${RESET}`);
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

            // Optionally show generated assembly for debugging
            if (process.argv.includes('--verbose')) {
                console.log(`${DIM}${asm}${RESET}`);
            }

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

// List process-related components
function listProcessComponents(): void {
    const fbNames = getAllFBNames();
    const fnNames = getAllFnNames();
    
    const processFBs = ['HYSTERESIS', 'DEADBAND', 'LAG_FILTER', 'RAMP_REAL', 'INTEGRAL', 'DERIVATIVE', 'PID_Compact'];
    const processFns = ['NORM_X', 'SCALE_X'];
    
    console.log(`\n${CYAN}Process Control Function Blocks:${RESET}`);
    console.log(`  ${processFBs.filter(fb => fbNames.includes(fb)).join(', ')}`);

    console.log(`\n${CYAN}Process Control Functions:${RESET}`);
    console.log(`  ${processFns.filter(fn => fnNames.includes(fn)).join(', ')}`);
    console.log('');
}

// Main
listProcessComponents();
runTests();
