/**
 * ZPLC Assembler
 *
 * SPDX-License-Identifier: MIT
 *
 * Converts ZPLC assembly source code into bytecode.
 * This is a TypeScript port of tools/zplc_asm.py with bit-perfect output.
 *
 * Usage:
 *   import { assemble } from './assembler';
 *
 *   const source = `
 *     LOAD16 0x0000
 *     LOAD16 0x0002
 *     ADD
 *     STORE16 0x1000
 *     HALT
 *   `;
 *
 *   const result = assemble(source);
 *   console.log(result.bytecode);       // Raw bytecode
 *   console.log(result.zplcFile);       // Complete .zplc file
 */

// Re-export types and functions
export { Opcode, OPCODE_BY_NAME, OPCODE_BY_VALUE, getOperandSize, isRelativeJump } from './opcodes';
export { AssemblerError, ZPLC_CONSTANTS, TASK_TYPE } from './types';
export type {
    Instruction,
    Label,
    Token,
    AssemblyResult,
    AssemblerOptions,
    TaskDef,
    TaskType,
    SourceAnnotation,
    InstructionMapping,
    AssemblyResultWithMapping,
} from './types';
export { parseNumber, parse } from './parser';
export type { ParseResult } from './parser';
export { emitBytecode, createZplcFile, createMultiTaskZplcFile, relocateBytecode, disassemble, hexDump } from './codegen';

import { parse } from './parser';
import { generate } from './codegen';
import type { AssemblyResult, AssemblerOptions, Label } from './types';

/**
 * Assemble source code to bytecode.
 *
 * @param source - Assembly source code
 * @param _options - Assembler options (reserved for future use)
 * @returns Assembly result with bytecode and metadata
 * @throws AssemblerError on syntax or semantic errors
 *
 * @example
 * ```typescript
 * const result = assemble(`
 *   start:
 *     LOAD16 0x0000    ; Load A
 *     LOAD16 0x0002    ; Load B
 *     ADD              ; A + B
 *     STORE16 0x1000   ; Store to output
 *     HALT
 * `);
 *
 * // Download as .zplc file
 * const blob = new Blob([result.zplcFile], { type: 'application/octet-stream' });
 * ```
 */
export function assemble(source: string, _options: AssemblerOptions = {}): AssemblyResult {
    // Parse source
    const parseResult = parse(source);

    // Generate bytecode
    const { bytecode, zplcFile } = generate(parseResult);

    // Convert labels map to the expected format
    const labels = new Map<string, Label>();
    for (const [name, label] of parseResult.labels) {
        labels.set(name, label);
    }

    return {
        bytecode,
        zplcFile,
        labels,
        entryPoint: parseResult.entryPoint,
        codeSize: parseResult.codeSize,
        instructionMappings: parseResult.instructionMappings,
    };
}

/**
 * Assemble source code and return only raw bytecode.
 *
 * Use this for quick compilation without the .zplc header.
 *
 * @param source - Assembly source code
 * @returns Raw bytecode
 */
export function assembleRaw(source: string): Uint8Array {
    const result = assemble(source);
    return result.bytecode;
}

/**
 * Validate assembly source without generating output.
 *
 * @param source - Assembly source code
 * @returns null if valid, or error message if invalid
 */
export function validate(source: string): string | null {
    try {
        parse(source);
        return null;
    } catch (e) {
        return (e as Error).message;
    }
}
