/**
 * @file zplc_isa.h
 * @brief ZPLC Virtual Machine Instruction Set Architecture Definitions
 *
 * SPDX-License-Identifier: MIT
 *
 * This header defines the binary format and instruction set for the ZPLC VM.
 * It is the contract between the compiler (IDE) and runtime (VM).
 *
 * See docs/ISA.md for the complete specification.
 *
 * @note All structures use explicit packing for cross-platform binary
 *       compatibility. All multi-byte values are little-endian.
 */

#ifndef ZPLC_ISA_H
#define ZPLC_ISA_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Magic Number and Version
 * ============================================================================
 */

/* >>> GENERATED (tools/contract/generate.py): version. Do not edit. >>> */
/**
 * @brief Magic number for .zplc files.
 *
 * When stored in little-endian format and viewed in a hex dump,
 * the bytes read: 5A 50 4C 43 = "ZPLC" in ASCII.
 *
 * On little-endian systems: uint32_t magic = 0x434C505A
 * Memory layout: [0x5A][0x50][0x4C][0x43] = "ZPLC"
 */
#define ZPLC_MAGIC 0x434C505AU

/** @brief Current ISA major version */
#define ZPLC_VERSION_MAJOR 1

/** @brief Current ISA minor version */
#define ZPLC_VERSION_MINOR 0

/**
 * @brief Draft contract counter (CMP-052).
 *
 * Increases by one with every change of an opcode, layout, size or code until the contract freeze. The compiler writes it in header word 28 of every artifact and the loader refuses an artifact whose counter differs from this value (ZPLC_LOADER_ERR_DRAFT). 0 is what an artifact built before the counter carries and is never accepted.
 */
#define ZPLC_DRAFT_COUNTER 2U
/* <<< END GENERATED: version <<< */

/* ============================================================================
 * Memory Layout Constants
 * ============================================================================
 *
 * These constants define the VM memory layout. When building with Zephyr,
 * the sizes can be overridden via Kconfig. IPI/OPI bases and sizes are
 * fixed by the ISA specification.
 */

/* >>> GENERATED (tools/contract/generate.py): memory. Do not edit. >>> */
/** @brief Base address of Input Process Image */
#define ZPLC_MEM_IPI_BASE 0x0000U

/** @brief Size of Input Process Image (4 KB, fixed by spec) */
#define ZPLC_MEM_IPI_SIZE 0x1000U

/** @brief Base address of Output Process Image */
#define ZPLC_MEM_OPI_BASE 0x1000U

/** @brief Size of Output Process Image (4 KB, fixed by spec) */
#define ZPLC_MEM_OPI_SIZE 0x1000U

/** @brief Base address of Work Memory */
#define ZPLC_MEM_WORK_BASE 0x2000U

/** @brief Size of Work Memory (default 8 KB, configurable via Kconfig) */
#ifdef CONFIG_ZPLC_WORK_MEMORY_SIZE
#define ZPLC_MEM_WORK_SIZE CONFIG_ZPLC_WORK_MEMORY_SIZE
#else
#define ZPLC_MEM_WORK_SIZE 0x2000U
#endif

/** @brief Base address of Retentive Memory */
#define ZPLC_MEM_RETAIN_BASE 0x4000U

/** @brief Size of Retentive Memory (default 4 KB, configurable via Kconfig) */
#ifdef CONFIG_ZPLC_RETAIN_MEMORY_SIZE
#define ZPLC_MEM_RETAIN_SIZE CONFIG_ZPLC_RETAIN_MEMORY_SIZE
#else
#define ZPLC_MEM_RETAIN_SIZE 0x1000U
#endif

/** @brief Base address of Code Segment */
#define ZPLC_MEM_CODE_BASE 0x5000U

/** @brief Maximum code size (default 44 KB, configurable via Kconfig) */
#ifdef CONFIG_ZPLC_CODE_SIZE_MAX
#define ZPLC_MEM_CODE_SIZE CONFIG_ZPLC_CODE_SIZE_MAX
#else
#define ZPLC_MEM_CODE_SIZE 0xB000U
#endif

/** @brief Maximum number of variable tags supported */
#ifndef ZPLC_MAX_TAGS
#define ZPLC_MAX_TAGS 64
#endif

/** @brief Maximum evaluation stack depth (configurable via Kconfig) */
#ifdef CONFIG_ZPLC_STACK_DEPTH
#define ZPLC_STACK_MAX_DEPTH CONFIG_ZPLC_STACK_DEPTH
#else
#define ZPLC_STACK_MAX_DEPTH 256
#endif

/** @brief Maximum call stack depth (configurable via Kconfig) */
#ifdef CONFIG_ZPLC_CALL_STACK_DEPTH
#define ZPLC_CALL_STACK_MAX CONFIG_ZPLC_CALL_STACK_DEPTH
#else
#define ZPLC_CALL_STACK_MAX 32
#endif

/** @brief Maximum number of breakpoints (configurable via Kconfig) */
#ifdef CONFIG_ZPLC_MAX_BREAKPOINTS
#define ZPLC_MAX_BREAKPOINTS CONFIG_ZPLC_MAX_BREAKPOINTS
#else
#define ZPLC_MAX_BREAKPOINTS 16
#endif
/* <<< END GENERATED: memory <<< */

