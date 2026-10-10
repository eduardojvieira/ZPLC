/**
 * ZPLC Assembler - Type Definitions
 *
 * SPDX-License-Identifier: MIT
 */

import { ABI_VERSION, CONTAINER, CONTAINER_LAYOUT, DRAFT_COUNTER, MEMORY_LIMIT, MEMORY_REGION, SEGMENT_TYPE, TASK_TYPE_ID } from '../contract.generated';

/**
 * A parsed token from source code.
 */
export interface Token {
    type: 'label' | 'instruction' | 'operand' | 'directive' | 'comment';
    value: string;
    lineNum: number;
    rawLine: string;
}

/**
 * A parsed instruction.
 */
export interface Instruction {
    opcode: number;
    /** Resolved operand value (null if label ref not yet resolved) */
    operand: number | null;
    /** Label reference to resolve in pass 2 */
    operandLabel: string | null;
    lineNum: number;
    /** Byte offset in code segment */
    address: number;
    /**
     * A byte of data, not an instruction: `.DB` values and the NOP fill of `.ORG`. `opcode` holds the byte
     * and nothing follows it; it is emitted as it stands.
     */
    raw?: boolean;
}

/**
 * A label definition.
 */
export interface Label {
    name: string;
    address: number;
    lineNum: number;
}

/**
 * Assembler error with line information.
 */
export class AssemblerError extends Error {
    lineNum: number;
    line: string;

    constructor(message: string, lineNum: number = 0, line: string = '') {
        super(`Line ${lineNum}: ${message}\n  -> ${line}`);
        this.name = 'AssemblerError';
        this.lineNum = lineNum;
        this.line = line;
    }
}

/**
 * Result of assembly process.
 */
export interface AssemblyResult {
    /** Raw bytecode (no header) */
    bytecode: Uint8Array;
    /** Complete .zplc file (header + segments + bytecode) */
    zplcFile: Uint8Array;
    /** Parsed labels for debugging */
    labels: Map<string, Label>;
    /** Entry point address (legacy - use tasks for multi-task) */
    entryPoint: number;
    /** Code size in bytes */
    codeSize: number;
    /** Task definitions (empty for single-task programs) */
    tasks?: TaskDef[];
    /** Variable tags (networking metadata) */
    tags?: TagDef[];
    /** Instruction-level mappings for source-level debugging */
    instructionMappings?: InstructionMapping[];
    /** The assembled instructions with their addresses, for the analyses that read the code (CMP-050) */
    instructions?: Instruction[];
}

/**
 * Assembler options.
 */
export interface AssemblerOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Generate raw bytecode only (no header) */
    raw?: boolean;
}

/**
 * ZPLC file format constants.
 * Taken from the generated contract (tools/contract/contract.json), the source of zplc_isa.h.
 */
