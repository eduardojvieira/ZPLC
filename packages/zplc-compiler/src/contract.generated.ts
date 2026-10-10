/**
 * GENERATED FILE. Do not edit.
 * Source: tools/contract/contract.json. Regenerate: python3 tools/contract/generate.py
 *
 * The ZPLC binary contract as the compiler and the IDE consume it: opcodes,
 * container constants, memory regions, error codes, type identifiers and the
 * communication function-block layouts. `generate.py --check` fails when this
 * file differs from a fresh generation.
 */

export const ABI_VERSION = { major: 1, minor: 0 } as const;

/** Container (.zplc file) constants. */
export const CONTAINER = {
  magic: 0x434C505A,
  headerSize: 32,
  segmentEntrySize: 8,
  taskDefSize: 16,
  iomapEntrySize: 8,
  tagEntrySize: 8,
  maxTasks: 16,
  crcOffset: 12,
  crcSize: 4,
} as const;

/** Field layout of the packed container structures (little-endian). */
export const CONTAINER_LAYOUT = {
  header: {
    magic: { offset: 0, size: 4 },
    version_major: { offset: 4, size: 2 },
    version_minor: { offset: 6, size: 2 },
    flags: { offset: 8, size: 4 },
    crc32: { offset: 12, size: 4 },
    code_size: { offset: 16, size: 4 },
    data_size: { offset: 20, size: 4 },
    entry_point: { offset: 24, size: 2 },
    segment_count: { offset: 26, size: 2 },
    reserved: { offset: 28, size: 4 },
  },
  segment: {
    type: { offset: 0, size: 2 },
    flags: { offset: 2, size: 2 },
    size: { offset: 4, size: 4 },
  },
  task: {
    id: { offset: 0, size: 2 },
    type: { offset: 2, size: 1 },
    priority: { offset: 3, size: 1 },
    interval_us: { offset: 4, size: 4 },
    entry_point: { offset: 8, size: 2 },
    stack_size: { offset: 10, size: 2 },
    reserved: { offset: 12, size: 4 },
  },
  iomap: {
    var_addr: { offset: 0, size: 2 },
    var_type: { offset: 2, size: 1 },
    direction: { offset: 3, size: 1 },
    channel: { offset: 4, size: 2 },
    flags: { offset: 6, size: 2 },
  },
  tag: {
    var_addr: { offset: 0, size: 2 },
    var_type: { offset: 2, size: 1 },
    tag_id: { offset: 3, size: 1 },
    value: { offset: 4, size: 4 },
  },
} as const;

/** Segment type identifiers. */
export const SEGMENT_TYPE = {
  CODE: 0x01,
  DATA: 0x02,
  BSS: 0x03,
  RETAIN: 0x04,
  IOMAP: 0x05,
  SYMTAB: 0x10,
  DEBUG: 0x11,
  TASK: 0x20,
  TAGS: 0x30,
} as const;

/** Task trigger types. */
export const TASK_TYPE_ID = {
  CYCLIC: 0,
  EVENT: 1,
  INIT: 2,
} as const;

/** I/O map directions. */
export const IO_DIRECTION = {
  INPUT: 0,
  OUTPUT: 1,
} as const;

/** Variable tag identifiers. */
export const TAG_ID = {
  NONE: 0,
  PUBLISH: 1,
  MODBUS: 2,
  SUBSCRIBE: 3,
} as const;

/** Container header flag bits (as masks). */
export const FILE_FLAG = {
  HAS_DEBUG: 0x01,
  HAS_SYMBOLS: 0x02,
  HAS_RETAIN: 0x04,
  SIGNED: 0x08,
} as const;

/** Memory regions of the VM address space: base and default size in bytes. */
export const MEMORY_REGION = {
  IPI: { base: 0x0000, size: 0x1000 },
  OPI: { base: 0x1000, size: 0x1000 },
  WORK: { base: 0x2000, size: 0x2000 },
  RETAIN: { base: 0x4000, size: 0x1000 },
  CODE: { base: 0x5000, size: 0xB000 },
} as const;

/** Default sizes of the runtime limits (a board may configure some of them through Kconfig). */
export const MEMORY_LIMIT = {
  maxTags: 64,
  stackMaxDepth: 256,
  callStackMax: 32,
  maxBreakpoints: 16,
} as const;

/** System registers in the input image (address, type, size in bytes). */
export const SYSTEM_REGISTER = {
  CYCLE_TIME: { address: 0x0FF0, type: "DINT", size: 4 },
  UPTIME: { address: 0x0FF4, type: "UDINT", size: 4 },
  TASK_ID: { address: 0x0FF8, type: "BYTE", size: 1 },
  FLAGS: { address: 0x0FF9, type: "BYTE", size: 1 },
} as const;

