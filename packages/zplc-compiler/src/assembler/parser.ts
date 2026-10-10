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
    OPCODE_BY_VALUE,
    fitsOperandField,
    getOperandSize,
    isRelativeJump,
    operandField,
    operandRefusal,
} from './opcodes';
import type { Instruction, Label, SourceAnnotation, InstructionMapping, TagDef } from './types';
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
    /** Variable tags */
    tags: TagDef[];
    /** Line of the `.ENTRY` directive, for the errors about its label */
    entryLine: number;
    /** Current pending source annotation (from preceding comment) */
    pendingSourceAnnotation: SourceAnnotation | null;
    /** Mapping from instruction to source (populated during parsing) */
    instructionMappings: InstructionMapping[];
    /** The text of each source line that holds an instruction, directive or label, for the errors of pass 2 */
    sourceText: Map<number, string>;
}

/** An address or a count that has to fit the 16-bit address fields of the container */
const ADDRESS_MAX = 0xFFFF;

// =============================================================================
// Pass 1: Parse and Collect Labels
// =============================================================================

/**
 * Parse a single line of assembly.
 *
 * Syntax:
 *   [label:] [instruction [operand]] [; comment]
 *
 * Source annotations are embedded in comments:
 *   ; @source 42       -> source line 42
 *   ; @source 42:10    -> source line 42, column 10
 *
 * @param line - Source line to parse
 * @param lineNum - Line number (1-based)
 * @param state - Parser state to update
 */
function parseLine(line: string, lineNum: number, state: ParserState): void {
    // Check for source annotation in comments BEFORE stripping
    const commentIdx = line.indexOf(';');
    if (commentIdx !== -1) {
        const comment = line.slice(commentIdx + 1).trim();
        const sourceMatch = comment.match(/^@source\s+(\d+)(?::(\d+))?/);
        if (sourceMatch) {
            state.pendingSourceAnnotation = {
                line: parseInt(sourceMatch[1], 10),
                column: sourceMatch[2] ? parseInt(sourceMatch[2], 10) : undefined,
            };
        }
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
            // a value that does not fit the field is an error here, at its line (CMP-049)
            const field = operandField(opcode);
            if (field && !fitsOperandField(field, operandVal)) {
                throw new AssemblerError(operandRefusal(mnemonic, field, operandVal), lineNum, line);
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
    state.sourceText.set(lineNum, line);

    // Record instruction mapping for source-level debugging
    const instrSize = 1 + operandSize;
    const mapping: InstructionMapping = {
        asmLine: lineNum,
        pc: state.currentAddress,
        size: instrSize,
    };
    
    // Attach pending source annotation if present
    if (state.pendingSourceAnnotation) {
        mapping.sourceAnnotation = state.pendingSourceAnnotation;
        state.pendingSourceAnnotation = null;  // Consume it
    }
    
    state.instructionMappings.push(mapping);

    // Advance address
    state.currentAddress += instrSize;
}

/**
 * Split the operand of `.DB` at its commas; a comma inside a character literal ('x') does not split.
 */
function splitValues(text: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
        const character = text[index]!;
        if (character === "'" && text[index - 1] !== '\\') quoted = !quoted;
        if (character === ',' && !quoted) {
            values.push(current.trim());
            current = '';
        } else {
            current += character;
        }
    }
    values.push(current.trim());
    return values;
}

/** One value of a directive: a number that fits [min, max], or an error that names the directive and the line. */
function directiveNumber(
    directive: string,
    text: string,
    min: number,
    max: number,
    description: string,
    lineNum: number,
    line: string,
): number {
    let value: number;
    try {
        value = parseNumber(text);
    } catch (error) {
        throw new AssemblerError(`Invalid value '${text}' for ${directive}: ${(error as Error).message}`, lineNum, line);
    }
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new AssemblerError(
            `${directive} value ${value} does not fit its ${description} (${min} to ${max})`,
            lineNum,
            line,
        );
    }
    return value;
}

/** A byte of data: `.DB` values and the NOP fill of `.ORG`. */
function pushRaw(state: ParserState, byte: number, lineNum: number): void {
    state.instructions.push({ opcode: byte & 0xFF, operand: null, operandLabel: null, lineNum, address: state.currentAddress, raw: true });
    state.currentAddress += 1;
}

/**
 * Handle assembler directives.
 *
 * .ORG addr      the next byte is at `addr`: the gap is filled with NOP; moving backwards is an error
 * .ENTRY x       the entry point of the file, a label or an address inside the code
 * .DB v, ...     emits each value as one byte, here (.BYTE is the same)
 * .TAG a t i v   records a variable tag: address, data type, tag id, value
 */
