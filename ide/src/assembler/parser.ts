/**
 * ZPLC Assembler - Parser
 *
 * SPDX-License-Identifier: MIT
 *
 * Two-pass assembler:
 *   Pass 1: Parse instructions, collect labels, calculate addresses
 *   Pass 2: Resolve label references
 */

import {
    Opcode,
    OPCODE_BY_NAME,
    getOperandSize,
    isRelativeJump,
} from './opcodes';
import type { Instruction, Label } from './types';
import { AssemblerError } from './types';

// =============================================================================
// Number Parsing
// =============================================================================

/**
 * Parse a number from string.
 *
 * Supports:
 *   - Decimal: 123, -45
 *   - Hexadecimal: 0x1234, 0X5678
 *   - Binary: 0b1010
 *   - Octal: 0o777
 *   - Character: 'A', '\n', '\0'
 *
 * @param s - String to parse
 * @returns Parsed integer value
 * @throws Error if string is not a valid number
 */
export function parseNumber(s: string): number {
    s = s.trim();

    if (!s) {
        throw new Error('Empty number');
    }

    // Character literal
    if (s.startsWith("'") && s.endsWith("'") && s.length >= 3) {
        if (s[1] === '\\') {
            // Escape sequences
            const escapes: Record<string, number> = {
                'n': 10,   // newline
                'r': 13,   // carriage return
                't': 9,    // tab
                '\\': 92,  // backslash
                "'": 39,   // single quote
                '0': 0,    // null
            };
            if (s.length >= 4 && s[2] in escapes) {
                return escapes[s[2]];
            }
        }
        return s.charCodeAt(1);
    }

    // Handle sign
    let negative = false;
    if (s[0] === '-') {
        negative = true;
        s = s.slice(1);
    } else if (s[0] === '+') {
        s = s.slice(1);
    }

    // Parse based on prefix
    let value: number;
    const lower = s.toLowerCase();

    if (lower.startsWith('0x')) {
        value = parseInt(s.slice(2), 16);
    } else if (lower.startsWith('0b')) {
        value = parseInt(s.slice(2), 2);
    } else if (lower.startsWith('0o')) {
        value = parseInt(s.slice(2), 8);
    } else {
        value = parseInt(s, 10);
    }

    if (isNaN(value)) {
        throw new Error(`Invalid number: ${s}`);
    }

    return negative ? -value : value;
}

/**
 * Check if a string is a valid label name.
 */
