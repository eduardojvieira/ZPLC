/**
 * ZPLC IL-to-ST Transpiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Converts IEC 61131-3 Instruction List (IL) programs to Structured Text (ST).
 * This enables IL programs to be compiled using the existing ST compiler pipeline.
 *
 * Transpilation Strategy:
 * - IL Current Result (CR) is mapped to internal variables _IL_CR_, _IL_CR_BOOL_, _IL_CR_REAL_
 * - Load operators (LD, LDN) assign values to CR
 * - Store operators (ST, STN, S, R) read from CR and assign to variables
 * - Arithmetic and logical operators modify CR in place
 * - Jump/label support uses a state machine with WHILE/CASE
 * - Parenthesis modifiers create sub-expressions for deferred evaluation
 */

import type { ILProgram, ILInstruction, ILVarBlock, ILOperand, ILFBParam } from './parser';

// =============================================================================
// Types
// =============================================================================

export interface TranspileResult {
    success: boolean;
    source: string;
    errors: string[];
}

// =============================================================================
// Internal Variables
// =============================================================================

// IL Current Result register - holds the accumulator value
const CR_VAR = '_IL_CR_';
const CR_BOOL_VAR = '_IL_CR_BOOL_';
const CR_REAL_VAR = '_IL_CR_REAL_';

// State machine variables for jump support
const STATE_VAR = '_IL_STATE_';
const DONE_VAR = '_IL_DONE_';

// =============================================================================
// IL-to-ST Transpiler
// =============================================================================

export function transpileILToST(program: ILProgram): TranspileResult {
    const errors: string[] = [];
    const lines: string[] = [];

    // Check if we need state machine for jumps
    const hasJumps = program.instructions.some(i =>
        ['JMP', 'JMPC', 'JMPCN'].includes(i.operator)
    );

    // Build label-to-state mapping
    const labelToState = new Map<string, number>();
    if (hasJumps) {
        let stateNum = 0;
        for (const instr of program.instructions) {
            if (instr.label && !labelToState.has(instr.label)) {
                labelToState.set(instr.label, stateNum++);
            }
        }
        // If no labels but we have jumps, that's an error
        if (labelToState.size === 0 && hasJumps) {
            errors.push('IL program has jumps but no labels');
        }
    }

    // Generate program header
    lines.push(`PROGRAM ${program.name}`);

    // Generate variable blocks
    for (const varBlock of program.varBlocks) {
        lines.push(generateVarBlock(varBlock));
    }

    // Add internal CR variables
    lines.push('VAR');
    lines.push(`    ${CR_VAR} : DINT;`);
    lines.push(`    ${CR_BOOL_VAR} : BOOL;`);
    lines.push(`    ${CR_REAL_VAR} : REAL;`);
    if (hasJumps) {
        lines.push(`    ${STATE_VAR} : INT := 0;`);
        lines.push(`    ${DONE_VAR} : BOOL := FALSE;`);
    }
    lines.push('END_VAR');
    lines.push('');

    // Generate instruction body
    if (hasJumps) {
        // State machine approach for jumps
        lines.push(`${DONE_VAR} := FALSE;`);
        lines.push(`WHILE NOT ${DONE_VAR} DO`);
        lines.push(`    CASE ${STATE_VAR} OF`);

        let currentState = 0;
        let stateInstructions: string[] = [];

        for (let i = 0; i < program.instructions.length; i++) {
            const instr = program.instructions[i];

            // Check if this instruction starts a new state (has a label)
            if (instr.label && labelToState.has(instr.label)) {
                // Emit previous state if we have instructions
                if (stateInstructions.length > 0 || currentState === 0) {
                    const nextState = labelToState.get(instr.label)!;
                    if (currentState !== nextState) {
                        stateInstructions.push(`${STATE_VAR} := ${nextState};`);
                    }
                    lines.push(`        ${currentState}:`);
                    for (const stmt of stateInstructions) {
                        lines.push(`            ${stmt}`);
                    }
                    stateInstructions = [];
                }
                currentState = labelToState.get(instr.label)!;
            }

            // Generate instruction
            const stmts = generateInstruction(instr, labelToState, hasJumps);
            stateInstructions.push(...stmts);

            // If this is the last instruction or next has a label, emit state
            const nextInstr = program.instructions[i + 1];
            const needsStateBreak = !nextInstr ||
                (nextInstr.label && labelToState.has(nextInstr.label));

            if (needsStateBreak && stateInstructions.length > 0) {
                lines.push(`        ${currentState}:`);
                for (const stmt of stateInstructions) {
                    lines.push(`            ${stmt}`);
                }
                if (!stateInstructions.some(s => s.includes(STATE_VAR) || s.includes(DONE_VAR))) {
                    // Add transition to next state or done
                    if (nextInstr && nextInstr.label) {
                        const nextState = labelToState.get(nextInstr.label);
                        if (nextState !== undefined) {
                            lines.push(`            ${STATE_VAR} := ${nextState};`);
                        }
                    } else if (!nextInstr) {
                        lines.push(`            ${DONE_VAR} := TRUE;`);
                    }
                }
                stateInstructions = [];
                if (nextInstr && nextInstr.label) {
                    currentState = labelToState.get(nextInstr.label) ?? currentState + 1;
                } else {
                    currentState++;
                }
            }
        }

        // Emit any remaining instructions
        if (stateInstructions.length > 0) {
            lines.push(`        ${currentState}:`);
            for (const stmt of stateInstructions) {
                lines.push(`            ${stmt}`);
            }
            lines.push(`            ${DONE_VAR} := TRUE;`);
        }

        lines.push('    ELSE');
        lines.push(`        ${DONE_VAR} := TRUE;`);
        lines.push('    END_CASE;');
        lines.push('END_WHILE;');
    } else {
        // Simple sequential execution (no jumps)
        for (const instr of program.instructions) {
            const stmts = generateInstruction(instr, labelToState, hasJumps);
            for (const stmt of stmts) {
                lines.push(stmt);
            }
        }
    }

    lines.push('');
    lines.push('END_PROGRAM');

    return {
        success: errors.length === 0,
        source: lines.join('\n'),
        errors,
    };
}