function handleDirective(
    directive: string,
    operand: string,
    lineNum: number,
    state: ParserState
): void {
    const line = `${directive} ${operand}`.trim();
    state.sourceText.set(lineNum, line);
    switch (directive) {
        case '.ORG': {
            if (!operand.trim()) {
                throw new AssemblerError('.ORG requires an address', lineNum, line);
            }
            const address = directiveNumber('.ORG', operand.trim(), 0, ADDRESS_MAX, '16-bit address', lineNum, line);
            if (address < state.currentAddress) {
                throw new AssemblerError(
                    `.ORG ${address} moves backwards from ${state.currentAddress}`,
                    lineNum,
                    line
                );
            }
            while (state.currentAddress < address) {
                pushRaw(state, Opcode.NOP, lineNum);
            }
            break;
        }

        case '.ENTRY': {
            const trimmed = operand.trim();
            if (!trimmed) {
                throw new AssemblerError('.ENTRY requires a label or an address', lineNum, line);
            }
            state.entryLine = lineNum;
            if (isLabelName(trimmed)) {
                state.entryPoint = trimmed.toUpperCase();
            } else {
                state.entryPoint = directiveNumber('.ENTRY', trimmed, 0, ADDRESS_MAX, '16-bit entry point', lineNum, line);
            }
            break;
        }

        case '.DB':
        case '.BYTE': {
            if (!operand.trim()) {
                throw new AssemblerError(`${directive} requires a list of byte values`, lineNum, line);
            }
            for (const text of splitValues(operand)) {
                if (!text) {
                    throw new AssemblerError(`${directive} has an empty value in its list`, lineNum, line);
                }
                pushRaw(state, directiveNumber(directive, text, -128, 255, '8-bit byte', lineNum, line), lineNum);
            }
            break;
        }

        case '.TAG': {
            // .TAG <addr> <type> <tag_id> <value>
            const parts = operand.split(/\s+/).filter((part) => part !== '');
            if (parts.length !== 4) {
                throw new AssemblerError(`.TAG takes 4 arguments: addr type tag_id value (got ${parts.length})`, lineNum, line);
            }
            state.tags.push({
                varAddr: directiveNumber('.TAG', parts[0]!, 0, ADDRESS_MAX, '16-bit address', lineNum, line),
                varType: directiveNumber('.TAG', parts[1]!, 0, 0xFF, '8-bit data type', lineNum, line),
                tagId: directiveNumber('.TAG', parts[2]!, 0, 0xFF, '8-bit tag id', lineNum, line),
                value: directiveNumber('.TAG', parts[3]!, 0, 0xFFFFFFFF, '32-bit value', lineNum, line),
            });
            break;
        }

        default:
            throw new AssemblerError(`Unknown directive '${directive}'`, lineNum, line);
    }
}

// =============================================================================
// Pass 2: Resolve Labels
// =============================================================================

/**
 * Resolve all label references in instructions and check that every jump lands inside the code.
 *
 * @param state - Parser state with instructions and labels
 * @throws AssemblerError if a label is undefined, or a jump target or entry point does not fit its field
 */
function resolveLabels(state: ParserState): void {
    const codeSize = state.currentAddress;
    const source = (lineNum: number): string => state.sourceText.get(lineNum) ?? '';

    for (const instr of state.instructions) {
        if (instr.raw) continue;
        const mnemonic = OPCODE_BY_VALUE[instr.opcode] ?? `0x${instr.opcode.toString(16)}`;
        const relative = isRelativeJump(instr.opcode);
        const field = operandField(instr.opcode);
        const absolute = field?.codeAddress === true;

        if (instr.operandLabel) {
            const label = state.labels.get(instr.operandLabel);

            if (!label) {
                throw new AssemblerError(
                    `Undefined label '${instr.operandLabel}'`,
                    instr.lineNum,
                    source(instr.lineNum)
                );
            }

            if (relative) {
                // Offset is from PC after instruction (PC + 2)
                const offset = label.address - (instr.address + 2);

                if (offset < -128 || offset > 127) {
                    throw new AssemblerError(
                        `Relative jump to '${instr.operandLabel}' out of range (${offset})`,
                        instr.lineNum,
                        source(instr.lineNum)
                    );
                }
                instr.operand = offset;
            } else {
                if (label.address > ADDRESS_MAX) {
                    throw new AssemblerError(
                        `${mnemonic} to '${instr.operandLabel}' at ${label.address} does not fit the 16-bit code address`,
                        instr.lineNum,
                        source(instr.lineNum)
                    );
                }
                instr.operand = label.address;
            }
            if (label.address >= codeSize) {
                throw new AssemblerError(
                    `${mnemonic} to '${instr.operandLabel}': the label is after the last instruction (at ${label.address}, the code is ${codeSize} bytes)`,
                    instr.lineNum,
                    source(instr.lineNum)
                );
            }
        } else if (instr.operand !== null && (relative || absolute)) {
            // a numeric target is an instruction of the code, as a labelled one is
            const target = relative ? instr.address + 2 + instr.operand : instr.operand;
            if (target < 0 || target >= codeSize) {
                throw new AssemblerError(
                    `${mnemonic} target ${target} is outside the code (${codeSize} bytes)`,
                    instr.lineNum,
                    source(instr.lineNum)
                );
            }
        }
    }

    // Resolve entry point if it's a label
    if (typeof state.entryPoint === 'string') {
        const label = state.labels.get(state.entryPoint);
        if (!label) {
            throw new AssemblerError(
                `Undefined entry point label '${state.entryPoint}'`,
                state.entryLine,
                source(state.entryLine)
            );
        }
        if (label.address > ADDRESS_MAX) {
            throw new AssemblerError(
                `Entry point '${state.entryPoint}' at ${label.address} does not fit the 16-bit entry point`,
                label.lineNum,
                source(label.lineNum)
            );
        }
        state.entryPoint = label.address;
    }
    if (state.entryPoint !== 0 && state.entryPoint >= codeSize) {
        throw new AssemblerError(
            `Entry point ${state.entryPoint} is outside the code (${codeSize} bytes)`,
            state.entryLine,
            source(state.entryLine)
        );
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
    /** Variable tags */
    tags: TagDef[];
    /** Instruction-level mappings for source-level debugging */
    instructionMappings: InstructionMapping[];
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
        tags: [],
        entryLine: 0,
        pendingSourceAnnotation: null,
        instructionMappings: [],
        sourceText: new Map(),
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
        tags: state.tags,
        instructionMappings: state.instructionMappings,
    };
}

// Export Opcode for convenience
export { Opcode };
