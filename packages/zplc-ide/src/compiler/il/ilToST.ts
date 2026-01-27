/**
 * ZPLC IL-to-ST Transpiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Converts IEC 61131-3 Instruction List (IL) programs to Structured Text (ST).
 * This enables IL programs to be compiled using the existing ST compiler pipeline.
 *
 * Transpilation Strategy:
 * - IL Current Result (CR) is mapped to internal variables IL_CR, IL_CR_BOOL, IL_CR_REAL
 * - Load operators (LD, LDN) assign values to CR based on variable type (naive symbol table)
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
const CR_VAR = 'IL_CR';
const CR_BOOL_VAR = 'IL_CR_BOOL';
const CR_REAL_VAR = 'IL_CR_REAL';

// State machine variables for jump support
const STATE_VAR = 'IL_STATE';
const DONE_VAR = 'IL_DONE';
const LOOP_VAR = 'IL_LOOP_COUNT';
const MAX_CYCLES = 100000; // Safety limit for state machine loops

// =============================================================================
// State Machine Block
// =============================================================================

interface StateBlock {
    id: number;
    label: string | null;  // null for first block or auto-generated blocks
    instructions: ILInstruction[];
}

// =============================================================================
// IL-to-ST Transpiler
// =============================================================================

export function transpileILToST(program: ILProgram): TranspileResult {
    const errors: string[] = [];
    const lines: string[] = [];

    // Build rudimentary symbol table for type inference
    const varTypes = new Map<string, string>();
    for (const block of program.varBlocks) {
        for (const v of block.variables) {
            varTypes.set(v.name, v.dataType.toUpperCase());
        }
    }

    // Check if we need state machine for jumps
    const hasJumps = program.instructions.some(i =>
        ['JMP', 'JMPC', 'JMPCN', 'RET', 'RETC', 'RETCN'].includes(i.operator)
    );

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
        lines.push(`    ${LOOP_VAR} : DINT := 0;`);
    }
    lines.push('END_VAR');
    lines.push('');

    // Generate instruction body
    if (hasJumps) {
        // Build state blocks - we need a new block after:
        // 1. Any instruction with a label (target of a jump)
        // 2. Any control flow instruction (jumps create breaks in flow)
        
        const blocks: StateBlock[] = [];
        let currentBlock: StateBlock = { id: 0, label: null, instructions: [] };
        
        // Map from label (uppercase) to block ID for jump resolution
        const labelToBlockId = new Map<string, number>();
        
        // First pass: Build blocks
        for (let i = 0; i < program.instructions.length; i++) {
            const instr = program.instructions[i];
            
            // If this instruction has a label, start a new block
            if (instr.label) {
                // Save current block if it has instructions
                if (currentBlock.instructions.length > 0) {
                    blocks.push(currentBlock);
                }
                // Start new block for this label
                const newId = blocks.length;
                currentBlock = { id: newId, label: instr.label, instructions: [] };
                labelToBlockId.set(instr.label.toUpperCase(), newId);
            }
            
            // Add instruction to current block
            currentBlock.instructions.push(instr);
            
            // If this instruction is control flow (JMP/JMPC/etc), 
            // we need to start a new block for whatever comes next
            if (isControlFlowOp(instr.operator)) {
                blocks.push(currentBlock);
                // Start a fresh block (will get an auto-label if needed)
                const newId = blocks.length;
                currentBlock = { id: newId, label: null, instructions: [] };
            }
        }
        
        // Push final block if it has instructions
        if (currentBlock.instructions.length > 0) {
            blocks.push(currentBlock);
        }

        // Re-index blocks and update label map
        for (let i = 0; i < blocks.length; i++) {
            blocks[i].id = i;
            if (blocks[i].label) {
                labelToBlockId.set(blocks[i].label!.toUpperCase(), i);
            }
        }

        // Generate state machine
        lines.push(`${DONE_VAR} := FALSE;`);
        lines.push(`${LOOP_VAR} := 0;`);
        lines.push(`WHILE NOT ${DONE_VAR} AND ${LOOP_VAR} < ${MAX_CYCLES} DO`);
        lines.push(`    ${LOOP_VAR} := ${LOOP_VAR} + 1;`);
        lines.push(`    CASE ${STATE_VAR} OF`);

        for (let blockIdx = 0; blockIdx < blocks.length; blockIdx++) {
            const block = blocks[blockIdx];
            const nextBlockId = blockIdx + 1 < blocks.length ? blockIdx + 1 : -1;
            
            lines.push(`        ${block.id}:`);

            for (let instrIdx = 0; instrIdx < block.instructions.length; instrIdx++) {
                const instr = block.instructions[instrIdx];
                
                const stmts = generateInstruction(
                    instr, 
                    labelToBlockId, 
                    hasJumps, 
                    varTypes, 
                    nextBlockId
                );
                
                for (const stmt of stmts) {
                    lines.push(`            ${stmt}`);
                }
            }

            // If block doesn't end with a control flow instruction, add fallthrough
            const lastInstr = block.instructions[block.instructions.length - 1];
            if (!isControlFlowOp(lastInstr.operator)) {
                if (nextBlockId !== -1) {
                    lines.push(`            ${STATE_VAR} := ${nextBlockId};`);
                } else {
                    lines.push(`            ${DONE_VAR} := TRUE;`);
                }
            }
        }

        lines.push('    ELSE');
        lines.push(`        ${DONE_VAR} := TRUE;`);
        lines.push('    END_CASE;');
        lines.push('END_WHILE;');
    } else {
        // Simple sequential execution (no jumps)
        const labelToBlockId = new Map<string, number>();
        for (const instr of program.instructions) {
            const stmts = generateInstruction(instr, labelToBlockId, hasJumps, varTypes, -1);
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
// Helper: Check if operator is control flow
// =============================================================================

function isControlFlowOp(op: string): boolean {
    return ['JMP', 'JMPC', 'JMPCN', 'RET', 'RETC', 'RETCN'].includes(op);
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
    labelToBlockId: Map<string, number>,
    hasJumps: boolean,
    varTypes: Map<string, string>,
    nextBlockId: number // Block ID to fall through to (-1 if end)
): string[] {
    const stmts: string[] = [];

    // Helper for fallthrough assignment
    const assignFallthrough = () => {
        if (nextBlockId !== -1) {
            return `${STATE_VAR} := ${nextBlockId};`;
        } else {
            return `${DONE_VAR} := TRUE;`;
        }
    };

    // Handle the instruction based on operator
    switch (instr.operator) {
        // Load operators
        case 'LD': {
            const op = formatOperand(instr.operand);
            const type = getOperandType(instr.operand, varTypes);
            
            if (type === 'BOOL') {
                stmts.push(`${CR_BOOL_VAR} := ${op};`);
                stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
                stmts.push(`${CR_REAL_VAR} := INT_TO_REAL(${CR_VAR});`);
            } else if (type === 'REAL') {
                stmts.push(`${CR_REAL_VAR} := ${op};`);
                stmts.push(`${CR_VAR} := REAL_TO_INT(${CR_REAL_VAR});`);
                stmts.push(`${CR_BOOL_VAR} := INT_TO_BOOL(${CR_VAR});`);
            } else {
                stmts.push(`${CR_VAR} := ${op};`);
                stmts.push(`${CR_REAL_VAR} := INT_TO_REAL(${CR_VAR});`);
                stmts.push(`${CR_BOOL_VAR} := INT_TO_BOOL(${CR_VAR});`);
            }
            break;
        }
        case 'LDN':
            stmts.push(`${CR_BOOL_VAR} := NOT ${formatOperand(instr.operand)};`);
            stmts.push(`${CR_VAR} := BOOL_TO_INT(${CR_BOOL_VAR});`);
            break;

        // Store operators
        case 'ST': {
            const op = formatOperand(instr.operand);
            const type = getOperandType(instr.operand, varTypes);
            if (type === 'BOOL') {
                stmts.push(`${op} := ${CR_BOOL_VAR};`);
            } else if (type === 'REAL') {
                stmts.push(`${op} := ${CR_REAL_VAR};`);
            } else {
                stmts.push(`${op} := ${CR_VAR};`);
            }
            break;
        }
        case 'STN': {
            const op = formatOperand(instr.operand);
            const type = getOperandType(instr.operand, varTypes);
            if (type === 'BOOL') {
                stmts.push(`${op} := NOT ${CR_BOOL_VAR};`);
            } else {
                stmts.push(`${op} := NOT ${CR_VAR};`);
            }
            break;
        }
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
                const targetBlockId = labelToBlockId.get(instr.operand.value.toUpperCase());
                if (targetBlockId !== undefined) {
                    stmts.push(`${STATE_VAR} := ${targetBlockId};`);
                } else {
                    stmts.push(`(* ERROR: Jump target '${instr.operand.value}' not found *)`);
                    stmts.push(`${DONE_VAR} := TRUE;`);
                }
            }
            break;
        case 'JMPC':
            if (hasJumps && instr.operand) {
                const targetBlockId = labelToBlockId.get(instr.operand.value.toUpperCase());
                if (targetBlockId !== undefined) {
                    stmts.push(`IF ${CR_BOOL_VAR} THEN`);
                    stmts.push(`    ${STATE_VAR} := ${targetBlockId};`);
                    stmts.push(`ELSE`);
                    stmts.push(`    ${assignFallthrough()}`);
                    stmts.push(`END_IF;`);
                }
            }
            break;
        case 'JMPCN':
            if (hasJumps && instr.operand) {
                const targetBlockId = labelToBlockId.get(instr.operand.value.toUpperCase());
                if (targetBlockId !== undefined) {
                    stmts.push(`IF NOT ${CR_BOOL_VAR} THEN`);
                    stmts.push(`    ${STATE_VAR} := ${targetBlockId};`);
                    stmts.push(`ELSE`);
                    stmts.push(`    ${assignFallthrough()}`);
                    stmts.push(`END_IF;`);
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
            stmts.push(`${DONE_VAR} := TRUE;`);
            break;
        case 'RETC':
            if (hasJumps) {
                stmts.push(`IF ${CR_BOOL_VAR} THEN`);
                stmts.push(`    ${DONE_VAR} := TRUE;`);
                stmts.push(`ELSE`);
                stmts.push(`    ${assignFallthrough()}`);
                stmts.push(`END_IF;`);
            } else {
                stmts.push(`IF ${CR_BOOL_VAR} THEN RETURN; END_IF;`);
            }
            break;
        case 'RETCN':
            if (hasJumps) {
                stmts.push(`IF NOT ${CR_BOOL_VAR} THEN`);
                stmts.push(`    ${DONE_VAR} := TRUE;`);
                stmts.push(`ELSE`);
                stmts.push(`    ${assignFallthrough()}`);
                stmts.push(`END_IF;`);
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

function getOperandType(operand: ILOperand | undefined, varTypes: Map<string, string>): string {
    if (!operand) return 'BOOL';
    
    if (operand.dataType) return operand.dataType;
    
    if (operand.type === 'identifier' && varTypes.has(operand.value)) {
        return varTypes.get(operand.value)!;
    }
    
    // Default fallback
    return 'INT';
}

function generateFBCall(fbName: string, params?: ILFBParam[]): string {
    if (!params || params.length === 0) {
        return `${fbName}();`;
    }

    const paramStrs = params.map(p => `${p.name} := ${formatOperand(p.value)}`);
    return `${fbName}(${paramStrs.join(', ')});`;
}