/* ============================================================================
 * System Information Registers (Reserved IPI Addresses)
 * ============================================================================
 *
 * The last 16 bytes of IPI (0x0FF0-0x0FFF) are reserved for system information.
 * These are written by the scheduler/runtime and readable by PLC programs.
 * This follows common PLC practice (similar to %SW system words in IEC
 * 61131-3).
 */

/* >>> GENERATED (tools/contract/generate.py): system-registers. Do not edit. >>> */
/** @brief Offset within IPI for system registers (last 16 bytes) */
#define ZPLC_SYS_REG_OFFSET 0x0FF0U

/** @brief System register: Last cycle execution time in microseconds (DINT, 4 bytes) */
#define ZPLC_SYS_CYCLE_TIME (ZPLC_MEM_IPI_BASE + 0x0FF0U)

/** @brief System register: System uptime in milliseconds (UDINT, 4 bytes) */
#define ZPLC_SYS_UPTIME (ZPLC_MEM_IPI_BASE + 0x0FF4U)

/** @brief System register: Current task ID (BYTE, 1 byte) */
#define ZPLC_SYS_TASK_ID (ZPLC_MEM_IPI_BASE + 0x0FF8U)

/** @brief System register: System flags (BYTE, 1 byte) */
#define ZPLC_SYS_FLAGS (ZPLC_MEM_IPI_BASE + 0x0FF9U)

/** @brief System flags: First scan bit (set on first cycle after start) */
#define ZPLC_SYS_FLAG_FIRST_SCAN 0x01

/** @brief Reserved system flag; not produced by current runtimes. */
#define ZPLC_SYS_FLAG_WDG_WARN 0x02

/** @brief System flags: Scheduler is running */
#define ZPLC_SYS_FLAG_RUNNING 0x04
/* <<< END GENERATED: system-registers <<< */

/* Bytes 0x0FFA-0x0FFF reserved for future use */

/* ============================================================================
 * Data Types (IEC 61131-3 Mapping)
 * ============================================================================
 */

/* >>> GENERATED (tools/contract/generate.py): data-types. Do not edit. >>> */
/**
 * @brief IEC 61131-3 data type identifiers.
 *
 * These match the type IDs used in the symbol table and I/O map.
 */
typedef enum {
  ZPLC_TYPE_NONE = 0x00, /**< Invalid/unspecified */
  ZPLC_TYPE_BOOL = 0x01, /**< Boolean (1 byte) */
  ZPLC_TYPE_SINT = 0x02, /**< Signed 8-bit integer */
  ZPLC_TYPE_INT = 0x04, /**< Signed 16-bit integer */
  ZPLC_TYPE_DINT = 0x06, /**< Signed 32-bit integer */
  ZPLC_TYPE_LINT = 0x08, /**< Signed 64-bit integer */
  ZPLC_TYPE_USINT = 0x03, /**< Unsigned 8-bit integer */
  ZPLC_TYPE_UINT = 0x05, /**< Unsigned 16-bit integer */
  ZPLC_TYPE_UDINT = 0x07, /**< Unsigned 32-bit integer */
  ZPLC_TYPE_ULINT = 0x09, /**< Unsigned 64-bit integer */
  ZPLC_TYPE_REAL = 0x0A, /**< 32-bit IEEE 754 float */
  ZPLC_TYPE_LREAL = 0x0B, /**< 64-bit IEEE 754 double */
  ZPLC_TYPE_TIME = 0x0C, /**< Time duration (ms as DINT) */
  ZPLC_TYPE_BYTE = 0x10, /**< 8-bit bit string */
  ZPLC_TYPE_WORD = 0x11, /**< 16-bit bit string */
  ZPLC_TYPE_DWORD = 0x12, /**< 32-bit bit string */
  ZPLC_TYPE_LWORD = 0x13, /**< 64-bit bit string */
  ZPLC_TYPE_STRING = 0x20 /**< Variable-length string (IEC 61131-3) */
} zplc_data_type_t;

/**
 * @brief STRING memory layout.
 *
 * Strings in ZPLC use a safe, bounds-checked layout:
 *   Offset 0: current_length (uint16_t) - actual string length
 *   Offset 2: max_capacity (uint16_t) - maximum allowed length
 *   Offset 4: data[max_capacity+1] - null-terminated character data
 *
 * Total size = 4 + max_capacity + 1 bytes
 *
 * Example: STRING[80] uses 85 bytes (4 header + 80 chars + 1 null)
 */
#define ZPLC_STRING_LEN_OFFSET 0
#define ZPLC_STRING_CAP_OFFSET 2
#define ZPLC_STRING_DATA_OFFSET 4
#define ZPLC_STRING_DEFAULT_SIZE 80
#define ZPLC_STRING_MAX_SIZE 255
/* <<< END GENERATED: data-types <<< */

/* ============================================================================
 * Opcodes
 * ============================================================================
 * Encoding:
 *   0x00-0x3F: No operand (1 byte total)
 *   0x40-0x7F: 8-bit operand (2 bytes total)
 *   0x80-0xBF: 16-bit operand (3 bytes total)
 *   0xC0-0xFF: 32-bit operand (5 bytes total)
 */