function isLabelName(s: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

// =============================================================================
// Parser State
// =============================================================================

interface ParserState {
    instructions: Instruction[];
    labels: Map<string, Label>;
    currentAddress: number;
    entryPoint: number | string;  // Can be number or label name until resolved
}

// =============================================================================
// Pass 1: Parse and Collect Labels
// =============================================================================

/**
 * Parse a single line of assembly.
 *
 * Syntax:
 *   [label:] [instruction [operand]] [; comment]
 *
 * @param line - Source line to parse
 * @param lineNum - Line number (1-based)
 * @param state - Parser state to update
 */
function parseLine(line: string, lineNum: number, state: ParserState): void {
    // Remove comments
    const commentIdx = line.indexOf(';');
    if (commentIdx !== -1) {
        line = line.slice(0, commentIdx);
    }

    line = line.trim();
    if (!line) {
        return;
    }

    // Check for label definition
    const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
    if (labelMatch) {
        const labelName = labelMatch[1].toUpperCase();

        if (state.labels.has(labelName)) {
            throw new AssemblerError(`Duplicate label '${labelName}'`, lineNum, line);
        }

        state.labels.set(labelName, {
            name: labelName,
            address: state.currentAddress,
            lineNum,
        });

        // Remove label from line and continue parsing
        line = line.slice(labelMatch[0].length).trim();
        if (!line) {
            return;
        }
    }

    // Parse instruction
    const parts = line.split(/\s+/);
    const mnemonic = parts[0].toUpperCase();
    const operandStr = parts.slice(1).join(' ').trim();

    // Handle directives
    if (mnemonic.startsWith('.')) {
        handleDirective(mnemonic, operandStr, lineNum, state);
        return;
    }

    // Look up opcode
    if (!(mnemonic in OPCODE_BY_NAME)) {
        throw new AssemblerError(`Unknown instruction '${mnemonic}'`, lineNum, line);
    }

    const opcode = OPCODE_BY_NAME[mnemonic];
    const operandSize = getOperandSize(opcode);

    // Parse operand
    let operandVal: number | null = null;
    let operandLabel: string | null = null;

    if (operandSize > 0) {
        if (!operandStr) {
            throw new AssemblerError(
                `Instruction '${mnemonic}' requires an operand`,
                lineNum,
                line
            );
        }

        // Check if it's a label reference
        if (isLabelName(operandStr)) {
            operandLabel = operandStr.toUpperCase();
        } else {
            try {
                operandVal = parseNumber(operandStr);
            } catch (e) {
                throw new AssemblerError(
                    `Invalid operand '${operandStr}': ${(e as Error).message}`,
                    lineNum,
                    line
                );
            }
        }
    } else if (operandStr) {
        throw new AssemblerError(
            `Instruction '${mnemonic}' takes no operand`,
            lineNum,
            line
        );
    }

    // Create instruction
    const instr: Instruction = {
        opcode,
        operand: operandVal,
        operandLabel,
        lineNum,
        address: state.currentAddress,
    };

    state.instructions.push(instr);

    // Advance address
    const instrSize = 1 + operandSize;
    state.currentAddress += instrSize;
}

/**
 * Handle assembler directives.
 */
function handleDirective(
    directive: string,
    operand: string,
    lineNum: number,
    state: ParserState
): void {
    switch (directive) {
        case '.ORG': {
            // Set origin address
            try {
                state.currentAddress = parseNumber(operand);
            } catch {
                throw new AssemblerError(
                    `Invalid address for .ORG: ${operand}`,
                    lineNum,
                    ''
                );
            }
            break;
        }

        case '.ENTRY': {
            // Set entry point
            const trimmed = operand.trim();
            if (isLabelName(trimmed)) {
                state.entryPoint = trimmed.toUpperCase();
            } else {
                try {
                    state.entryPoint = parseNumber(trimmed);
                } catch {
                    throw new AssemblerError(
                        `Invalid entry point: ${operand}`,
                        lineNum,
                        ''
                    );
                }
            }
            break;
        }

        case '.DB':
        case '.BYTE': {
            // Define bytes - just advance address for now
            // (Data segment not implemented yet)
            const values = operand.split(',');
            state.currentAddress += values.length;
            break;
        }

        default:
            throw new AssemblerError(`Unknown directive '${directive}'`, lineNum, '');
    }
}

// =============================================================================
// Pass 2: Resolve Labels
// =============================================================================

/**
 * Resolve all label references in instructions.
 *
 * @param state - Parser state with instructions and labels
 * @throws AssemblerError if a label is undefined or jump is out of range
 */
function resolveLabels(state: ParserState): void {
    for (const instr of state.instructions) {
        if (instr.operandLabel) {
            const label = state.labels.get(instr.operandLabel);

            if (!label) {
                throw new AssemblerError(
                    `Undefined label '${instr.operandLabel}'`,
                    instr.lineNum,
                    ''
                );
            }

            // For relative jumps (JR, JRZ, JRNZ), calculate offset
            if (isRelativeJump(instr.opcode)) {
                // Offset is from PC after instruction (PC + 2)
                const offset = label.address - (instr.address + 2);

                if (offset < -128 || offset > 127) {
                    throw new AssemblerError(
                        `Relative jump to '${instr.operandLabel}' out of range (${offset})`,
                        instr.lineNum,
                        ''
                    );
                }

                // Store as unsigned byte (signed value converted to unsigned)
                instr.operand = offset & 0xFF;
            } else {
                // Absolute address
                instr.operand = label.address;
            }
        }
    }

    // Resolve entry point if it's a label
    if (typeof state.entryPoint === 'string') {
        const label = state.labels.get(state.entryPoint);
        if (!label) {
            throw new AssemblerError(
                `Undefined entry point label '${state.entryPoint}'`,
                0,
                ''
            );
        }
        state.entryPoint = label.address;
    }
}

// =============================================================================
// Main Parse Function
// =============================================================================

export interface ParseResult {
    instructions: Instruction[];
    labels: Map<string, Label>;
    entryPoint: number;
    codeSize: number;
}

/**
 * Parse assembly source code.
 *
 * Performs two-pass assembly:
 *   Pass 1: Parse instructions, collect labels
 *   Pass 2: Resolve label references
 *
 * @param source - Assembly source code
 * @returns Parsed instructions, labels, and metadata
 * @throws AssemblerError on syntax or semantic errors
 */
export function parse(source: string): ParseResult {
    const state: ParserState = {
        instructions: [],
        labels: new Map(),
        currentAddress: 0,
        entryPoint: 0,
    };

    // Pass 1: Parse
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
        parseLine(lines[i], i + 1, state);
    }

    // Pass 2: Resolve labels
    resolveLabels(state);

    return {
        instructions: state.instructions,
        labels: state.labels,
        entryPoint: typeof state.entryPoint === 'number' ? state.entryPoint : 0,
        codeSize: state.currentAddress,
    };
}

// Export Opcode for convenience
export { Opcode };