/** System flag masks of the system flags register. */
export const SYSTEM_FLAG = {
  FIRST_SCAN: 0x01,
  WDG_WARN: 0x02,
  RUNNING: 0x04,
} as const;

/** IEC 61131-3 data type identifiers used by the symbol table, the I/O map and the tags. */
export const DATA_TYPE_ID = {
  NONE: 0x00,
  BOOL: 0x01,
  SINT: 0x02,
  INT: 0x04,
  DINT: 0x06,
  LINT: 0x08,
  USINT: 0x03,
  UINT: 0x05,
  UDINT: 0x07,
  ULINT: 0x09,
  REAL: 0x0A,
  LREAL: 0x0B,
  TIME: 0x0C,
  BYTE: 0x10,
  WORD: 0x11,
  DWORD: 0x12,
  LWORD: 0x13,
  STRING: 0x20,
} as const;

/** Size in bytes of each fixed-size data type (STRING has none). */
export const DATA_TYPE_SIZE = {
  NONE: 0,
  BOOL: 1,
  SINT: 1,
  INT: 2,
  DINT: 4,
  LINT: 8,
  USINT: 1,
  UINT: 2,
  UDINT: 4,
  ULINT: 8,
  REAL: 4,
  LREAL: 8,
  TIME: 4,
  BYTE: 1,
  WORD: 2,
  DWORD: 4,
  LWORD: 8,
} as const;

/** STRING memory layout: [length:2][capacity:2][data:capacity+1]. */
export const STRING_LAYOUT = {
  lenOffset: 0,
  capOffset: 2,
  dataOffset: 4,
  headerSize: 4,
  defaultSize: 80,
  maxSize: 255,
  /** Bytes of a default STRING: header + default capacity + terminator. */
  defaultTotalSize: 85,
} as const;

/** VM opcodes (name to number). */
export const Opcode = {
  NOP: 0x00, // No operation
  HALT: 0x01, // Stop execution
  BREAK: 0x02, // Debugger breakpoint
  GET_TICKS: 0x03, // Push system tick (ms) to stack
  DUP: 0x10, // Duplicate top of stack
  DROP: 0x11, // Discard top of stack
  SWAP: 0x12, // Swap top two elements
  OVER: 0x13, // Copy second element to top
  ROT: 0x14, // Rotate top three elements
  LOADI8: 0x15, // Load 8-bit from address on stack
  LOADI32: 0x16, // Load 32-bit from address on stack
  STOREI8: 0x17, // Store 8-bit to address on stack: [addr val] -> []
  STOREI32: 0x18, // Store 32-bit to address on stack: [addr val] -> []
  LOADI16: 0x19, // Load 16-bit from address on stack
  STOREI16: 0x1A, // Store 16-bit to address on stack: [addr val] -> []
  STRLEN: 0x1B, // Get string length: [str_addr] -> [length]
  STRCPY: 0x1C, // Copy string: [src_addr dst_addr] -> [] (safe, bounds-checked)
  STRCAT: 0x1D, // Concatenate: [src_addr dst_addr] -> [] (safe, bounds-checked)
  STRCMP: 0x1E, // Compare strings: [addr1 addr2] -> [result] (-1, 0, 1)
  STRCLR: 0x1F, // Clear string: [str_addr] -> []
  ADD: 0x20, // Integer addition
  SUB: 0x21, // Integer subtraction
  MUL: 0x22, // Integer multiplication
  DIV: 0x23, // Integer division
  MOD: 0x24, // Integer modulo
  NEG: 0x25, // Integer negation
  ABS: 0x26, // Absolute value
  ADDF: 0x28, // Float addition
  SUBF: 0x29, // Float subtraction
  MULF: 0x2A, // Float multiplication
  DIVF: 0x2B, // Float division
  NEGF: 0x2C, // Float negation
  ABSF: 0x2D, // Float absolute value
  AND: 0x30, // Bitwise AND
  OR: 0x31, // Bitwise OR
  XOR: 0x32, // Bitwise XOR
  NOT: 0x33, // Bitwise NOT
  SHL: 0x34, // Shift left
  SHR: 0x35, // Shift right (logical)
  SAR: 0x36, // Shift right (arithmetic)
  EQ: 0x38, // Equal
  NE: 0x39, // Not equal
  LT: 0x3A, // Less than (signed)
  LE: 0x3B, // Less or equal (signed)
  GT: 0x3C, // Greater than (signed)
  GE: 0x3D, // Greater or equal (signed)
  LTU: 0x3E, // Less than (unsigned)
  GTU: 0x3F, // Greater than (unsigned)
  PUSH8: 0x40, // Push 8-bit immediate (sign-extended)
  PICK: 0x41, // Copy nth stack element to top: PICK n copies stack[sp-1-n]
  JR: 0x50, // Relative jump (signed 8-bit offset)
  JRZ: 0x51, // Relative jump if zero
  JRNZ: 0x52, // Relative jump if not zero
  LOAD8: 0x80, // Load 8-bit from address
  LOAD16: 0x81, // Load 16-bit from address
  LOAD32: 0x82, // Load 32-bit from address
  LOAD64: 0x83, // Load 64-bit from address
  STORE8: 0x84, // Store 8-bit to address
  STORE16: 0x85, // Store 16-bit to address
  STORE32: 0x86, // Store 32-bit to address
  STORE64: 0x87, // Store 64-bit to address
  PUSH16: 0x88, // Push 16-bit immediate (sign-extended)
  JMP: 0x90, // Unconditional jump
  JZ: 0x91, // Jump if zero (false)
  JNZ: 0x92, // Jump if not zero (true)
  CALL: 0x93, // Call subroutine
  RET: 0x94, // Return from subroutine
  I2F: 0xA0, // Integer to float
  F2I: 0xA1, // Float to integer
  I2B: 0xA2, // Integer to boolean
  EXT8: 0xA3, // Sign-extend 8-bit to 32-bit
  EXT16: 0xA4, // Sign-extend 16-bit to 32-bit
  ZEXT8: 0xA5, // Zero-extend 8-bit to 32-bit
  ZEXT16: 0xA6, // Zero-extend 16-bit to 32-bit
  PUSH32: 0xC0, // Push 32-bit immediate
  COMM_EXEC: 0xD0, // Execute/update Comm FB; pop base addr from stack
  COMM_STATUS: 0xD1, // Push status word for a kind to stack
  COMM_RESET: 0xD2, // Reset FSM for Comm FB; pop base addr from stack
} as const;