/* >>> GENERATED (tools/contract/generate.py): opcodes. Do not edit. >>> */
/**
 * @brief VM instruction opcodes.
 */
typedef enum {
  /* ===== System operations (0x00-0x03) ===== */
  OP_NOP = 0x00, /**< No operation */
  OP_HALT = 0x01, /**< Stop execution */
  OP_BREAK = 0x02, /**< Debugger breakpoint */
  OP_GET_TICKS = 0x03, /**< Push system tick (ms) to stack */

  /* ===== Stack operations (0x10-0x14) ===== */
  OP_DUP = 0x10, /**< Duplicate top of stack */
  OP_DROP = 0x11, /**< Discard top of stack */
  OP_SWAP = 0x12, /**< Swap top two elements */
  OP_OVER = 0x13, /**< Copy second element to top */
  OP_ROT = 0x14, /**< Rotate top three elements */

  /* ===== Indirect memory access (0x15-0x1A) ===== */
  OP_LOADI8 = 0x15, /**< Load 8-bit from address on stack */
  OP_LOADI32 = 0x16, /**< Load 32-bit from address on stack */
  OP_STOREI8 = 0x17, /**< Store 8-bit to address on stack: [addr val] -> [] */
  OP_STOREI32 = 0x18, /**< Store 32-bit to address on stack: [addr val] -> [] */
  OP_LOADI16 = 0x19, /**< Load 16-bit from address on stack */
  OP_STOREI16 = 0x1A, /**< Store 16-bit to address on stack: [addr val] -> [] */

  /* ===== String operations (0x1B-0x1F) ===== */
  OP_STRLEN = 0x1B, /**< Get string length: [str_addr] -> [length] */
  OP_STRCPY = 0x1C, /**< Copy string: [src_addr dst_addr] -> [] (safe, bounds-checked) */
  OP_STRCAT = 0x1D, /**< Concatenate: [src_addr dst_addr] -> [] (safe, bounds-checked) */
  OP_STRCMP = 0x1E, /**< Compare strings: [addr1 addr2] -> [result] (-1, 0, 1) */
  OP_STRCLR = 0x1F, /**< Clear string: [str_addr] -> [] */

  /* ===== Integer arithmetic (0x20-0x26) ===== */
  OP_ADD = 0x20, /**< Integer addition */
  OP_SUB = 0x21, /**< Integer subtraction */
  OP_MUL = 0x22, /**< Integer multiplication */
  OP_DIV = 0x23, /**< Integer division */
  OP_MOD = 0x24, /**< Integer modulo */
  OP_NEG = 0x25, /**< Integer negation */
  OP_ABS = 0x26, /**< Absolute value */

  /* ===== Float arithmetic (0x28-0x2D) ===== */
  OP_ADDF = 0x28, /**< Float addition */
  OP_SUBF = 0x29, /**< Float subtraction */
  OP_MULF = 0x2A, /**< Float multiplication */
  OP_DIVF = 0x2B, /**< Float division */
  OP_NEGF = 0x2C, /**< Float negation */
  OP_ABSF = 0x2D, /**< Float absolute value */

  /* ===== Logical/bitwise operations (0x30-0x36) ===== */
  OP_AND = 0x30, /**< Bitwise AND */
  OP_OR = 0x31, /**< Bitwise OR */
  OP_XOR = 0x32, /**< Bitwise XOR */
  OP_NOT = 0x33, /**< Bitwise NOT */
  OP_SHL = 0x34, /**< Shift left */
  OP_SHR = 0x35, /**< Shift right (logical) */
  OP_SAR = 0x36, /**< Shift right (arithmetic) */

  /* ===== Comparison operations (0x38-0x3F) ===== */
  OP_EQ = 0x38, /**< Equal */
  OP_NE = 0x39, /**< Not equal */
  OP_LT = 0x3A, /**< Less than (signed) */
  OP_LE = 0x3B, /**< Less or equal (signed) */
  OP_GT = 0x3C, /**< Greater than (signed) */
  OP_GE = 0x3D, /**< Greater or equal (signed) */
  OP_LTU = 0x3E, /**< Less than (unsigned) */
  OP_GTU = 0x3F, /**< Greater than (unsigned) */

  /* ===== Push and pick with 8-bit operand (0x40-0x41) ===== */
  OP_PUSH8 = 0x40, /**< Push 8-bit immediate (sign-extended) */
  OP_PICK = 0x41, /**< Copy nth stack element to top: PICK n copies stack[sp-1-n] */

  /* ===== Relative jumps with 8-bit operand (0x50-0x52) ===== */
  OP_JR = 0x50, /**< Relative jump (signed 8-bit offset) */
  OP_JRZ = 0x51, /**< Relative jump if zero */
  OP_JRNZ = 0x52, /**< Relative jump if not zero */

  /* ===== Load/store with 16-bit address (0x80-0x87) ===== */
  OP_LOAD8 = 0x80, /**< Load 8-bit from address */
  OP_LOAD16 = 0x81, /**< Load 16-bit from address */
  OP_LOAD32 = 0x82, /**< Load 32-bit from address */
  OP_LOAD64 = 0x83, /**< Load 64-bit from address */
  OP_STORE8 = 0x84, /**< Store 8-bit to address */
  OP_STORE16 = 0x85, /**< Store 16-bit to address */
  OP_STORE32 = 0x86, /**< Store 32-bit to address */
  OP_STORE64 = 0x87, /**< Store 64-bit to address */

  /* ===== Push with 16-bit operand (0x88) ===== */
  OP_PUSH16 = 0x88, /**< Push 16-bit immediate (sign-extended) */

  /* ===== Control flow with 16-bit address (0x90-0x94) ===== */
  OP_JMP = 0x90, /**< Unconditional jump */
  OP_JZ = 0x91, /**< Jump if zero (false) */
  OP_JNZ = 0x92, /**< Jump if not zero (true) */
  OP_CALL = 0x93, /**< Call subroutine */
  OP_RET = 0x94, /**< Return from subroutine */

  /* ===== Type conversion (0xA0-0xA6) ===== */
  OP_I2F = 0xA0, /**< Integer to float */
  OP_F2I = 0xA1, /**< Float to integer */
  OP_I2B = 0xA2, /**< Integer to boolean */
  OP_EXT8 = 0xA3, /**< Sign-extend 8-bit to 32-bit */
  OP_EXT16 = 0xA4, /**< Sign-extend 16-bit to 32-bit */
  OP_ZEXT8 = 0xA5, /**< Zero-extend 8-bit to 32-bit */
  OP_ZEXT16 = 0xA6, /**< Zero-extend 16-bit to 32-bit */

  /* ===== Push with 32-bit operand (0xC0) ===== */
  OP_PUSH32 = 0xC0, /**< Push 32-bit immediate */

  /* ===== Communication with 32-bit operand (0xD0-0xD2) ===== */
  OP_COMM_EXEC = 0xD0, /**< Execute/update Comm FB; pop base addr from stack */
  OP_COMM_STATUS = 0xD1, /**< Push status word for a kind to stack */
  OP_COMM_RESET = 0xD2 /**< Reset FSM for Comm FB; pop base addr from stack */
} zplc_opcode_t;

