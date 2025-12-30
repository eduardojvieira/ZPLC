/**
 * ZPLC Standard Library - Signal Generator Function Blocks
 *
 * SPDX-License-Identifier: MIT
 *
 * Industrial signal generators:
 * - BLINK: Asymmetric pulse generator (configurable ON/OFF times)
 * - PWM: Pulse Width Modulation generator
 *
 * These are essential for industrial applications:
 * - Indicator lamps (blinking patterns)
 * - Motor control (soft start, speed control)
 * - Heater control (duty cycle)
 */

import type { FunctionBlockDef, CodeGenContext, MemberDef } from './types.ts';
import type { FBParameter } from '../ast.ts';
import { inputMember, outputMember, internalMember, formatAddr } from './types.ts';

// ============================================================================
// BLINK - Asymmetric Pulse Generator
// ============================================================================

/**
 * BLINK Memory Layout:
 *   +0:  ENABLE     (BOOL, 1 byte)  - Enable generator
 *   +1:  Q          (BOOL, 1 byte)  - Output pulse
 *   +2:  T_ON       (TIME, 4 bytes) - ON duration (ms)
 *   +6:  T_OFF      (TIME, 4 bytes) - OFF duration (ms)
 *   +10: _start     (TIME, 4 bytes) - Internal: phase start time
 *   +14: _phase     (BOOL, 1 byte)  - Internal: 0=OFF, 1=ON
 *   +15: _padding   (1 byte)
 * Total: 16 bytes (aligned)
 */
const BLINK_MEMBERS: MemberDef[] = [
    inputMember('ENABLE', 1, 0),
    outputMember('Q', 1, 1),
    inputMember('T_ON', 4, 2),
    inputMember('T_OFF', 4, 6),
    internalMember('_start', 4, 10),
    internalMember('_phase', 1, 14),
];

const BLINK_SIZE = 16;

// Offsets
const BLINK_OFF_ENABLE = 0;
const BLINK_OFF_Q = 1;
const BLINK_OFF_T_ON = 2;
const BLINK_OFF_T_OFF = 6;
const BLINK_OFF_START = 10;
const BLINK_OFF_PHASE = 14;

/**
 * BLINK (Asymmetric Pulse Generator):
 *
 * When ENABLE is TRUE, generates a pulse train with:
 * - Q = TRUE for T_ON milliseconds
 * - Q = FALSE for T_OFF milliseconds
 * - Repeats indefinitely
 *
 * When ENABLE is FALSE, Q is immediately FALSE.
 *
 * Timing diagram (T_ON=300, T_OFF=700):
 *   ENABLE: __/¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\____
 *   Q:      __/¯¯¯\______/¯¯¯\______/¯¯¯\___
 *             |300|  700 |300|  700 |
 */
