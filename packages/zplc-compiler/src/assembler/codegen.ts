/**
 * ZPLC Assembler - Code Generator
 *
 * SPDX-License-Identifier: MIT
 *
 * Generates bytecode from parsed instructions.
 * All multi-byte values are little-endian.
 */

import { fitsOperandField, getOperandSize, OPCODE_BY_VALUE, isRelativeJump, operandField, operandRefusal } from './opcodes';
import { CONTAINER, OPCODE_TABLE } from '../contract.generated';
import type { Instruction, TaskDef, TagDef } from './types';
import { AssemblerError, TASK_TYPE, ZPLC_CONSTANTS } from './types';
import type { ParseResult } from './parser';

// =============================================================================
// CRC32 (IEEE 802.3 / Ethernet / zlib / PKZIP)
// Polynomial: 0xEDB88320
// =============================================================================

const CRC32_TABLE = new Uint32Array(256);
(function initCrc32Table() {
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        CRC32_TABLE[i] = c >>> 0;
    }
})();

/**
 * Compute CRC32 over a byte array.
 *
 * @param data - Bytes to checksum
 * @returns CRC32 value (unsigned 32-bit)
 */
export function crc32(data: Uint8Array): number {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        c = (CRC32_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Write the CRC-32 of the whole file except the crc32 field itself (bytes 12-15) into that field. */
function sealCrc(output: Uint8Array): void {
    const crcOffset = CONTAINER.crcOffset;
    const crcSize = CONTAINER.crcSize;
    const payload = new Uint8Array(output.length - crcSize);
    payload.set(output.subarray(0, crcOffset), 0);
    payload.set(output.subarray(crcOffset + crcSize), crcOffset);
    new DataView(output.buffer, output.byteOffset, output.byteLength).setUint32(crcOffset, crc32(payload), true);
}

/**
 * The build identity of a program (CMP-056): the CRC-32 of its CODE segment followed by its TASK segment as
 * written, 1 in the one case the value would be 0, which is what an artifact without an identity reads as.
 * It is a function of the program alone: two builds of the same project give the same identity (CMP-053), and
 * the tags, which come from the communication configuration and not from the program, are not part of it.
 */
export function buildIdOf(code: Uint8Array, taskSegment: Uint8Array = new Uint8Array(0)): number {
    const joined = new Uint8Array(code.length + taskSegment.length);
    joined.set(code, 0);
    joined.set(taskSegment, code.length);
    return crc32(joined) || 1;
}

/**
 * Set of opcodes that use absolute 16-bit addresses and need relocation.
 * These are jumps and calls that target absolute code addresses.
 */
const RELOCATABLE_OPCODES: Set<number> = new Set(
    OPCODE_TABLE.filter((entry) => entry.flags.includes('absolute')).map((entry) => entry.code),
);

const UINT16_MAX = 0xFFFF;
const UINT32_MAX = 0xFFFFFFFF;

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === 'number'
        && Number.isInteger(value)
        && value >= minimum
        && value <= maximum;
}

/** A variable tag whose fields all fit the TAGS entry (CMP-049): nothing is masked when it is written. */
function validateTags(tags: readonly TagDef[] | undefined): void {
    for (const [index, tag] of (tags ?? []).entries()) {
        const label = `Tag ${index}`;
        if (!isIntegerInRange(tag.varAddr, 0, UINT16_MAX)) {
            throw new AssemblerError(`${label} address ${String(tag.varAddr)} does not fit its 16-bit address field`);
        }
        if (!isIntegerInRange(tag.varType, 0, 0xFF)) {
            throw new AssemblerError(`${label} data type ${String(tag.varType)} does not fit its 8-bit field`);
        }
        if (!isIntegerInRange(tag.tagId, 0, 0xFF)) {
            throw new AssemblerError(`${label} id ${String(tag.tagId)} does not fit its 8-bit field`);
        }
        if (!isIntegerInRange(tag.value, 0, UINT32_MAX)) {
            throw new AssemblerError(`${label} value ${String(tag.value)} does not fit its 32-bit field`);
        }
    }
}

function validateMultiTaskLayout(bytecode: Uint8Array, tasks: TaskDef[], tags?: TagDef[]): void {
    if (!(bytecode instanceof Uint8Array)) {
        throw new AssemblerError('Multi-task bytecode must be a Uint8Array');
    }
    validateTags(tags);
    if (!Array.isArray(tasks) || tasks.length === 0) {
        throw new AssemblerError('Multi-task programs require at least one task');
    }
    if (tasks.length > ZPLC_CONSTANTS.MAX_TASKS) {
        throw new AssemblerError(`Multi-task programs support at most ${ZPLC_CONSTANTS.MAX_TASKS} tasks`);
    }
    if (!isIntegerInRange(bytecode.length, 1, ZPLC_CONSTANTS.CODE_SIZE_MAX)) {
        throw new AssemblerError(`Multi-task CODE length must be an integer from 1 to ${ZPLC_CONSTANTS.CODE_SIZE_MAX}`);
    }

    const taskSegmentSize = tasks.length * ZPLC_CONSTANTS.TASK_DEF_SIZE;
    const tagSegmentSize = (tags?.length ?? 0) * ZPLC_CONSTANTS.TAG_ENTRY_SIZE;
    const segmentCount = tags?.length ? 4 : 3;
    const totalSize = ZPLC_CONSTANTS.HEADER_SIZE
        + (ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE * segmentCount)
        + bytecode.length
        + taskSegmentSize
        + tagSegmentSize
        + ZPLC_CONSTANTS.BUILD_ENTRY_SIZE;
    if (!Number.isSafeInteger(taskSegmentSize) || taskSegmentSize > UINT32_MAX
        || !Number.isSafeInteger(tagSegmentSize) || tagSegmentSize > UINT32_MAX
        || !Number.isSafeInteger(totalSize) || totalSize > UINT32_MAX) {
        throw new AssemblerError('Multi-task file layout exceeds the ZPLC ABI');
    }

    const taskIds = new Set<number>();
    const taskTypes = new Set<number>(Object.values(TASK_TYPE));
    for (let index = 0; index < tasks.length; index++) {
        const task = tasks[index];
        const label = `Task ${index}`;
        if (!task || typeof task !== 'object') {
            throw new AssemblerError(`${label} must be a task definition`);
        }
        if (!isIntegerInRange(task.id, 0, UINT16_MAX)) {
            throw new AssemblerError(`${label} id must be an integer from 0 to 65535`);
        }
        if (taskIds.has(task.id)) {
            throw new AssemblerError(`${label} has duplicate id ${task.id}`);
        }
        taskIds.add(task.id);
        if (!taskTypes.has(task.type)) {
            throw new AssemblerError(`${label} type is not a supported task type`);
        }
        if (!isIntegerInRange(task.priority, 0, 0xFF)) {
            throw new AssemblerError(`${label} priority must be an integer from 0 to 255`);
        }
        if (!isIntegerInRange(task.intervalUs, 1, UINT32_MAX)) {
            throw new AssemblerError(`${label} intervalUs must be an integer from 1 to 4294967295`);
        }
        if (!isIntegerInRange(task.entryPoint, 0, UINT16_MAX) || task.entryPoint >= bytecode.length) {
            throw new AssemblerError(`${label} entryPoint must be an integer within the code segment`);
        }
        if (!isIntegerInRange(task.stackSize, 1, ZPLC_CONSTANTS.TASK_STACK_MAX_DEPTH)) {
            throw new AssemblerError(`${label} stackSize must be an integer from 1 to ${ZPLC_CONSTANTS.TASK_STACK_MAX_DEPTH}`);
        }
        if (task.callDepth !== undefined && !isIntegerInRange(task.callDepth, 0, UINT16_MAX)) {
            throw new AssemblerError(`${label} call depth must be an integer from 0 to 65535 (0 is not declared)`);
        }
    }
}

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
        totalSize += instr.raw ? 1 : 1 + getOperandSize(instr.opcode);
    }

    // Create output buffer
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);
    let offset = 0;

    for (const instr of instructions) {
        // Emit opcode, or the byte of data
        output[offset++] = instr.opcode;
        if (instr.raw) continue;

        // Emit operand: it is checked against its field, never masked to it (CMP-049)
        const operandSize = getOperandSize(instr.opcode);
        const operand = instr.operand ?? 0;
        const field = operandField(instr.opcode);
        if (field && !fitsOperandField(field, operand)) {
            const mnemonic = OPCODE_BY_VALUE[instr.opcode] ?? `0x${instr.opcode.toString(16)}`;
            throw new AssemblerError(operandRefusal(mnemonic, field, operand), instr.lineNum);
        }

        if (operandSize === 1) {
            // 8-bit operand: an immediate, or a signed offset stored as its two's complement byte
            view.setUint8(offset, operand & 0xFF);
            offset += 1;
        } else if (operandSize === 2) {
            // 16-bit little-endian; an immediate may be written signed
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
 * Relocate bytecode by adding an offset to all absolute jump/call addresses.
 *
 * This function is used when concatenating multiple independently compiled
 * programs into a single code segment. Each program is compiled with addresses
 * starting at 0, so when placing them at different offsets, all absolute
 * jumps must be adjusted.
 *
 * Affected instructions (16-bit absolute address operand):
 *   - JMP  (0x90)
 *   - JZ   (0x91)
 *   - JNZ  (0x92)
 *   - CALL (0x93)
 *
 * NOT affected (relative jumps use signed 8-bit offset from PC):
 *   - JR, JRZ, JRNZ
 *
 * @param bytecode - Original bytecode (will be modified in place)
 * @param baseOffset - Offset to add to all absolute addresses
 * @returns The same bytecode array (modified)
 */
export function relocateBytecode(bytecode: Uint8Array, baseOffset: number): Uint8Array {
    if (!isIntegerInRange(baseOffset, 0, UINT16_MAX)) {
        throw new AssemblerError(`Relocation offset ${String(baseOffset)} does not fit the 16-bit code address`);
    }
    if (baseOffset === 0) {
        return bytecode; // No relocation needed
    }

    const view = new DataView(bytecode.buffer, bytecode.byteOffset, bytecode.byteLength);
    const relocated: Array<{ at: number; address: number }> = [];
    let pc = 0;

    while (pc < bytecode.length) {
        const opcode = bytecode[pc]!;
        const operandSize = getOperandSize(opcode);

        // Check if this is a relocatable opcode
        if (RELOCATABLE_OPCODES.has(opcode) && operandSize === 2 && pc + 2 < bytecode.length) {
            const address = view.getUint16(pc + 1, true) + baseOffset;
            if (address > UINT16_MAX) {
                // nothing has been written: the bytecode is as it was given
                throw new AssemblerError(
                    `Relocating the ${OPCODE_BY_VALUE[opcode] ?? 'jump'} at ${pc} by ${baseOffset} gives address ${address}, which does not fit the 16-bit code address`,
                );
            }
            relocated.push({ at: pc + 1, address });
        }

        // Move to next instruction
        pc += 1 + operandSize;
    }

    for (const { at, address } of relocated) {
        view.setUint16(at, address, true);
    }

    return bytecode;
}

/**
 * Create a complete .zplc file with header.
 *
 * File format:
 *   - Header: 32 bytes
 *   - Segment table: 8 bytes per segment
 *   - Code segment
 *   - (Optional) Tag segment
 *
 * @param bytecode - Raw bytecode
 * @param entryPoint - Entry point address
 * @param tags - Optional variable tags
 * @returns Complete .zplc file
 */
export function createZplcFile(bytecode: Uint8Array, entryPoint: number, tags?: TagDef[]): Uint8Array {
    const codeSize = bytecode.length;
    if (!isIntegerInRange(entryPoint, 0, UINT16_MAX)) {
        throw new AssemblerError(`Entry point ${String(entryPoint)} does not fit its 16-bit field`);
    }
    if (codeSize > 0 && entryPoint >= codeSize) {
        throw new AssemblerError(`Entry point ${entryPoint} is outside the code (${codeSize} bytes)`);
    }
    validateTags(tags);
    const tagCount = tags?.length ?? 0;
    const tagSegmentSize = tagCount * ZPLC_CONSTANTS.TAG_ENTRY_SIZE;
    
    // CODE, TAGS when there are tags, and the build identity (CMP-056)
    const segmentCount = tagCount > 0 ? 3 : 2;

    // Total file size: header (32) + segment table (8 * segmentCount) + code + tags + build identity
    const totalSize =
        ZPLC_CONSTANTS.HEADER_SIZE +
        (ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE * segmentCount) +
        codeSize +
        tagSegmentSize +
        ZPLC_CONSTANTS.BUILD_ENTRY_SIZE;

    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);

    // =========================================================================
    // Header (32 bytes)
    // =========================================================================
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

    // crc32 (4 bytes)
    view.setUint32(offset, 0, true);
    offset += 4;

    // code_size (4 bytes)
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // data_size (4 bytes) - tag segment and build identity count as data/metadata
    view.setUint32(offset, tagSegmentSize + ZPLC_CONSTANTS.BUILD_ENTRY_SIZE, true);
    offset += 4;

    // entry_point (2 bytes)
    view.setUint16(offset, entryPoint & 0xFFFF, true);
    offset += 2;

    // segment_count (2 bytes)
    view.setUint16(offset, segmentCount, true);
    offset += 2;

    // draft_counter (4 bytes): the contract draft this artifact was built for (CMP-052)
    view.setUint32(offset, ZPLC_CONSTANTS.DRAFT_COUNTER, true);
    offset += 4;

    // =========================================================================
    // Segment Table Entry 1: CODE
    // =========================================================================
    view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_CODE, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // =========================================================================
    // Segment Table Entry 2: TAGS (if present)
    // =========================================================================
    if (tagCount > 0) {
        view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_TAGS, true);
        offset += 2;
        view.setUint16(offset, 0, true);
        offset += 2;
        view.setUint32(offset, tagSegmentSize, true);
        offset += 4;
    }

    // =========================================================================
    // Segment Table Entry: BUILD
    // =========================================================================
    view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_BUILD, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint32(offset, ZPLC_CONSTANTS.BUILD_ENTRY_SIZE, true);
    offset += 4;

    // =========================================================================
    // Code Segment
    // =========================================================================
    output.set(bytecode, offset);
    offset += codeSize;

    // =========================================================================
    // Tag Segment
    // =========================================================================
    if (tagCount > 0 && tags) {
        for (const tag of tags) {
            view.setUint16(offset, tag.varAddr, true);
            offset += 2;
            view.setUint8(offset, tag.varType);
            offset += 1;
            view.setUint8(offset, tag.tagId);
            offset += 1;
            view.setUint32(offset, tag.value, true);
            offset += 4;
        }
    }

    // =========================================================================
    // Build identity (CMP-056)
    // =========================================================================
    view.setUint32(offset, buildIdOf(bytecode), true);
    offset += ZPLC_CONSTANTS.BUILD_ENTRY_SIZE;

    sealCrc(output);
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
export function createMultiTaskZplcFile(bytecode: Uint8Array, tasks: TaskDef[], tags?: TagDef[]): Uint8Array {
    validateMultiTaskLayout(bytecode, tasks, tags);
    const codeSize = bytecode.length;
    const taskCount = tasks.length;
    const taskSegmentSize = taskCount * ZPLC_CONSTANTS.TASK_DEF_SIZE;
    const tagCount = tags?.length ?? 0;
    const tagSegmentSize = tagCount * ZPLC_CONSTANTS.TAG_ENTRY_SIZE;
    const segmentCount = tagCount > 0 ? 4 : 3; // CODE + TASK (+ TAGS) + BUILD

    // Total file size: header + segment entries + code + task data + optional tags + build identity
    const totalSize =
        ZPLC_CONSTANTS.HEADER_SIZE +
        (ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE * segmentCount) +
        codeSize +
        taskSegmentSize +
        tagSegmentSize +
        ZPLC_CONSTANTS.BUILD_ENTRY_SIZE;

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

    // crc32 (computed below)
    view.setUint32(offset, 0, true);
    offset += 4;

    // code_size
    view.setUint32(offset, codeSize, true);
    offset += 4;

    // data_size (task metadata + optional tag metadata + build identity)
    view.setUint32(offset, taskSegmentSize + tagSegmentSize + ZPLC_CONSTANTS.BUILD_ENTRY_SIZE, true);
    offset += 4;

    // entry_point (first task's entry point for legacy compatibility)
    const primaryEntryPoint = tasks.length > 0 ? tasks[0].entryPoint : 0;
    view.setUint16(offset, primaryEntryPoint, true);
    offset += 2;

    // segment_count
    view.setUint16(offset, segmentCount, true);
    offset += 2;

    // draft_counter: the contract draft this artifact was built for (CMP-052)
    view.setUint32(offset, ZPLC_CONSTANTS.DRAFT_COUNTER, true);
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
    // Segment Table Entry 3: TAGS (if present)
    // =========================================================================
    if (tagCount > 0) {
        view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_TAGS, true);
        offset += 2;
        view.setUint16(offset, 0, true); // flags
        offset += 2;
        view.setUint32(offset, tagSegmentSize, true);
        offset += 4;
    }

    // =========================================================================
    // Segment Table Entry: BUILD
    // =========================================================================
    view.setUint16(offset, ZPLC_CONSTANTS.SEGMENT_TYPE_BUILD, true);
    offset += 2;
    view.setUint16(offset, 0, true); // flags
    offset += 2;
    view.setUint32(offset, ZPLC_CONSTANTS.BUILD_ENTRY_SIZE, true);
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
    //   call_depth  (2 bytes, uint16_t)  call frames active at once, the body included; 0 = not declared
    //   reserved    (2 bytes, uint16_t)  must be 0
    // Total: 16 bytes

    const taskSegmentAt = offset;
    for (const task of tasks) {
        // id
        view.setUint16(offset, task.id, true);
        offset += 2;

        // type
        view.setUint8(offset, task.type);
        offset += 1;

        // priority
        view.setUint8(offset, task.priority);
        offset += 1;

        // interval_us
        view.setUint32(offset, task.intervalUs, true);
        offset += 4;

        // entry_point
        view.setUint16(offset, task.entryPoint, true);
        offset += 2;

        // stack_size
        view.setUint16(offset, task.stackSize, true);
        offset += 2;

        // call_depth
        view.setUint16(offset, task.callDepth ?? 0, true);
        offset += 2;

        // reserved
        view.setUint16(offset, 0, true);
        offset += 2;
    }
    const taskSegment = output.subarray(taskSegmentAt, offset);

    if (tagCount > 0 && tags) {
        for (const tag of tags) {
            view.setUint16(offset, tag.varAddr, true);
            offset += 2;
            view.setUint8(offset, tag.varType);
            offset += 1;
            view.setUint8(offset, tag.tagId);
            offset += 1;
            view.setUint32(offset, tag.value, true);
            offset += 4;
        }
    }

    // Build identity (CMP-056)
    view.setUint32(offset, buildIdOf(bytecode, taskSegment), true);
    offset += ZPLC_CONSTANTS.BUILD_ENTRY_SIZE;

    sealCrc(output);
    return output;
}