/**
 * @brief Opcode table as an X-macro, for code that has to enumerate the
 *        instruction set (names, tests, tools) without a hand-kept copy.
 *
 * Each entry is X(NAME, number, operand_bytes, pops, pushes, min_depth).
 * pops and pushes count the 32-bit stack words the instruction removes
 * and adds; min_depth is the number of words that must be on the stack.
 */
#define ZPLC_OPCODE_TABLE(X) \
  X(NOP, 0x00, 0, 0, 0, 0) \
  X(HALT, 0x01, 0, 0, 0, 0) \
  X(BREAK, 0x02, 0, 0, 0, 0) \
  X(GET_TICKS, 0x03, 0, 0, 1, 0) \
  X(DUP, 0x10, 0, 0, 1, 1) \
  X(DROP, 0x11, 0, 1, 0, 1) \
  X(SWAP, 0x12, 0, 0, 0, 2) \
  X(OVER, 0x13, 0, 0, 1, 2) \
  X(ROT, 0x14, 0, 0, 0, 3) \
  X(LOADI8, 0x15, 0, 1, 1, 1) \
  X(LOADI32, 0x16, 0, 1, 1, 1) \
  X(STOREI8, 0x17, 0, 2, 0, 2) \
  X(STOREI32, 0x18, 0, 2, 0, 2) \
  X(LOADI16, 0x19, 0, 1, 1, 1) \
  X(STOREI16, 0x1A, 0, 2, 0, 2) \
  X(STRLEN, 0x1B, 0, 1, 1, 1) \
  X(STRCPY, 0x1C, 0, 2, 0, 2) \
  X(STRCAT, 0x1D, 0, 2, 0, 2) \
  X(STRCMP, 0x1E, 0, 2, 1, 2) \
  X(STRCLR, 0x1F, 0, 1, 0, 1) \
  X(ADD, 0x20, 0, 2, 1, 2) \
  X(SUB, 0x21, 0, 2, 1, 2) \
  X(MUL, 0x22, 0, 2, 1, 2) \
  X(DIV, 0x23, 0, 2, 1, 2) \
  X(MOD, 0x24, 0, 2, 1, 2) \
  X(NEG, 0x25, 0, 1, 1, 1) \
  X(ABS, 0x26, 0, 1, 1, 1) \
  X(ADDF, 0x28, 0, 2, 1, 2) \
  X(SUBF, 0x29, 0, 2, 1, 2) \
  X(MULF, 0x2A, 0, 2, 1, 2) \
  X(DIVF, 0x2B, 0, 2, 1, 2) \
  X(NEGF, 0x2C, 0, 1, 1, 1) \
  X(ABSF, 0x2D, 0, 1, 1, 1) \
  X(AND, 0x30, 0, 2, 1, 2) \
  X(OR, 0x31, 0, 2, 1, 2) \
  X(XOR, 0x32, 0, 2, 1, 2) \
  X(NOT, 0x33, 0, 1, 1, 1) \
  X(SHL, 0x34, 0, 2, 1, 2) \
  X(SHR, 0x35, 0, 2, 1, 2) \
  X(SAR, 0x36, 0, 2, 1, 2) \
  X(EQ, 0x38, 0, 2, 1, 2) \
  X(NE, 0x39, 0, 2, 1, 2) \
  X(LT, 0x3A, 0, 2, 1, 2) \
  X(LE, 0x3B, 0, 2, 1, 2) \
  X(GT, 0x3C, 0, 2, 1, 2) \
  X(GE, 0x3D, 0, 2, 1, 2) \
  X(LTU, 0x3E, 0, 2, 1, 2) \
  X(GTU, 0x3F, 0, 2, 1, 2) \
  X(PUSH8, 0x40, 1, 0, 1, 0) \
  X(PICK, 0x41, 1, 0, 1, 1) \
  X(JR, 0x50, 1, 0, 0, 0) \
  X(JRZ, 0x51, 1, 1, 0, 1) \
  X(JRNZ, 0x52, 1, 1, 0, 1) \
  X(LOAD8, 0x80, 2, 0, 1, 0) \
  X(LOAD16, 0x81, 2, 0, 1, 0) \
  X(LOAD32, 0x82, 2, 0, 1, 0) \
  X(LOAD64, 0x83, 2, 0, 2, 0) \
  X(STORE8, 0x84, 2, 1, 0, 1) \
  X(STORE16, 0x85, 2, 1, 0, 1) \
  X(STORE32, 0x86, 2, 1, 0, 1) \
  X(STORE64, 0x87, 2, 2, 0, 2) \
  X(PUSH16, 0x88, 2, 0, 1, 0) \
  X(JMP, 0x90, 2, 0, 0, 0) \
  X(JZ, 0x91, 2, 1, 0, 1) \
  X(JNZ, 0x92, 2, 1, 0, 1) \
  X(CALL, 0x93, 2, 0, 0, 0) \
  X(RET, 0x94, 0, 0, 0, 0) \
  X(I2F, 0xA0, 0, 1, 1, 1) \
  X(F2I, 0xA1, 0, 1, 1, 1) \
  X(I2B, 0xA2, 0, 1, 1, 1) \
  X(EXT8, 0xA3, 0, 1, 1, 1) \
  X(EXT16, 0xA4, 0, 1, 1, 1) \
  X(ZEXT8, 0xA5, 0, 1, 1, 1) \
  X(ZEXT16, 0xA6, 0, 1, 1, 1) \
  X(PUSH32, 0xC0, 4, 0, 1, 0) \
  X(COMM_EXEC, 0xD0, 4, 1, 0, 1) \
  X(COMM_STATUS, 0xD1, 4, 1, 1, 1) \
  X(COMM_RESET, 0xD2, 4, 1, 0, 1)