export const BLINK_FB: FunctionBlockDef = {
    name: 'BLINK',
    size: BLINK_SIZE,
    members: BLINK_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const enableAddr = formatAddr(base + BLINK_OFF_ENABLE);
        const qAddr = formatAddr(base + BLINK_OFF_Q);
        const tOnAddr = formatAddr(base + BLINK_OFF_T_ON);
        const tOffAddr = formatAddr(base + BLINK_OFF_T_OFF);
        const startAddr = formatAddr(base + BLINK_OFF_START);
        const phaseAddr = formatAddr(base + BLINK_OFF_PHASE);

        // Set input parameters
        for (const param of params) {
            if (param.name === 'ENABLE') {
                ctx.emit(`    ; Set ${ctx.instanceName}.ENABLE`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${enableAddr}`);
            } else if (param.name === 'T_ON') {
                ctx.emit(`    ; Set ${ctx.instanceName}.T_ON`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${tOnAddr}`);
            } else if (param.name === 'T_OFF') {
                ctx.emit(`    ; Set ${ctx.instanceName}.T_OFF`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${tOffAddr}`);
            }
        }

        // Generate unique labels
        const disabled = ctx.newLabel('blink_disabled');
        const checkPhase = ctx.newLabel('blink_check_phase');
        const inOnPhase = ctx.newLabel('blink_in_on');
        const startOnPhase = ctx.newLabel('blink_start_on');
        const startOffPhase = ctx.newLabel('blink_start_off');
        const blinkEnd = ctx.newLabel('blink_end');

        ctx.emit(`    ; --- BLINK Generator Logic (${ctx.instanceName}) ---`);

        // Check if ENABLE is TRUE
        ctx.emit(`    LOAD8 ${enableAddr}`);
        ctx.emit(`    JZ ${disabled}`);

        // Enabled - check current phase
        ctx.emit(`    LOAD8 ${phaseAddr}`);
        ctx.emit(`    JNZ ${inOnPhase}`);

        // ===== OFF Phase =====
        ctx.emit(`    ; OFF phase - check if time to switch to ON`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);              // elapsed = now - start
        ctx.emit(`    LOAD32 ${tOffAddr}`);
        ctx.emit(`    GE`);               // elapsed >= T_OFF?
        ctx.emit(`    JZ ${blinkEnd}`);   // No, stay in OFF

        // Time to switch to ON phase
        ctx.emit(`${startOnPhase}:`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${phaseAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${blinkEnd}`);

        // ===== ON Phase =====
        ctx.emit(`${inOnPhase}:`);
        ctx.emit(`    ; ON phase - check if time to switch to OFF`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);              // elapsed = now - start
        ctx.emit(`    LOAD32 ${tOnAddr}`);
        ctx.emit(`    GE`);               // elapsed >= T_ON?
        ctx.emit(`    JZ ${blinkEnd}`);   // No, stay in ON

        // Time to switch to OFF phase
        ctx.emit(`${startOffPhase}:`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${phaseAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${blinkEnd}`);

        // ===== Disabled =====
        ctx.emit(`${disabled}:`);
        ctx.emit(`    ; Disabled - reset state`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${phaseAddr}`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);

        ctx.emit(`${blinkEnd}:`);
        ctx.emit(`    ; --- End BLINK ---`);
    },
};

// ============================================================================
// PWM - Pulse Width Modulation Generator
// ============================================================================

/**
 * PWM Memory Layout:
 *   +0:  ENABLE     (BOOL, 1 byte)  - Enable generator
 *   +1:  Q          (BOOL, 1 byte)  - Output pulse
 *   +2:  reserved   (2 bytes)       - Alignment padding
 *   +4:  PERIOD     (TIME, 4 bytes) - Total period (ms)
 *   +8:  DUTY       (REAL, 4 bytes) - Duty cycle (0.0 to 1.0)
 *   +12: _start     (TIME, 4 bytes) - Internal: cycle start time
 * Total: 16 bytes (aligned)
 */
const PWM_MEMBERS: MemberDef[] = [
    inputMember('ENABLE', 1, 0),
    outputMember('Q', 1, 1),
    // +2, +3 padding
    inputMember('PERIOD', 4, 4),
    inputMember('DUTY', 4, 8),
    internalMember('_start', 4, 12),
];

const PWM_SIZE = 16;

// Offsets
const PWM_OFF_ENABLE = 0;
const PWM_OFF_Q = 1;
const PWM_OFF_PERIOD = 4;
const PWM_OFF_DUTY = 8;
const PWM_OFF_START = 12;

/**
 * PWM (Pulse Width Modulation Generator):
 *
 * When ENABLE is TRUE, generates a pulse with:
 * - Period: PERIOD milliseconds
 * - Duty cycle: DUTY (0.0 = always OFF, 1.0 = always ON)
 *
 * Q is TRUE for (PERIOD * DUTY) ms at the start of each cycle.
 *
 * Timing diagram (PERIOD=1000, DUTY=0.3):
 *   Q: /¯¯¯\________/¯¯¯\________/¯¯¯\________
 *      |300|  700   |300|  700   |
 *      |<- 1000 ->| |<- 1000 ->|
 */
export const PWM_FB: FunctionBlockDef = {
    name: 'PWM',
    size: PWM_SIZE,
    members: PWM_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const enableAddr = formatAddr(base + PWM_OFF_ENABLE);
        const qAddr = formatAddr(base + PWM_OFF_Q);
        const periodAddr = formatAddr(base + PWM_OFF_PERIOD);
        const dutyAddr = formatAddr(base + PWM_OFF_DUTY);
        const startAddr = formatAddr(base + PWM_OFF_START);

        // Set input parameters
        for (const param of params) {
            if (param.name === 'ENABLE') {
                ctx.emit(`    ; Set ${ctx.instanceName}.ENABLE`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${enableAddr}`);
            } else if (param.name === 'PERIOD') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PERIOD`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${periodAddr}`);
            } else if (param.name === 'DUTY') {
                ctx.emit(`    ; Set ${ctx.instanceName}.DUTY`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${dutyAddr}`);
            }
        }

        // Generate unique labels
        const disabled = ctx.newLabel('pwm_disabled');
        const checkOutput = ctx.newLabel('pwm_check_output');
        const setOff = ctx.newLabel('pwm_set_off');
        const pwmEnd = ctx.newLabel('pwm_end');

        ctx.emit(`    ; --- PWM Generator Logic (${ctx.instanceName}) ---`);

        // Check if ENABLE is TRUE
        ctx.emit(`    LOAD8 ${enableAddr}`);
        ctx.emit(`    JZ ${disabled}`);

        // Calculate elapsed time in current cycle
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);              // elapsed = now - start
        ctx.emit(`    DUP`);              // keep elapsed for comparison
        
        // Check if we've completed a full period
        ctx.emit(`    LOAD32 ${periodAddr}`);
        ctx.emit(`    GE`);               // elapsed >= PERIOD?
        ctx.emit(`    JZ ${checkOutput}`);
        
        // Start new period
        ctx.emit(`    DROP`);             // discard old elapsed
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH32 0`);         // elapsed = 0 for new cycle
        
        ctx.emit(`${checkOutput}:`);
        // Stack: [elapsed]
        // Calculate ON time: PERIOD * DUTY (as integers)
        // We need: elapsed < (PERIOD * DUTY)
        
        ctx.emit(`    I2F`);              // Convert elapsed to float
        ctx.emit(`    LOAD32 ${periodAddr}`);
        ctx.emit(`    I2F`);              // Convert PERIOD to float
        ctx.emit(`    LOAD32 ${dutyAddr}`); // DUTY is already float
        ctx.emit(`    MULF`);             // PERIOD * DUTY = on_time
        
        // Compare: elapsed < on_time?
        // Stack: [elapsed_f, on_time_f]
        ctx.emit(`    SWAP`);             // [on_time_f, elapsed_f]
        ctx.emit(`    SUBF`);             // on_time - elapsed
        ctx.emit(`    F2I`);              // Convert to integer for comparison
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    GT`);               // (on_time - elapsed) > 0?
        ctx.emit(`    JZ ${setOff}`);
        
        // ON phase
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${pwmEnd}`);
        
        // OFF phase
        ctx.emit(`${setOff}:`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${pwmEnd}`);

        // Disabled
        ctx.emit(`${disabled}:`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);

        ctx.emit(`${pwmEnd}:`);
        ctx.emit(`    ; --- End PWM ---`);
    },
};