/** What the header, the segment table and the tasks of an artifact say; see {@link readArtifact}. */
export interface ArtifactInfo {
    /** The contract draft the artifact was built for. */
    draftCounter: number;
    codeSize: number;
    entryPoint: number;
    segments: Array<{ type: number; size: number; offset: number }>;
    tasks: TaskDef[];
    /** The build identity, or undefined when the artifact carries none (or is not an artifact). */
    buildId?: number;
}

/**
 * Read the structure of a .zplc file without verifying it: its segments, its task table and its build
 * identity. A byte string that is not an artifact reads as one with no segments. Verification is the loader's.
 */
export function readArtifact(bytes: Uint8Array): ArtifactInfo {
    const empty: ArtifactInfo = { draftCounter: 0, codeSize: 0, entryPoint: 0, segments: [], tasks: [] };
    if (bytes.length < ZPLC_CONSTANTS.HEADER_SIZE) return empty;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== ZPLC_CONSTANTS.MAGIC) return empty;
    const info: ArtifactInfo = {
        draftCounter: view.getUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, true),
        codeSize: view.getUint32(16, true),
        entryPoint: view.getUint16(24, true),
        segments: [],
        tasks: [],
    };
    const count = view.getUint16(26, true);
    let offset = ZPLC_CONSTANTS.HEADER_SIZE + count * ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE;
    if (offset > bytes.length) return info;
    for (let index = 0; index < count; index += 1) {
        const entry = ZPLC_CONSTANTS.HEADER_SIZE + index * ZPLC_CONSTANTS.SEGMENT_ENTRY_SIZE;
        const type = view.getUint16(entry, true);
        const size = view.getUint32(entry + 4, true);
        if (offset + size > bytes.length) return info;
        info.segments.push({ type, size, offset });
        if (type === ZPLC_CONSTANTS.SEGMENT_TYPE_TASK && size % ZPLC_CONSTANTS.TASK_DEF_SIZE === 0) {
            for (let at = offset; at < offset + size; at += ZPLC_CONSTANTS.TASK_DEF_SIZE) {
                info.tasks.push({
                    id: view.getUint16(at, true),
                    type: view.getUint8(at + 2) as TaskDef['type'],
                    priority: view.getUint8(at + 3),
                    intervalUs: view.getUint32(at + 4, true),
                    entryPoint: view.getUint16(at + 8, true),
                    stackSize: view.getUint16(at + 10, true),
                    callDepth: view.getUint16(at + 12, true),
                });
            }
        }
        if (type === ZPLC_CONSTANTS.SEGMENT_TYPE_BUILD && size === ZPLC_CONSTANTS.BUILD_ENTRY_SIZE) {
            info.buildId = view.getUint32(offset, true);
        }
        offset += size;
    }
    return info;
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
    const zplcFile = createZplcFile(bytecode, parseResult.entryPoint, parseResult.tags);

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