/** @brief Number of defined opcodes. */
#define ZPLC_OPCODE_COUNT 78
/* <<< END GENERATED: opcodes <<< */

/* ============================================================================
 * Binary File Structures
 * ============================================================================
 * All structures are packed for binary compatibility.
 * All multi-byte fields are little-endian.
 */

/*
 * Portable packing pragma.
 * C99 doesn't have a standard way to pack structures.
 * We use compiler-specific pragmas.
 */
#if defined(__GNUC__) || defined(__clang__)
#define ZPLC_PACKED __attribute__((packed))
#elif defined(_MSC_VER)
#define ZPLC_PACKED
#pragma pack(push, 1)
#else
#define ZPLC_PACKED
#warning "Unknown compiler - struct packing may not work correctly"
#endif

/* >>> GENERATED (tools/contract/generate.py): container. Do not edit. >>> */
/**
 * @brief .zplc file header (32 bytes).
 *
 * This is the first structure in every .zplc file.
 */
typedef struct ZPLC_PACKED {
  uint32_t magic; /**< Magic number: ZPLC_MAGIC */
  uint16_t version_major; /**< Major version */
  uint16_t version_minor; /**< Minor version */
  uint32_t flags; /**< Feature flags */
  uint32_t crc32; /**< CRC32 of file (excluding this field) */
  uint32_t code_size; /**< Size of code segment (bytes) */
  uint32_t data_size; /**< Size of data segment (bytes) */
  uint16_t entry_point; /**< Code offset of main entry */
  uint16_t segment_count; /**< Number of segments */
  uint32_t draft_counter; /**< Draft contract counter: must equal ZPLC_DRAFT_COUNTER (0 = built before the counter) */
} zplc_file_header_t;

/** @brief Expected size of file header */
#define ZPLC_FILE_HEADER_SIZE 32

/* Layout check generated from the contract: dividing by zero in an enumerator breaks the build. */
enum { zplc_assert_sizeof_header = 1 / (sizeof(zplc_file_header_t) == 32U) };
enum { zplc_assert_offsetof_header_magic = 1 / (offsetof(zplc_file_header_t, magic) == 0U) };
enum { zplc_assert_offsetof_header_version_major = 1 / (offsetof(zplc_file_header_t, version_major) == 4U) };
enum { zplc_assert_offsetof_header_version_minor = 1 / (offsetof(zplc_file_header_t, version_minor) == 6U) };
enum { zplc_assert_offsetof_header_flags = 1 / (offsetof(zplc_file_header_t, flags) == 8U) };
enum { zplc_assert_offsetof_header_crc32 = 1 / (offsetof(zplc_file_header_t, crc32) == 12U) };
enum { zplc_assert_offsetof_header_code_size = 1 / (offsetof(zplc_file_header_t, code_size) == 16U) };
enum { zplc_assert_offsetof_header_data_size = 1 / (offsetof(zplc_file_header_t, data_size) == 20U) };
enum { zplc_assert_offsetof_header_entry_point = 1 / (offsetof(zplc_file_header_t, entry_point) == 24U) };
enum { zplc_assert_offsetof_header_segment_count = 1 / (offsetof(zplc_file_header_t, segment_count) == 26U) };
enum { zplc_assert_offsetof_header_draft_counter = 1 / (offsetof(zplc_file_header_t, draft_counter) == 28U) };