// ============================================================================
// PULSE - Single Pulse Generator
// ============================================================================

/**
 * PULSE Memory Layout:
 *   +0:  TRIG       (BOOL, 1 byte)  - Trigger input (rising edge starts pulse)
 *   +1:  Q          (BOOL, 1 byte)  - Output pulse
 *   +2:  PT         (TIME, 4 bytes) - Pulse duration (ms)
 *   +6:  _start     (TIME, 4 bytes) - Internal: pulse start time
 *   +10: _active    (BOOL, 1 byte)  - Internal: pulse in progress
 *   +11: _prev_trig (BOOL, 1 byte)  - Internal: previous trigger state
 * Total: 12 bytes (padded to 16)
 */
const PULSE_MEMBERS: MemberDef[] = [
    inputMember('TRIG', 1, 0),
    outputMember('Q', 1, 1),
    inputMember('PT', 4, 2),
    internalMember('_start', 4, 6),
    internalMember('_active', 1, 10),
    internalMember('_prev_trig', 1, 11),
];

const PULSE_SIZE = 16;

// Offsets
const PULSE_OFF_TRIG = 0;
const PULSE_OFF_Q = 1;
const PULSE_OFF_PT = 2;
const PULSE_OFF_START = 6;
const PULSE_OFF_ACTIVE = 10;
const PULSE_OFF_PREV_TRIG = 11;