export const ZPLC_CONSTANTS = {
    /** Magic number: "ZPLC" in little-endian (0x5A 0x50 0x4C 0x43) */
    MAGIC: CONTAINER.magic,
    /** Current ISA major version */
    VERSION_MAJOR: ABI_VERSION.major,
    /** Current ISA minor version */
    VERSION_MINOR: ABI_VERSION.minor,
    /** Draft contract counter written in the header of every artifact (CMP-052) */
    DRAFT_COUNTER,
    /** Byte offset of the draft counter in the file header */
    DRAFT_COUNTER_OFFSET: CONTAINER_LAYOUT.header.draft_counter.offset,
    /** File header size in bytes */
    HEADER_SIZE: CONTAINER.headerSize,
    /** Segment entry size in bytes */
    SEGMENT_ENTRY_SIZE: CONTAINER.segmentEntrySize,
    /** Segment type IDs */
    SEGMENT_TYPE_CODE: SEGMENT_TYPE.CODE,
    SEGMENT_TYPE_DATA: SEGMENT_TYPE.DATA,
    SEGMENT_TYPE_TASK: SEGMENT_TYPE.TASK,
    SEGMENT_TYPE_TAGS: SEGMENT_TYPE.TAGS,
    SEGMENT_TYPE_BUILD: SEGMENT_TYPE.BUILD,
    /** Size of the build identity, the payload of the BUILD segment, in bytes. */
    BUILD_ENTRY_SIZE: CONTAINER.buildEntrySize,
    /** Deepest evaluation stack the loader proves for a task; the compiler fails the build above it. */
    MAX_VERIFIED_DEPTH: CONTAINER.maxVerifiedDepth,
    /** Default maximum depth of the call stack of the VM (per zplc_isa.h). */
    CALL_STACK_MAX: MEMORY_LIMIT.callStackMax,
    /** Task definition size in bytes (per zplc_isa.h) */
    TASK_DEF_SIZE: CONTAINER.taskDefSize,
    /** Portable ABI v1 task limit accepted by the shared loader. */
    MAX_TASKS: CONTAINER.maxTasks,
    /** Default loader maximum evaluation stack depth (per zplc_isa.h). */
    TASK_STACK_MAX_DEPTH: MEMORY_LIMIT.stackMaxDepth,
    /** Tag entry size in bytes (per zplc_isa.h) */
    TAG_ENTRY_SIZE: CONTAINER.tagEntrySize,
    /** Portable/default maximum CODE size accepted by the runtime loader (ZPLC_MEM_CODE_SIZE). */
    CODE_SIZE_MAX: MEMORY_REGION.CODE.size,
} as const;

/**
 * Task trigger types (matches zplc_task_type_t in zplc_isa.h)
 */
export const TASK_TYPE = {
    CYCLIC: TASK_TYPE_ID.CYCLIC,
    EVENT: TASK_TYPE_ID.EVENT,
    INIT: TASK_TYPE_ID.INIT,
} as const;

export type TaskType = typeof TASK_TYPE[keyof typeof TASK_TYPE];

/**
 * Task definition for multi-task programs.
 * Matches zplc_task_def_t in zplc_isa.h (16 bytes)
 */
export interface TaskDef {
    /** Task ID (unique identifier) */
    id: number;
    /** Task type: 0=cyclic, 1=event, 2=init */
    type: TaskType;
    /** Priority (0=highest, 255=lowest) */
    priority: number;
    /** Interval in microseconds (for cyclic tasks) */
    intervalUs: number;
    /** Entry point offset in code segment */
    entryPoint: number;
    /** Required evaluation stack depth: the most values the task holds at once (CMP-050) */
    stackSize: number;
    /**
     * Call frames the task has active at once, its body included: 1 for a task that calls nothing. 0 or absent
     * is not declared (CMP-050).
     */
    callDepth?: number;
}

/**
 * Variable tag definition for TAG segment.
 * Matches zplc_tag_entry_t in zplc_isa.h (8 bytes)
 */
export interface TagDef {
    /** Variable address */
    varAddr: number;
    /** Data type ID */
    varType: number;
    /** Tag identifier (1=Publish, 2=Modbus) */
    tagId: number;
    /** Tag parameter (Modbus address, etc) */
    value: number;
}

// ============================================================================
// Debug/Source Mapping Types
// ============================================================================

/**
 * Source line annotation embedded in assembly comments.
 * Format: "; @source <line>:<column?>" or "; @source <line>"
 */
export interface SourceAnnotation {
    /** Source line number (1-based) */
    line: number;
    /** Source column (1-based, optional) */
    column?: number;
}

/**
 * Mapping from assembly instruction to bytecode PC and optional source line.
 * This allows reconstructing source → PC mappings after assembly.
 */
export interface InstructionMapping {
    /** Assembly line number (1-based) */
    asmLine: number;
    /** Bytecode PC (address) */
    pc: number;
    /** Size of this instruction in bytes */
    size: number;
    /** Source line annotation (if present in preceding comment) */
    sourceAnnotation?: SourceAnnotation;
}

/**
 * Extended assembly result with source mapping information.
 */
export interface AssemblyResultWithMapping extends AssemblyResult {
    /** Instruction-level mappings for debugging */
    instructionMappings: InstructionMapping[];
}
