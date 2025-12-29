/**
 * ZPLC Assembler - Code Generator
 *
 * SPDX-License-Identifier: MIT
 *
 * Generates bytecode from parsed instructions.
 * All multi-byte values are little-endian.
 */

import { getOperandSize, OPCODE_BY_VALUE, isRelativeJump } from './opcodes';
import type { Instruction, TaskDef } from './types';
import { ZPLC_CONSTANTS } from './types';
import type { ParseResult } from './parser';

/**
 * Emit bytecode from parsed instructions.
 *
 * @param instructions - Parsed and resolved instructions
 * @returns Raw bytecode (no header)
 */
export function emitBytecode(instructions: Instruction[]): Uint8Array {
    // Calculate total size
    let totalSize = 0;
    for (const instr of instructions) {
        totalSize += 1 + getOperandSize(instr.opcode);
    }

    // Create output buffer
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);
    let offset = 0;

    for (const instr of instructions) {
        // Emit opcode
        output[offset++] = instr.opcode;

        // Emit operand
        const operandSize = getOperandSize(instr.opcode);
        const operand = instr.operand ?? 0;

        if (operandSize === 1) {
            // 8-bit operand (could be signed, already masked in parser)
            output[offset++] = operand & 0xFF;
        } else if (operandSize === 2) {
            // 16-bit little-endian
            view.setUint16(offset, operand & 0xFFFF, true);
            offset += 2;
        } else if (operandSize === 4) {
            // 32-bit little-endian
            view.setUint32(offset, operand >>> 0, true);
            offset += 4;
        }
    }

    return output;
}

/**
 * Create a complete .zplc file with header.
 *
 * File format:
 *   - Header: 32 bytes
 *   - Segment table: 8 bytes per segment
 *   - Code segment
 *
 * @param bytecode - Raw bytecode
 * @param entryPoint - Entry point address
 * @returns Complete .zplc file
 */
export function createZplcFile(bytecode: Uint8Array, entryPoint: number): Uint8Array {
    const codeSize = bytecode.length;
    const segmentCount = 1;  // Just code for now

    // Total file size: header (32) + segment table (8) + code
    const totalSize =
        ZPLC_CONSTANTS.HEADER_SIZE +
        ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE +
        codeSize;

    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);

    // =========================================================================
    // Header (32 bytes)
    // =========================================================================
    // Layout from zplc_isa.h:
    //   magic         (4 bytes, uint32_t)
    //   version_major (2 bytes, uint16_t)
    //   version_minor (2 bytes, uint16_t)
    //   flags         (4 bytes, uint32_t)
    //   crc32         (4 bytes, uint32_t)
    //   code_size     (4 bytes, uint32_t)
    //   data_size     (4 bytes, uint32_t)
    //   entry_point   (2 bytes, uint16_t)
    //   segment_count (2 bytes, uint16_t)
    //   reserved      (4 bytes, uint32_t)
    // Total: 4+2+2+4+4+4+4+2+2+4 = 32 bytes

    let offset = 0;

    // magic (4 bytes)
    view.setUint32(offset, ZPLC_CONSTANTS.MAGIC, true);
    offset += 4;

    // version_major (2 bytes)
    view.setUint16(offset, ZPLC_CONSTANTS.VERSION_MAJOR, true);
    offset += 2;

    // version_minor (2 bytes)
    view.setUint16(offset, ZPLC_CONSTANTS.VERSION_MINOR, true);
    offset += 2;

    // flags (4 bytes)
    view.setUint32(offset, 0, true);
    offset += 4;

    // crc32 (4 bytes) - TODO: implement proper CRC32
    view.setUint32(offset, 0, true);
    offset += 4;

    // code_size (4 bytes)
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // data_size (4 bytes)
    view.setUint32(offset, 0, true);
    offset += 4;

    // entry_point (2 bytes)
    view.setUint16(offset, entryPoint & 0xFFFF, true);
    offset += 2;

    // segment_count (2 bytes)
    view.setUint16(offset, segmentCount, true);
    offset += 2;

    // reserved (4 bytes)
    view.setUint32(offset, 0, true);
    offset += 4;

    // Sanity check header size
    if (offset !== ZPLC_CONSTANTS.HEADER_SIZE) {
        throw new Error(`Header size mismatch: ${offset} != ${ZPLC_CONSTANTS.HEADER_SIZE}`);
    }

    // =========================================================================
    // Segment Table Entry (8 bytes)
    // =========================================================================
    // type  (2 bytes, uint16_t) = 0x01 (CODE)
    // flags (2 bytes, uint16_t) = 0
    // size  (4 bytes, uint32_t) = code_size

    // type
    view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_CODE, true);
    offset += 2;

    // flags
    view.setUint16(offset, 0, true);
    offset += 2;

    // size
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // Sanity check segment entry offset
    const expectedOffset = ZPLC_CONSTANTS.HEADER_SIZE + ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE;
    if (offset !== expectedOffset) {
        throw new Error(`Segment entry size mismatch: ${offset} != ${expectedOffset}`);
    }

    // =========================================================================
    // Code Segment
    // =========================================================================
    output.set(bytecode, offset);

    return output;
}