/**
 * PULSE (Single Pulse Generator):
 *
 * On rising edge of TRIG, generates exactly one pulse of duration PT.
 * Re-triggering during an active pulse is ignored.
 *
 * Timing diagram:
 *   TRIG: __/¯\___/¯\_______/¯\___
 *   Q:    __/¯¯¯¯¯¯\________/¯¯¯¯¯¯\
 *            |<-PT->|       |<-PT->|
 */
export const PULSE_FB: FunctionBlockDef = {
    name: 'PULSE',
    size: PULSE_SIZE,
    members: PULSE_MEMBERS,

    generateCall(ctx: CodeGenContext, params: FBParameter[]): void {
        const base = ctx.baseAddress;
        const trigAddr = formatAddr(base + PULSE_OFF_TRIG);
        const qAddr = formatAddr(base + PULSE_OFF_Q);
        const ptAddr = formatAddr(base + PULSE_OFF_PT);
        const startAddr = formatAddr(base + PULSE_OFF_START);
        const activeAddr = formatAddr(base + PULSE_OFF_ACTIVE);
        const prevTrigAddr = formatAddr(base + PULSE_OFF_PREV_TRIG);

        // Set input parameters
        for (const param of params) {
            if (param.name === 'TRIG') {
                ctx.emit(`    ; Set ${ctx.instanceName}.TRIG`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE8 ${trigAddr}`);
            } else if (param.name === 'PT') {
                ctx.emit(`    ; Set ${ctx.instanceName}.PT`);
                ctx.emitExpression(param.value);
                ctx.emit(`    STORE32 ${ptAddr}`);
            }
        }

        // Generate unique labels
        const checkActive = ctx.newLabel('pulse_check_active');
        const checkExpired = ctx.newLabel('pulse_check_expired');
        const startPulse = ctx.newLabel('pulse_start');
        const endPulse = ctx.newLabel('pulse_end_pulse');
        const pulseEnd = ctx.newLabel('pulse_end');

        ctx.emit(`    ; --- PULSE Generator Logic (${ctx.instanceName}) ---`);

        // Check if pulse is currently active
        ctx.emit(`    LOAD8 ${activeAddr}`);
        ctx.emit(`    JNZ ${checkExpired}`);

        // Not active - check for rising edge on TRIG
        ctx.emit(`    LOAD8 ${trigAddr}`);
        ctx.emit(`    LOAD8 ${prevTrigAddr}`);
        ctx.emit(`    NOT`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    AND`);              // !prev_trig
        ctx.emit(`    AND`);              // trig && !prev_trig
        ctx.emit(`    JZ ${pulseEnd}`);   // No rising edge

        // Rising edge detected - start pulse
        ctx.emit(`${startPulse}:`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    STORE32 ${startAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${activeAddr}`);
        ctx.emit(`    PUSH8 1`);
        ctx.emit(`    STORE8 ${qAddr}`);
        ctx.emit(`    JMP ${pulseEnd}`);

        // Check if active pulse has expired
        ctx.emit(`${checkExpired}:`);
        ctx.emit(`    GET_TICKS`);
        ctx.emit(`    LOAD32 ${startAddr}`);
        ctx.emit(`    SUB`);              // elapsed
        ctx.emit(`    LOAD32 ${ptAddr}`);
        ctx.emit(`    GE`);               // elapsed >= PT?
        ctx.emit(`    JZ ${pulseEnd}`);   // No, keep pulse active

        // Pulse expired
        ctx.emit(`${endPulse}:`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${activeAddr}`);
        ctx.emit(`    PUSH8 0`);
        ctx.emit(`    STORE8 ${qAddr}`);

        ctx.emit(`${pulseEnd}:`);
        // Update prev_trig
        ctx.emit(`    LOAD8 ${trigAddr}`);
        ctx.emit(`    STORE8 ${prevTrigAddr}`);
        ctx.emit(`    ; --- End PULSE ---`);
    },
};