/** @brief File header flags. */
typedef enum {
  ZPLC_FLAG_HAS_DEBUG = (1U << 0), /**< Debug segment present */
  ZPLC_FLAG_HAS_SYMBOLS = (1U << 1), /**< Symbol table present */
  ZPLC_FLAG_HAS_RETAIN = (1U << 2), /**< Uses retentive memory */
  ZPLC_FLAG_SIGNED = (1U << 3) /**< Cryptographic signature */
} zplc_file_flags_t;

/** @brief Segment table entry (8 bytes). */
typedef struct ZPLC_PACKED {
  uint16_t type; /**< Segment type */
  uint16_t flags; /**< Segment-specific flags */
  uint32_t size; /**< Segment size (bytes) */
} zplc_segment_entry_t;

/** @brief Expected size of segment entry */
#define ZPLC_SEGMENT_ENTRY_SIZE 8

/* Layout check generated from the contract: dividing by zero in an enumerator breaks the build. */
enum { zplc_assert_sizeof_segment = 1 / (sizeof(zplc_segment_entry_t) == 8U) };
enum { zplc_assert_offsetof_segment_type = 1 / (offsetof(zplc_segment_entry_t, type) == 0U) };
enum { zplc_assert_offsetof_segment_flags = 1 / (offsetof(zplc_segment_entry_t, flags) == 2U) };
enum { zplc_assert_offsetof_segment_size = 1 / (offsetof(zplc_segment_entry_t, size) == 4U) };

/** @brief Segment types. */
typedef enum {
  ZPLC_SEG_CODE = 0x01, /**< Executable bytecode */
  ZPLC_SEG_DATA = 0x02, /**< Initialized data */
  ZPLC_SEG_BSS = 0x03, /**< Uninitialized data */
  ZPLC_SEG_RETAIN = 0x04, /**< Retentive variables */
  ZPLC_SEG_IOMAP = 0x05, /**< I/O mapping table */
  ZPLC_SEG_SYMTAB = 0x10, /**< Symbol table */
  ZPLC_SEG_DEBUG = 0x11, /**< Debug information */
  ZPLC_SEG_TASK = 0x20, /**< Task definitions */
  ZPLC_SEG_TAGS = 0x30 /**< Variable tags (networking metadata) */
} zplc_segment_type_t;

/** @brief Task definition (16 bytes). */
typedef struct ZPLC_PACKED {
  uint16_t id; /**< Task ID */
  uint8_t type; /**< Task type (cyclic, event, init) */
  uint8_t priority; /**< Priority (0=highest) */
  uint32_t interval_us; /**< Cycle time in microseconds */
  uint16_t entry_point; /**< Code offset */
  uint16_t stack_size; /**< Required stack depth */
  uint32_t reserved; /**< Reserved (must be 0) */
} zplc_task_def_t;

/** @brief Expected size of task definition */
#define ZPLC_TASK_DEF_SIZE 16

/* Layout check generated from the contract: dividing by zero in an enumerator breaks the build. */
enum { zplc_assert_sizeof_task = 1 / (sizeof(zplc_task_def_t) == 16U) };
enum { zplc_assert_offsetof_task_id = 1 / (offsetof(zplc_task_def_t, id) == 0U) };
enum { zplc_assert_offsetof_task_type = 1 / (offsetof(zplc_task_def_t, type) == 2U) };
enum { zplc_assert_offsetof_task_priority = 1 / (offsetof(zplc_task_def_t, priority) == 3U) };
enum { zplc_assert_offsetof_task_interval_us = 1 / (offsetof(zplc_task_def_t, interval_us) == 4U) };
enum { zplc_assert_offsetof_task_entry_point = 1 / (offsetof(zplc_task_def_t, entry_point) == 8U) };
enum { zplc_assert_offsetof_task_stack_size = 1 / (offsetof(zplc_task_def_t, stack_size) == 10U) };
enum { zplc_assert_offsetof_task_reserved = 1 / (offsetof(zplc_task_def_t, reserved) == 12U) };

/** @brief Task types. */
typedef enum {
  ZPLC_TASK_CYCLIC = 0, /**< Periodic execution */
  ZPLC_TASK_EVENT = 1, /**< Event-triggered */
  ZPLC_TASK_INIT = 2 /**< Run once at startup */
} zplc_task_type_t;

/** @brief I/O map entry (8 bytes). */
typedef struct ZPLC_PACKED {
  uint16_t var_addr; /**< Variable address in memory */
  uint8_t var_type; /**< Data type ID */
  uint8_t direction; /**< 0=Input, 1=Output */
  uint16_t channel; /**< Physical channel number */
  uint16_t flags; /**< Bit offset, invert, etc. */
} zplc_iomap_entry_t;

