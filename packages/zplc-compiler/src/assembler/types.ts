/**
 * ZPLC Assembler - Type Definitions
 *
 * SPDX-License-Identifier: MIT
 */

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
 * Must match zplc_isa.h definitions.
 */
export const ZPLC_CONSTANTS = {
    /** Magic number: "ZPLC" in little-endian (0x5A 0x50 0x4C 0x43) */
    MAGIC: 0x434C505A,
    /** Current ISA major version */
    VERSION_MAJOR: 1,
    /** Current ISA minor version */
    VERSION_MINOR: 0,
    /** File header size in bytes */
    HEADER_SIZE: 32,
    /** Segment entry size in bytes */
    SEGMENT_ENTRY_SIZE: 8,
    /** Segment type IDs */
    SEGMENT_TYPE_CODE: 0x01,
    SEGMENT_TYPE_DATA: 0x02,
    SEGMENT_TYPE_TASK: 0x20,
    SEGMENT_TYPE_TAGS: 0x30,
    /** Task definition size in bytes (per zplc_isa.h) */
    TASK_DEF_SIZE: 16,
    /** Tag entry size in bytes (per zplc_isa.h) */
    TAG_ENTRY_SIZE: 8,
} as const;

/**
 * Task trigger types (matches zplc_task_type_t in zplc_isa.h)
 */
export const TASK_TYPE = {
    CYCLIC: 0,
    EVENT: 1,
    INIT: 2,
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
    /** Required stack depth (default: 64) */
    stackSize: number;
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