export interface OpcodeInfo {
  readonly name: string;
  readonly code: number;
  /** Operand size in bytes: 0, 1, 2 or 4. */
  readonly operand: number;
  readonly group: string;
  /** 32-bit stack words the instruction removes. */
  readonly pops: number;
  /** 32-bit stack words the instruction adds. */
  readonly pushes: number;
  /** Stack words that must be present before the instruction runs. */
  readonly minDepth: number;
  readonly effect: string;
  readonly flags: readonly string[];
  readonly memory?: { readonly access: 'read' | 'write'; readonly width: number };
  readonly doc: string;
}

/** Every opcode with its operand layout, stack effect and flags, in number order. */
export const OPCODE_TABLE: readonly OpcodeInfo[] = [
  { name: "NOP", code: 0x00, operand: 0, group: "system", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: [], doc: "No operation" },
  { name: "HALT", code: 0x01, operand: 0, group: "system", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: ["terminates"], doc: "Stop execution" },
  { name: "BREAK", code: 0x02, operand: 0, group: "system", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: [], doc: "Debugger breakpoint" },
  { name: "GET_TICKS", code: 0x03, operand: 0, group: "system", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [ticks]", flags: [], doc: "Push system tick (ms) to stack" },
  { name: "DUP", code: 0x10, operand: 0, group: "stack", pops: 0, pushes: 1, minDepth: 1, effect: "[a] -> [a a]", flags: [], doc: "Duplicate top of stack" },
  { name: "DROP", code: 0x11, operand: 0, group: "stack", pops: 1, pushes: 0, minDepth: 1, effect: "[a] -> []", flags: [], doc: "Discard top of stack" },
  { name: "SWAP", code: 0x12, operand: 0, group: "stack", pops: 0, pushes: 0, minDepth: 2, effect: "[a b] -> [b a]", flags: [], doc: "Swap top two elements" },
  { name: "OVER", code: 0x13, operand: 0, group: "stack", pops: 0, pushes: 1, minDepth: 2, effect: "[a b] -> [a b a]", flags: [], doc: "Copy second element to top" },
  { name: "ROT", code: 0x14, operand: 0, group: "stack", pops: 0, pushes: 0, minDepth: 3, effect: "[a b c] -> [b c a]", flags: [], doc: "Rotate top three elements" },
  { name: "LOADI8", code: 0x15, operand: 0, group: "indirect", pops: 1, pushes: 1, minDepth: 1, effect: "[addr] -> [value]", flags: [], doc: "Load 8-bit from address on stack" },
  { name: "LOADI32", code: 0x16, operand: 0, group: "indirect", pops: 1, pushes: 1, minDepth: 1, effect: "[addr] -> [value]", flags: [], doc: "Load 32-bit from address on stack" },
  { name: "STOREI8", code: 0x17, operand: 0, group: "indirect", pops: 2, pushes: 0, minDepth: 2, effect: "[addr value] -> []", flags: [], doc: "Store 8-bit to address on stack: [addr val] -> []" },
  { name: "STOREI32", code: 0x18, operand: 0, group: "indirect", pops: 2, pushes: 0, minDepth: 2, effect: "[addr value] -> []", flags: [], doc: "Store 32-bit to address on stack: [addr val] -> []" },
  { name: "LOADI16", code: 0x19, operand: 0, group: "indirect", pops: 1, pushes: 1, minDepth: 1, effect: "[addr] -> [value]", flags: [], doc: "Load 16-bit from address on stack" },
  { name: "STOREI16", code: 0x1A, operand: 0, group: "indirect", pops: 2, pushes: 0, minDepth: 2, effect: "[addr value] -> []", flags: [], doc: "Store 16-bit to address on stack: [addr val] -> []" },
  { name: "STRLEN", code: 0x1B, operand: 0, group: "string", pops: 1, pushes: 1, minDepth: 1, effect: "[str] -> [len]", flags: [], doc: "Get string length: [str_addr] -> [length]" },
  { name: "STRCPY", code: 0x1C, operand: 0, group: "string", pops: 2, pushes: 0, minDepth: 2, effect: "[src dst] -> []", flags: [], doc: "Copy string: [src_addr dst_addr] -> [] (safe, bounds-checked)" },
  { name: "STRCAT", code: 0x1D, operand: 0, group: "string", pops: 2, pushes: 0, minDepth: 2, effect: "[src dst] -> []", flags: [], doc: "Concatenate: [src_addr dst_addr] -> [] (safe, bounds-checked)" },
  { name: "STRCMP", code: 0x1E, operand: 0, group: "string", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [cmp]", flags: [], doc: "Compare strings: [addr1 addr2] -> [result] (-1, 0, 1)" },
  { name: "STRCLR", code: 0x1F, operand: 0, group: "string", pops: 1, pushes: 0, minDepth: 1, effect: "[str] -> []", flags: [], doc: "Clear string: [str_addr] -> []" },
  { name: "ADD", code: 0x20, operand: 0, group: "integer", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Integer addition" },
  { name: "SUB", code: 0x21, operand: 0, group: "integer", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Integer subtraction" },
  { name: "MUL", code: 0x22, operand: 0, group: "integer", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Integer multiplication" },
  { name: "DIV", code: 0x23, operand: 0, group: "integer", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Integer division" },
  { name: "MOD", code: 0x24, operand: 0, group: "integer", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Integer modulo" },
  { name: "NEG", code: 0x25, operand: 0, group: "integer", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Integer negation" },
  { name: "ABS", code: 0x26, operand: 0, group: "integer", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Absolute value" },
  { name: "ADDF", code: 0x28, operand: 0, group: "float", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Float addition" },
  { name: "SUBF", code: 0x29, operand: 0, group: "float", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Float subtraction" },
  { name: "MULF", code: 0x2A, operand: 0, group: "float", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Float multiplication" },
  { name: "DIVF", code: 0x2B, operand: 0, group: "float", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Float division" },
  { name: "NEGF", code: 0x2C, operand: 0, group: "float", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Float negation" },
  { name: "ABSF", code: 0x2D, operand: 0, group: "float", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Float absolute value" },
  { name: "AND", code: 0x30, operand: 0, group: "logic", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Bitwise AND" },
  { name: "OR", code: 0x31, operand: 0, group: "logic", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Bitwise OR" },
  { name: "XOR", code: 0x32, operand: 0, group: "logic", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Bitwise XOR" },
  { name: "NOT", code: 0x33, operand: 0, group: "logic", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Bitwise NOT" },
  { name: "SHL", code: 0x34, operand: 0, group: "logic", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Shift left" },
  { name: "SHR", code: 0x35, operand: 0, group: "logic", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Shift right (logical)" },
  { name: "SAR", code: 0x36, operand: 0, group: "logic", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [r]", flags: [], doc: "Shift right (arithmetic)" },
  { name: "EQ", code: 0x38, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Equal" },
  { name: "NE", code: 0x39, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Not equal" },
  { name: "LT", code: 0x3A, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Less than (signed)" },
  { name: "LE", code: 0x3B, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Less or equal (signed)" },
  { name: "GT", code: 0x3C, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Greater than (signed)" },
  { name: "GE", code: 0x3D, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Greater or equal (signed)" },
  { name: "LTU", code: 0x3E, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Less than (unsigned)" },
  { name: "GTU", code: 0x3F, operand: 0, group: "comparison", pops: 2, pushes: 1, minDepth: 2, effect: "[a b] -> [flag]", flags: [], doc: "Greater than (unsigned)" },
  { name: "PUSH8", code: 0x40, operand: 1, group: "push8", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [imm]", flags: [], doc: "Push 8-bit immediate (sign-extended)" },
  { name: "PICK", code: 0x41, operand: 1, group: "push8", pops: 0, pushes: 1, minDepth: 1, effect: "[x_n .. x_0] -> [x_n .. x_0 x_n]", flags: [], doc: "Copy nth stack element to top: PICK n copies stack[sp-1-n]" },
  { name: "JR", code: 0x50, operand: 1, group: "jump8", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: ["relative", "terminates"], doc: "Relative jump (signed 8-bit offset)" },
  { name: "JRZ", code: 0x51, operand: 1, group: "jump8", pops: 1, pushes: 0, minDepth: 1, effect: "[cond] -> []", flags: ["relative"], doc: "Relative jump if zero" },
  { name: "JRNZ", code: 0x52, operand: 1, group: "jump8", pops: 1, pushes: 0, minDepth: 1, effect: "[cond] -> []", flags: ["relative"], doc: "Relative jump if not zero" },
  { name: "LOAD8", code: 0x80, operand: 2, group: "memory", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [value]", flags: [], memory: { access: "read", width: 1 }, doc: "Load 8-bit from address" },
  { name: "LOAD16", code: 0x81, operand: 2, group: "memory", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [value]", flags: [], memory: { access: "read", width: 2 }, doc: "Load 16-bit from address" },
  { name: "LOAD32", code: 0x82, operand: 2, group: "memory", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [value]", flags: [], memory: { access: "read", width: 4 }, doc: "Load 32-bit from address" },
  { name: "LOAD64", code: 0x83, operand: 2, group: "memory", pops: 0, pushes: 2, minDepth: 0, effect: "[] -> [low high]", flags: [], memory: { access: "read", width: 8 }, doc: "Load 64-bit from address" },
  { name: "STORE8", code: 0x84, operand: 2, group: "memory", pops: 1, pushes: 0, minDepth: 1, effect: "[value] -> []", flags: [], memory: { access: "write", width: 1 }, doc: "Store 8-bit to address" },
  { name: "STORE16", code: 0x85, operand: 2, group: "memory", pops: 1, pushes: 0, minDepth: 1, effect: "[value] -> []", flags: [], memory: { access: "write", width: 2 }, doc: "Store 16-bit to address" },
  { name: "STORE32", code: 0x86, operand: 2, group: "memory", pops: 1, pushes: 0, minDepth: 1, effect: "[value] -> []", flags: [], memory: { access: "write", width: 4 }, doc: "Store 32-bit to address" },
  { name: "STORE64", code: 0x87, operand: 2, group: "memory", pops: 2, pushes: 0, minDepth: 2, effect: "[low high] -> []", flags: [], memory: { access: "write", width: 8 }, doc: "Store 64-bit to address" },
  { name: "PUSH16", code: 0x88, operand: 2, group: "push16", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [imm]", flags: [], doc: "Push 16-bit immediate (sign-extended)" },
  { name: "JMP", code: 0x90, operand: 2, group: "jump16", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: ["absolute", "terminates"], doc: "Unconditional jump" },
  { name: "JZ", code: 0x91, operand: 2, group: "jump16", pops: 1, pushes: 0, minDepth: 1, effect: "[cond] -> []", flags: ["absolute"], doc: "Jump if zero (false)" },
  { name: "JNZ", code: 0x92, operand: 2, group: "jump16", pops: 1, pushes: 0, minDepth: 1, effect: "[cond] -> []", flags: ["absolute"], doc: "Jump if not zero (true)" },
  { name: "CALL", code: 0x93, operand: 2, group: "jump16", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: ["absolute", "call"], doc: "Call subroutine" },
  { name: "RET", code: 0x94, operand: 0, group: "jump16", pops: 0, pushes: 0, minDepth: 0, effect: "[] -> []", flags: ["terminates"], doc: "Return from subroutine" },
  { name: "I2F", code: 0xA0, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Integer to float" },
  { name: "F2I", code: 0xA1, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Float to integer" },
  { name: "I2B", code: 0xA2, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Integer to boolean" },
  { name: "EXT8", code: 0xA3, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Sign-extend 8-bit to 32-bit" },
  { name: "EXT16", code: 0xA4, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Sign-extend 16-bit to 32-bit" },
  { name: "ZEXT8", code: 0xA5, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Zero-extend 8-bit to 32-bit" },
  { name: "ZEXT16", code: 0xA6, operand: 0, group: "conversion", pops: 1, pushes: 1, minDepth: 1, effect: "[a] -> [r]", flags: [], doc: "Zero-extend 16-bit to 32-bit" },
  { name: "PUSH32", code: 0xC0, operand: 4, group: "push32", pops: 0, pushes: 1, minDepth: 0, effect: "[] -> [imm]", flags: [], doc: "Push 32-bit immediate" },
  { name: "COMM_EXEC", code: 0xD0, operand: 4, group: "comm", pops: 1, pushes: 0, minDepth: 1, effect: "[base] -> []", flags: ["comm"], doc: "Execute/update Comm FB; pop base addr from stack" },
  { name: "COMM_STATUS", code: 0xD1, operand: 4, group: "comm", pops: 1, pushes: 1, minDepth: 1, effect: "[base] -> [status]", flags: ["comm"], doc: "Push status word for a kind to stack" },
  { name: "COMM_RESET", code: 0xD2, operand: 4, group: "comm", pops: 1, pushes: 0, minDepth: 1, effect: "[base] -> []", flags: ["comm"], doc: "Reset FSM for Comm FB; pop base addr from stack" },
];

/**
 * Operand size in bytes for an opcode value (the C zplc_opcode_operand_size).
 * Follows the encoding ranges; the exceptions carry no operand.
 */
export function getOperandSize(opcode: number): number {
  if (opcode === 0x94) return 0; // RET
  if (opcode >= 0xA0 && opcode <= 0xA6) return 0; // I2F..ZEXT16
  if (opcode <= 0x3F) return 0;
  if (opcode <= 0x7F) return 1;
  if (opcode <= 0xBF) return 2;
  return 4;
}

const OPCODE_FLAGS = new Map<number, readonly string[]>(OPCODE_TABLE.map((entry) => [entry.code, entry.flags]));

/** True when the opcode has the flag in the opcode table. */
export function opcodeHasFlag(opcode: number, flag: string): boolean {
  return OPCODE_FLAGS.get(opcode)?.includes(flag) ?? false;
}

/** zplc_vm_error_t: faults and run states of the VM, in code order. */
export const VM_ERRORS = [
  { name: "ZPLC_VM_OK", code: 0x00, doc: "No error" },
  { name: "ZPLC_VM_STACK_OVERFLOW", code: 0x01, doc: "Evaluation stack full" },
  { name: "ZPLC_VM_STACK_UNDERFLOW", code: 0x02, doc: "Pop from empty stack" },
  { name: "ZPLC_VM_DIV_BY_ZERO", code: 0x03, doc: "Division by zero" },
  { name: "ZPLC_VM_INVALID_OPCODE", code: 0x04, doc: "Unknown instruction" },
  { name: "ZPLC_VM_OUT_OF_BOUNDS", code: 0x05, doc: "Memory access violation" },
  { name: "ZPLC_VM_CALL_OVERFLOW", code: 0x06, doc: "Call stack full" },
  { name: "ZPLC_VM_INVALID_JUMP", code: 0x07, doc: "Jump to invalid address" },
  { name: "ZPLC_VM_WATCHDOG", code: 0x08, doc: "Execution time exceeded" },
  { name: "ZPLC_VM_HALTED", code: 0x09, doc: "Execution stopped normally" },
  { name: "ZPLC_VM_PAUSED", code: 0x0A, doc: "Paused at breakpoint (debugger)" },
] as const;

/** zplc_vm_flags_t: VM status flag masks. */
export const VM_FLAGS = [
  { name: "ZPLC_VM_FLAG_ZERO", code: 0x01, doc: "Last result was zero" },
  { name: "ZPLC_VM_FLAG_CARRY", code: 0x02, doc: "Arithmetic carry" },
  { name: "ZPLC_VM_FLAG_OVERFLOW", code: 0x04, doc: "Arithmetic overflow" },
  { name: "ZPLC_VM_FLAG_NEGATIVE", code: 0x08, doc: "Last result was negative" },
] as const;

/** Loader verification result codes (zero is success, negative is a refusal). */
export const LOADER_ERRORS = [
  { name: "ZPLC_LOADER_OK", code: 0, doc: "Verified" },
  { name: "ZPLC_LOADER_ERR_MAGIC", code: -1, doc: "Wrong magic number" },
  { name: "ZPLC_LOADER_ERR_VERSION", code: -2, doc: "ISA version differs from the loader version" },
  { name: "ZPLC_LOADER_ERR_SIZE", code: -3, doc: "A size or count field is inconsistent with the file, or a reserved word is not zero" },
  { name: "ZPLC_LOADER_ERR_NO_CODE", code: -4, doc: "No CODE segment" },
  { name: "ZPLC_LOADER_ERR_CRC32", code: -6, doc: "CRC32 mismatch" },
  { name: "ZPLC_LOADER_ERR_FLAGS", code: -7, doc: "Header flags are not supported" },
  { name: "ZPLC_LOADER_ERR_SEGMENT", code: -8, doc: "Segment table entry is invalid, repeated or of an unsupported type" },
  { name: "ZPLC_LOADER_ERR_ENTRY_POINT", code: -9, doc: "Entry point is not an instruction boundary" },
  { name: "ZPLC_LOADER_ERR_WORKSPACE", code: -10, doc: "Verifier workspace is missing or too small" },
  { name: "ZPLC_LOADER_ERR_OPCODE", code: -11, doc: "Unknown opcode or truncated instruction" },
  { name: "ZPLC_LOADER_ERR_CONTROL_FLOW", code: -12, doc: "Jump target is not an instruction boundary, or the code falls through its end" },
  { name: "ZPLC_LOADER_ERR_MEMORY", code: -13, doc: "Static memory access outside the writable regions" },
  { name: "ZPLC_LOADER_ERR_TASK", code: -14, doc: "Task definition is invalid or there are too many tasks" },
  { name: "ZPLC_LOADER_ERR_TAGS", code: -15, doc: "Tag entry is invalid" },
  { name: "ZPLC_LOADER_ERR_COMM", code: -16, doc: "Communication function-block kind is NONE or at or above the kind limit" },
] as const;

/** Every communication function-block kind identifier of the core (zplc_comm_fb_kind_t). */
export const COMM_KIND = {
  NONE: 0x0000,
  MB_READ_HREG: 0x0001,
  MB_WRITE_HREG: 0x0002,
  MB_READ_COIL: 0x0003,
  MB_WRITE_COIL: 0x0004,
  MQTT_CONNECT: 0x000A,
  MQTT_PUBLISH: 0x000B,
  MQTT_SUBSCRIBE: 0x000C,
  COMM_STATUS: 0x0014,
  AZURE_C2D_RECV: 0x0020,
  AZURE_DPS_PROV: 0x0021,
  AZURE_EG_PUB: 0x0022,
  AWS_FLEET_PROV: 0x0030,
  SPB_REBIRTH: 0x0040,
} as const;

/** Kinds at or above this value are refused by the loader and by handler registration. */
export const COMM_KIND_MAX = 0x00FF;

/** The kinds that have a function-block layout. */
export const COMM_FB_KIND = {
  MB_READ_HREG: 0x0001,
  MB_WRITE_HREG: 0x0002,
  MB_READ_COIL: 0x0003,
  MB_WRITE_COIL: 0x0004,
  MQTT_CONNECT: 0x000A,
  MQTT_PUBLISH: 0x000B,
  MQTT_SUBSCRIBE: 0x000C,
  AZURE_C2D_RECV: 0x0020,
  AZURE_DPS_PROV: 0x0021,
  AZURE_EG_PUB: 0x0022,
  AWS_FLEET_PROV: 0x0030,
  SPB_REBIRTH: 0x0040,
} as const;

/** Communication status codes written to FB.STATUS. */
export const COMM_STATUS_CODE = {
  OK: 0,
  BUSY: 1,
  TIMEOUT: 2,
  NO_HANDLER: 3,
  NOT_CONNECTED: 4,
  QUEUE_FULL: 5,
  INVALID_ADDR: 6,
  STRING_OVERFLOW: 7,
  PROTO_ERROR: 8,
  AUTH_FAILED: 9,
  UNKNOWN: 255,
} as const;

export interface CommBlockMember {
  readonly name: string;
  /** IEC type name of the member (BOOL, USINT, UINT, DINT, STRING). */
  readonly type: string;
  /** Byte offset from the instance base address. */
  readonly offset: number;
  /** Bytes the compiler reserves for the member type. */
  readonly size: number;
  readonly direction: 'in' | 'out';
}

export interface CommBlockInfo {
  readonly name: string;
  readonly kind: number;
  /** Instance size in bytes: what the core allocates and the loader checks. */
  readonly size: number;
  readonly doc: string;
  readonly members: readonly CommBlockMember[];
}

/** Function-block layouts: kind, instance size and member offsets. */
export const COMM_BLOCKS: readonly CommBlockInfo[] = [
  { name: "MB_READ_HREG", kind: 0x0001, size: 110, doc: "Modbus read holding registers; COUNT registers requested, VALUE is the first register slot", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "PROTO", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "SLAVE_ID", type: "UINT", offset: 9, size: 2, direction: "in" },
    { name: "ADDR", type: "UINT", offset: 11, size: 2, direction: "in" },
    { name: "COUNT", type: "UINT", offset: 13, size: 2, direction: "in" },
    { name: "VALUE", type: "UINT", offset: 15, size: 2, direction: "out" },
    { name: "HOST", type: "STRING", offset: 18, size: 85, direction: "in" },
    { name: "PORT", type: "UINT", offset: 103, size: 2, direction: "in" },
  ] },
  { name: "MB_WRITE_HREG", kind: 0x0002, size: 110, doc: "Modbus write holding registers; VALUE is the first write slot", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "PROTO", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "SLAVE_ID", type: "UINT", offset: 9, size: 2, direction: "in" },
    { name: "ADDR", type: "UINT", offset: 11, size: 2, direction: "in" },
    { name: "COUNT", type: "UINT", offset: 13, size: 2, direction: "in" },
    { name: "VALUE", type: "UINT", offset: 15, size: 2, direction: "in" },
    { name: "HOST", type: "STRING", offset: 18, size: 85, direction: "in" },
    { name: "PORT", type: "UINT", offset: 103, size: 2, direction: "in" },
  ] },
  { name: "MB_READ_COIL", kind: 0x0003, size: 110, doc: "Modbus read coils", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "PROTO", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "SLAVE_ID", type: "UINT", offset: 9, size: 2, direction: "in" },
    { name: "ADDR", type: "UINT", offset: 11, size: 2, direction: "in" },
    { name: "COUNT", type: "UINT", offset: 13, size: 2, direction: "in" },
    { name: "VALUE", type: "BOOL", offset: 15, size: 1, direction: "out" },
    { name: "HOST", type: "STRING", offset: 18, size: 85, direction: "in" },
    { name: "PORT", type: "UINT", offset: 103, size: 2, direction: "in" },
  ] },
  { name: "MB_WRITE_COIL", kind: 0x0004, size: 110, doc: "Modbus write coils", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "PROTO", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "SLAVE_ID", type: "UINT", offset: 9, size: 2, direction: "in" },
    { name: "ADDR", type: "UINT", offset: 11, size: 2, direction: "in" },
    { name: "COUNT", type: "UINT", offset: 13, size: 2, direction: "in" },
    { name: "VALUE", type: "BOOL", offset: 15, size: 1, direction: "in" },
    { name: "HOST", type: "STRING", offset: 18, size: 85, direction: "in" },
    { name: "PORT", type: "UINT", offset: 103, size: 2, direction: "in" },
  ] },
  { name: "MQTT_CONNECT", kind: 0x000A, size: 12, doc: "MQTT connect", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "PROFILE", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "CONNECTED", type: "BOOL", offset: 9, size: 1, direction: "out" },
  ] },
  { name: "MQTT_PUBLISH", kind: 0x000B, size: 190, doc: "MQTT publish", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "QOS", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "RETAIN", type: "BOOL", offset: 9, size: 1, direction: "in" },
    { name: "TOPIC", type: "STRING", offset: 12, size: 85, direction: "in" },
    { name: "PAYLOAD", type: "STRING", offset: 97, size: 85, direction: "in" },
  ] },
  { name: "MQTT_SUBSCRIBE", kind: 0x000C, size: 190, doc: "MQTT subscribe; PAYLOAD is an output", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "QOS", type: "USINT", offset: 8, size: 1, direction: "in" },
    { name: "VALID", type: "BOOL", offset: 9, size: 1, direction: "out" },
    { name: "TOPIC", type: "STRING", offset: 12, size: 85, direction: "in" },
    { name: "PAYLOAD", type: "STRING", offset: 97, size: 85, direction: "out" },
  ] },
  { name: "AZURE_C2D_RECV", kind: 0x0020, size: 94, doc: "Azure cloud-to-device receive", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "PAYLOAD", type: "STRING", offset: 8, size: 85, direction: "out" },
    { name: "VALID", type: "BOOL", offset: 93, size: 1, direction: "out" },
  ] },
  { name: "AZURE_DPS_PROV", kind: 0x0021, size: 201, doc: "Azure DPS provisioning", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "DEVICE_ID", type: "STRING", offset: 8, size: 85, direction: "in" },
    { name: "ASSIGNED_HUB", type: "STRING", offset: 73, size: 85, direction: "out" },
  ] },
  { name: "AZURE_EG_PUB", kind: 0x0022, size: 266, doc: "Azure Event Grid publish", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "TOPIC", type: "STRING", offset: 8, size: 85, direction: "in" },
    { name: "EVENT_TYPE", type: "STRING", offset: 73, size: 85, direction: "in" },
    { name: "PAYLOAD", type: "STRING", offset: 138, size: 85, direction: "in" },
  ] },
  { name: "AWS_FLEET_PROV", kind: 0x0030, size: 137, doc: "AWS fleet provisioning", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
    { name: "TEMPLATE_NAME", type: "STRING", offset: 8, size: 85, direction: "in" },
    { name: "THING_NAME", type: "STRING", offset: 73, size: 85, direction: "out" },
  ] },
  { name: "SPB_REBIRTH", kind: 0x0040, size: 8, doc: "Sparkplug B rebirth; a rising EN triggers REBIRTH", members: [
    { name: "EN", type: "BOOL", offset: 0, size: 1, direction: "in" },
    { name: "BUSY", type: "BOOL", offset: 1, size: 1, direction: "out" },
    { name: "DONE", type: "BOOL", offset: 2, size: 1, direction: "out" },
    { name: "ERROR", type: "BOOL", offset: 3, size: 1, direction: "out" },
    { name: "STATUS", type: "DINT", offset: 4, size: 4, direction: "out" },
  ] },
];