/**
 * Create a .zplc file with multiple tasks.
 *
 * File format:
 *   - Header: 32 bytes
 *   - Segment table: 8 bytes per segment (code + task)
 *   - Code segment
 *   - Task segment (16 bytes per task)
 *
 * @param bytecode - Raw bytecode
 * @param tasks - Array of task definitions
 * @returns Complete .zplc file with task segment
 */
export function createMultiTaskZplcFile(bytecode: Uint8Array, tasks: TaskDef[]): Uint8Array {
    const codeSize = bytecode.length;
    const taskCount = tasks.length;
    const taskSegmentSize = taskCount * ZPLC_CONSTANTS.TASK_DEF_SIZE;
    const segmentCount = 2; // CODE + TASK

    // Total file size: header + 2 segment entries + code + task data
    const totalSize =
        ZPLC_CONSTANTS.HEADER_SIZE +
        (ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE * segmentCount) +
        codeSize +
        taskSegmentSize;

    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);

    let offset = 0;

    // =========================================================================
    // Header (32 bytes) - same as single task, entry_point = first task
    // =========================================================================

    // magic
    view.setUint32(offset, ZPLC_CONSTANTS.MAGIC, true);
    offset += 4;

    // version
    view.setUint16(offset, ZPLC_CONSTANTS.VERSION_MAJOR, true);
    offset += 2;
    view.setUint16(offset, ZPLC_CONSTANTS.VERSION_MINOR, true);
    offset += 2;

    // flags
    view.setUint32(offset, 0, true);
    offset += 4;

    // crc32 (TODO)
    view.setUint32(offset, 0, true);
    offset += 4;

    // code_size
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // data_size (task segment counts as data)
    view.setUint32(offset, taskSegmentSize, true);
    offset += 4;

    // entry_point (first task's entry point for legacy compatibility)
    const primaryEntryPoint = tasks.length > 0 ? tasks[0].entryPoint : 0;
    view.setUint16(offset, primaryEntryPoint & 0xFFFF, true);
    offset += 2;

    // segment_count
    view.setUint16(offset, segmentCount, true);
    offset += 2;

    // reserved
    view.setUint32(offset, 0, true);
    offset += 4;

    // =========================================================================
    // Segment Table Entry 1: CODE
    // =========================================================================
    view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_CODE, true);
    offset += 2;
    view.setUint16(offset, 0, true); // flags
    offset += 2;
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // =========================================================================
    // Segment Table Entry 2: TASK
    // =========================================================================
    view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_TASK, true);
    offset += 2;
    view.setUint16(offset, 0, true); // flags
    offset += 2;
    view.setUint32(offset, taskSegmentSize, true);
    offset += 4;

    // =========================================================================
    // Code Segment
    // =========================================================================
    output.set(bytecode, offset);
    offset += codeSize;

    // =========================================================================
    // Task Segment (16 bytes per task per zplc_task_def_t)
    // =========================================================================
    // Layout from zplc_isa.h:
    //   id          (2 bytes, uint16_t)
    //   type        (1 byte,  uint8_t)
    //   priority    (1 byte,  uint8_t)
    //   interval_us (4 bytes, uint32_t)
    //   entry_point (2 bytes, uint16_t)
    //   stack_size  (2 bytes, uint16_t)
    //   reserved    (4 bytes, uint32_t)
    // Total: 16 bytes

    for (const task of tasks) {
        // id
        view.setUint16(offset, task.id & 0xFFFF, true);
        offset += 2;

        // type
        view.setUint8(offset, task.type & 0xFF);
        offset += 1;

        // priority
        view.setUint8(offset, task.priority & 0xFF);
        offset += 1;

        // interval_us
        view.setUint32(offset, task.intervalUs >>> 0, true);
        offset += 4;

        // entry_point
        view.setUint16(offset, task.entryPoint & 0xFFFF, true);
        offset += 2;

        // stack_size
        view.setUint16(offset, task.stackSize & 0xFFFF, true);
        offset += 2;

        // reserved
        view.setUint32(offset, 0, true);
        offset += 4;
    }

    return output;
}