// =============================================================================
// Variable Block Generation
// =============================================================================

function generateVarBlock(block: ILVarBlock): string {
    const lines: string[] = [];
    lines.push(block.section);

    for (const v of block.variables) {
        let decl = `    ${v.name}`;
        if (v.ioAddress) {
            decl += ` AT ${v.ioAddress}`;
        }
        decl += ` : ${v.dataType}`;
        if (v.initialValue) {
            decl += ` := ${v.initialValue}`;
        }
        decl += ';';
        lines.push(decl);
    }

    lines.push('END_VAR');
    return lines.join('\n');
}

// =============================================================================
// Instruction Generation
// =============================================================================

function generateInstruction(
    instr: ILInstruction,
    labelToState: Map<string, number>,
    hasJumps: boolean
): string[] {
    const stmts: string[] = [];

    // Handle the instruction based on operator
    switch (instr.operator) {
        // Load operators
        case 'LD':
            stmts.push(`${CR_BOOL_VAR} := ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'LDN':
            stmts.push(`${CR_BOOL_VAR} := NOT ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;

        // Store operators
        case 'ST':
            stmts.push(`${formatOperand(instr.operand)} := ${CR_VAR};`);
            break;
        case 'STN':
            stmts.push(`${formatOperand(instr.operand)} := NOT ${CR_BOOL_VAR};`);
            break;
        case 'S':
            stmts.push(`IF ${CR_BOOL_VAR} THEN ${formatOperand(instr.operand)} := TRUE; END_IF;`);
            break;
        case 'R':
            stmts.push(`IF ${CR_BOOL_VAR} THEN ${formatOperand(instr.operand)} := FALSE; END_IF;`);
            break;

        // Logical operators
        case 'AND':
            stmts.push(`${CR_BOOL_VAR} := ${CR_BOOL_VAR} AND ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'ANDN':
            stmts.push(`${CR_BOOL_VAR} := ${CR_BOOL_VAR} AND NOT ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'OR':
            stmts.push(`${CR_BOOL_VAR} := ${CR_BOOL_VAR} OR ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'ORN':
            stmts.push(`${CR_BOOL_VAR} := ${CR_BOOL_VAR} OR NOT ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'XOR':
            stmts.push(`${CR_BOOL_VAR} := ${CR_BOOL_VAR} XOR ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'XORN':
            stmts.push(`${CR_BOOL_VAR} := ${CR_BOOL_VAR} XOR NOT ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'NOT':
            stmts.push(`${CR_BOOL_VAR} := NOT ${CR_BOOL_VAR};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;

        // Arithmetic operators
        case 'ADD':
            stmts.push(`${CR_VAR} := ${CR_VAR} + ${formatOperand(instr.operand)};`);
            break;
        case 'SUB':
            stmts.push(`${CR_VAR} := ${CR_VAR} - ${formatOperand(instr.operand)};`);
            break;
        case 'MUL':
            stmts.push(`${CR_VAR} := ${CR_VAR} * ${formatOperand(instr.operand)};`);
            break;
        case 'DIV':
            stmts.push(`${CR_VAR} := ${CR_VAR} / ${formatOperand(instr.operand)};`);
            break;
        case 'MOD':
            stmts.push(`${CR_VAR} := ${CR_VAR} MOD ${formatOperand(instr.operand)};`);
            break;
        case 'NEG':
            stmts.push(`${CR_VAR} := -${CR_VAR};`);
            break;

        // Comparison operators
        case 'GT':
            stmts.push(`${CR_BOOL_VAR} := ${CR_VAR} > ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'GE':
            stmts.push(`${CR_BOOL_VAR} := ${CR_VAR} >= ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'EQ':
            stmts.push(`${CR_BOOL_VAR} := ${CR_VAR} = ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'NE':
            stmts.push(`${CR_BOOL_VAR} := ${CR_VAR} <> ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'LT':
            stmts.push(`${CR_BOOL_VAR} := ${CR_VAR} < ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;
        case 'LE':
            stmts.push(`${CR_BOOL_VAR} := ${CR_VAR} <= ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;

        // Jump operators
        case 'JMP':
            if (hasJumps && instr.operand) {
                const targetState = labelToState.get(instr.operand.value);
                if (targetState !== undefined) {
                    stmts.push(`${STATE_VAR} := ${targetState};`);
                }
            }
            break;
        case 'JMPC':
            if (hasJumps && instr.operand) {
                const targetState = labelToState.get(instr.operand.value);
                if (targetState !== undefined) {
                    stmts.push(`IF ${CR_BOOL_VAR} THEN ${STATE_VAR} := ${targetState}; END_IF;`);
                }
            }
            break;
        case 'JMPCN':
            if (hasJumps && instr.operand) {
                const targetState = labelToState.get(instr.operand.value);
                if (targetState !== undefined) {
                    stmts.push(`IF NOT ${CR_BOOL_VAR} THEN ${STATE_VAR} := ${targetState}; END_IF;`);
                }
            }
            break;

        // Call operators
        case 'CAL':
            if (instr.operand) {
                stmts.push(generateFBCall(instr.operand.value, instr.fbParams));
            }
            break;
        case 'CALC':
            if (instr.operand) {
                stmts.push(`IF ${CR_BOOL_VAR} THEN`);
                stmts.push(`    ${generateFBCall(instr.operand.value, instr.fbParams)}`);
                stmts.push('END_IF;');
            }
            break;
        case 'CALCN':
            if (instr.operand) {
                stmts.push(`IF NOT ${CR_BOOL_VAR} THEN`);
                stmts.push(`    ${generateFBCall(instr.operand.value, instr.fbParams)}`);
                stmts.push('END_IF;');
            }
            break;

        // Return operators
        case 'RET':
            if (hasJumps) {
                stmts.push(`${DONE_VAR} := TRUE;`);
            } else {
                stmts.push('RETURN;');
            }
            break;
        case 'RETC':
            if (hasJumps) {
                stmts.push(`IF ${CR_BOOL_VAR} THEN ${DONE_VAR} := TRUE; END_IF;`);
            } else {
                stmts.push(`IF ${CR_BOOL_VAR} THEN RETURN; END_IF;`);
            }
            break;
        case 'RETCN':
            if (hasJumps) {
                stmts.push(`IF NOT ${CR_BOOL_VAR} THEN ${DONE_VAR} := TRUE; END_IF;`);
            } else {
                stmts.push(`IF NOT ${CR_BOOL_VAR} THEN RETURN; END_IF;`);
            }
            break;
    }

    return stmts;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatOperand(operand: ILOperand | undefined): string {
    if (!operand) return '0';

    switch (operand.type) {
        case 'identifier':
        case 'io_address':
        case 'member_access':
        case 'label_ref':
            return operand.value;
        case 'literal':
            return operand.value;
        default:
            return operand.value;
    }
}

function generateFBCall(fbName: string, params?: ILFBParam[]): string {
    if (!params || params.length === 0) {
        return `${fbName}();`;
    }

    const paramStrs = params.map(p => `${p.name} := ${formatOperand(p.value)}`);
    return `${fbName}(${paramStrs.join(', ')});`;
}