/** @brief Expected size of I/O map entry */
#define ZPLC_IOMAP_ENTRY_SIZE 8

/* Layout check generated from the contract: dividing by zero in an enumerator breaks the build. */
enum { zplc_assert_sizeof_iomap = 1 / (sizeof(zplc_iomap_entry_t) == 8U) };
enum { zplc_assert_offsetof_iomap_var_addr = 1 / (offsetof(zplc_iomap_entry_t, var_addr) == 0U) };
enum { zplc_assert_offsetof_iomap_var_type = 1 / (offsetof(zplc_iomap_entry_t, var_type) == 2U) };
enum { zplc_assert_offsetof_iomap_direction = 1 / (offsetof(zplc_iomap_entry_t, direction) == 3U) };
enum { zplc_assert_offsetof_iomap_channel = 1 / (offsetof(zplc_iomap_entry_t, channel) == 4U) };
enum { zplc_assert_offsetof_iomap_flags = 1 / (offsetof(zplc_iomap_entry_t, flags) == 6U) };

/** @brief I/O direction. */
typedef enum {
  ZPLC_IO_INPUT = 0, /**< Input (HAL -> VM) */
  ZPLC_IO_OUTPUT = 1 /**< Output (VM -> HAL) */
} zplc_io_direction_t;

/**
 * @brief Variable tag entry (8 bytes).
 * Used for mapping variables to communication protocols.
 */
typedef struct ZPLC_PACKED {
  uint16_t var_addr; /**< Memory address of the variable */
  uint8_t var_type; /**< Data type ID (zplc_data_type_t) */
  uint8_t tag_id; /**< Protocol/Tag identifier (1=Publish, 2=Modbus, etc.) */
  uint32_t value; /**< Parameter (Modbus address, or offset to string table) */
} zplc_tag_entry_t;

/** @brief Expected size of tag entry */
#define ZPLC_TAG_ENTRY_SIZE 8

/* Layout check generated from the contract: dividing by zero in an enumerator breaks the build. */
enum { zplc_assert_sizeof_tag = 1 / (sizeof(zplc_tag_entry_t) == 8U) };
enum { zplc_assert_offsetof_tag_var_addr = 1 / (offsetof(zplc_tag_entry_t, var_addr) == 0U) };
enum { zplc_assert_offsetof_tag_var_type = 1 / (offsetof(zplc_tag_entry_t, var_type) == 2U) };
enum { zplc_assert_offsetof_tag_tag_id = 1 / (offsetof(zplc_tag_entry_t, tag_id) == 3U) };
enum { zplc_assert_offsetof_tag_value = 1 / (offsetof(zplc_tag_entry_t, value) == 4U) };

/** @brief Tag identifiers. */
typedef enum {
  ZPLC_TAG_NONE = 0,
  ZPLC_TAG_PUBLISH = 1, /**< {publish} */
  ZPLC_TAG_MODBUS = 2, /**< {modbus:N} */
  ZPLC_TAG_SUBSCRIBE = 3 /**< {subscribe} */
} zplc_tag_id_t;
/* <<< END GENERATED: container <<< */

/* Restore packing for MSVC */
#if defined(_MSC_VER)
#pragma pack(pop)
#endif

/* ============================================================================
 * VM Runtime Structures (not packed - internal use only)
 * ============================================================================
 */

/* >>> GENERATED (tools/contract/generate.py): vm-status. Do not edit. >>> */
/** @brief VM error codes. */
typedef enum {
  ZPLC_VM_OK = 0x00, /**< No error */
  ZPLC_VM_STACK_OVERFLOW = 0x01, /**< Evaluation stack full */
  ZPLC_VM_STACK_UNDERFLOW = 0x02, /**< Pop from empty stack */
  ZPLC_VM_DIV_BY_ZERO = 0x03, /**< Division by zero */
  ZPLC_VM_INVALID_OPCODE = 0x04, /**< Unknown instruction */
  ZPLC_VM_OUT_OF_BOUNDS = 0x05, /**< Memory access violation */
  ZPLC_VM_CALL_OVERFLOW = 0x06, /**< Call stack full */
  ZPLC_VM_INVALID_JUMP = 0x07, /**< Jump to invalid address */
  ZPLC_VM_WATCHDOG = 0x08, /**< Execution time exceeded */
  ZPLC_VM_HALTED = 0x09, /**< Execution stopped normally */
  ZPLC_VM_PAUSED = 0x0A /**< Paused at breakpoint (debugger) */
} zplc_vm_error_t;

/** @brief VM status flags. */
typedef enum {
  ZPLC_VM_FLAG_ZERO = (1U << 0), /**< Last result was zero */
  ZPLC_VM_FLAG_CARRY = (1U << 1), /**< Arithmetic carry */
  ZPLC_VM_FLAG_OVERFLOW = (1U << 2), /**< Arithmetic overflow */
  ZPLC_VM_FLAG_NEGATIVE = (1U << 3) /**< Last result was negative */
} zplc_vm_flags_t;
/* <<< END GENERATED: vm-status <<< */

/**
 * @brief VM execution state.
 *
 * This structure holds the complete state of the virtual machine.
 * It's designed to be saveable/restorable for debugging.
 *
 * This legacy snapshot is populated field-by-field from zplc_vm_t.
 */