/**
 * Generate complete assembly output from parse result.
 *
 * @param parseResult - Result from parse()
 * @returns Object with bytecode and complete .zplc file
 */
export function generate(parseResult: ParseResult): {
    bytecode: Uint8Array;
    zplcFile: Uint8Array;
} {
    const bytecode = emitBytecode(parseResult.instructions);
    const zplcFile = createZplcFile(bytecode, parseResult.entryPoint);

    return { bytecode, zplcFile };
}

// =============================================================================
// Disassembler (for debugging)
// =============================================================================

/**
 * Disassemble bytecode to readable text.
 *
 * @param bytecode - Raw bytecode
 * @param baseAddr - Base address for display (default 0)
 * @returns Disassembly listing
 */
export function disassemble(bytecode: Uint8Array, baseAddr: number = 0): string {
    const lines: string[] = [];
    const view = new DataView(bytecode.buffer, bytecode.byteOffset, bytecode.byteLength);
    let pc = 0;

    while (pc < bytecode.length) {
        const addr = baseAddr + pc;
        const opcode = bytecode[pc];

        if (!(opcode in OPCODE_BY_VALUE)) {
            lines.push(`0x${addr.toString(16).padStart(4, '0')}: ??? (0x${opcode.toString(16).padStart(2, '0')})`);
            pc += 1;
            continue;
        }

        const name = OPCODE_BY_VALUE[opcode];
        const operandSize = getOperandSize(opcode);
        const instrSize = 1 + operandSize;

        if (pc + operandSize >= bytecode.length) {
            lines.push(`0x${addr.toString(16).padStart(4, '0')}: ${name} <truncated>`);
            break;
        }

        if (operandSize === 0) {
            lines.push(`0x${addr.toString(16).padStart(4, '0')}: ${name}`);
        } else if (operandSize === 1) {
            const operand = bytecode[pc + 1];

            // Show signed for relative jumps
            if (isRelativeJump(opcode)) {
                const signedOp = operand < 128 ? operand : operand - 256;
                const target = addr + 2 + signedOp;
                lines.push(
                    `0x${addr.toString(16).padStart(4, '0')}: ${name} ${signedOp} (-> 0x${target.toString(16).padStart(4, '0')})`
                );
            } else {
                lines.push(
                    `0x${addr.toString(16).padStart(4, '0')}: ${name} ${operand} (0x${operand.toString(16).padStart(2, '0')})`
                );
            }
        } else if (operandSize === 2) {
            const operand = view.getUint16(pc + 1, true);
            lines.push(
                `0x${addr.toString(16).padStart(4, '0')}: ${name} 0x${operand.toString(16).padStart(4, '0')}`
            );
        } else {
            const operand = view.getUint32(pc + 1, true);
            lines.push(
                `0x${addr.toString(16).padStart(4, '0')}: ${name} 0x${operand.toString(16).padStart(8, '0')}`
            );
        }

        pc += instrSize;
    }

    return lines.join('\n');
}

/**
 * Generate hex dump of bytecode.
 *
 * @param bytecode - Byte array to dump
 * @returns Hex dump string
 */
export function hexDump(bytecode: Uint8Array): string {
    const lines: string[] = [];

    for (let i = 0; i < bytecode.length; i += 16) {
        const chunk = bytecode.slice(i, Math.min(i + 16, bytecode.length));
        const hex = Array.from(chunk)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
        lines.push(`0x${i.toString(16).padStart(4, '0')}: ${hex}`);
    }

    return lines.join('\n');
}