typedef struct {
  uint16_t pc;        /**< Program counter */
  uint16_t sp;        /**< Stack pointer */
  uint16_t bp;        /**< Base pointer */
  uint8_t call_depth; /**< Current call nesting */
  uint8_t flags;      /**< Status flags */
  uint8_t error;      /**< Last error code */
  uint8_t halted;     /**< Execution stopped */

  /* Debugger state */
  uint8_t paused;           /**< Paused at breakpoint */
  uint8_t breakpoint_count; /**< Number of active breakpoints */
  uint16_t breakpoints[ZPLC_MAX_BREAKPOINTS]; /**< Breakpoint PC addresses */

  uint32_t stack[ZPLC_STACK_MAX_DEPTH];     /**< Evaluation stack */
  uint16_t call_stack[ZPLC_CALL_STACK_MAX]; /**< Return addresses */
} zplc_vm_state_t;

/* ============================================================================
 * Instruction Encoding Helpers
 * ============================================================================
 */

/* >>> GENERATED (tools/contract/generate.py): opcode-helpers. Do not edit. >>> */
/**
 * @brief Get the operand size for an opcode.
 *
 * @param opcode The opcode byte.
 * @return Operand size in bytes (0, 1, 2, or 4).
 */
static inline uint8_t zplc_opcode_operand_size(uint8_t opcode) {
  if (opcode == OP_RET || (opcode >= OP_I2F && opcode <= OP_ZEXT16)) {
    return 0;
  }
  if (opcode <= 0x3F) {
    return 0; /* No operand */
  } else if (opcode <= 0x7F) {
    return 1; /* 8-bit operand */
  } else if (opcode <= 0xBF) {
    return 2; /* 16-bit operand */
  } else {
    return 4; /* 32-bit operand */
  }
}

/**
 * @brief Get the total instruction size for an opcode.
 *
 * @param opcode The opcode byte.
 * @return Total instruction size in bytes (1, 2, 3, or 5).
 */
static inline uint8_t zplc_opcode_instruction_size(uint8_t opcode) {
  return 1 + zplc_opcode_operand_size(opcode);
}

/**
 * @brief Check if an opcode is valid.
 *
 * @param opcode The opcode byte.
 * @return 1 if valid, 0 if invalid.
 */
static inline int zplc_opcode_is_valid(uint8_t opcode) {
  switch (opcode) {
  /* System operations */
  case OP_NOP:
  case OP_HALT:
  case OP_BREAK:
  case OP_GET_TICKS:
  /* Stack operations */
  case OP_DUP:
  case OP_DROP:
  case OP_SWAP:
  case OP_OVER:
  case OP_ROT:
  /* Indirect memory access */
  case OP_LOADI8:
  case OP_LOADI32:
  case OP_STOREI8:
  case OP_STOREI32:
  case OP_LOADI16:
  case OP_STOREI16:
  /* String operations */
  case OP_STRLEN:
  case OP_STRCPY:
  case OP_STRCAT:
  case OP_STRCMP:
  case OP_STRCLR:
  /* Integer arithmetic */
  case OP_ADD:
  case OP_SUB:
  case OP_MUL:
  case OP_DIV:
  case OP_MOD:
  case OP_NEG:
  case OP_ABS:
  /* Float arithmetic */
  case OP_ADDF:
  case OP_SUBF:
  case OP_MULF:
  case OP_DIVF:
  case OP_NEGF:
  case OP_ABSF:
  /* Logical/bitwise operations */
  case OP_AND:
  case OP_OR:
  case OP_XOR:
  case OP_NOT:
  case OP_SHL:
  case OP_SHR:
  case OP_SAR:
  /* Comparison operations */
  case OP_EQ:
  case OP_NE:
  case OP_LT:
  case OP_LE:
  case OP_GT:
  case OP_GE:
  case OP_LTU:
  case OP_GTU:
  /* Push and pick with 8-bit operand */
  case OP_PUSH8:
  case OP_PICK:
  /* Relative jumps with 8-bit operand */
  case OP_JR:
  case OP_JRZ:
  case OP_JRNZ:
  /* Load/store with 16-bit address */
  case OP_LOAD8:
  case OP_LOAD16:
  case OP_LOAD32:
  case OP_LOAD64:
  case OP_STORE8:
  case OP_STORE16:
  case OP_STORE32:
  case OP_STORE64:
  /* Push with 16-bit operand */
  case OP_PUSH16:
  /* Control flow with 16-bit address */
  case OP_JMP:
  case OP_JZ:
  case OP_JNZ:
  case OP_CALL:
  case OP_RET:
  /* Type conversion */
  case OP_I2F:
  case OP_F2I:
  case OP_I2B:
  case OP_EXT8:
  case OP_EXT16:
  case OP_ZEXT8:
  case OP_ZEXT16:
  /* Push with 32-bit operand */
  case OP_PUSH32:
  /* Communication with 32-bit operand */
  case OP_COMM_EXEC:
  case OP_COMM_STATUS:
  case OP_COMM_RESET:
    return 1;
  default:
    return 0;
  }
}
/* <<< END GENERATED: opcode-helpers <<< */

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_ISA_H */
