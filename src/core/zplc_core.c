/**
 * @file zplc_core.c
 * @brief ZPLC Core Runtime - Virtual Machine Implementation
 *
 * SPDX-License-Identifier: MIT
 *
 * This is the heart of the ZPLC runtime: the Virtual Machine interpreter.
 * All code here is strict ANSI C99 with no platform dependencies.
 * Hardware access goes through the HAL.
 *
 * Architecture: Stack-based bytecode interpreter
 * See docs/ISA.md for instruction set specification.
 */

#include <string.h>
#include <zplc_hal.h>
#include <zplc_isa.h>

/* ============================================================================
 * Version Information
 * ============================================================================
 */

#define ZPLC_CORE_VERSION_MAJOR 0
#define ZPLC_CORE_VERSION_MINOR 2
#define ZPLC_CORE_VERSION_PATCH 0

/* ============================================================================
 * Memory Regions
 * ============================================================================
 * These are the VM's memory banks. All access goes through helper functions
 * that perform bounds checking and address translation.
 */

/** @brief Input Process Image - updated by HAL, read by VM */
static uint8_t mem_ipi[ZPLC_MEM_IPI_SIZE];

/** @brief Output Process Image - written by VM, flushed to HAL */
static uint8_t mem_opi[ZPLC_MEM_OPI_SIZE];

/** @brief Work memory - stack, temporaries, locals */
static uint8_t mem_work[ZPLC_MEM_WORK_SIZE];

/** @brief Retentive memory - survives power cycle */
static uint8_t mem_retain[ZPLC_MEM_RETAIN_SIZE];

/** @brief Code segment - bytecode (read-only during execution) */
static uint8_t mem_code[ZPLC_MEM_CODE_SIZE];

/** @brief Loaded code size (for bounds checking) */
static uint32_t code_size = 0;

/* ============================================================================
 * VM State
 * ============================================================================
 */

/** @brief The virtual machine execution state */
static zplc_vm_state_t vm_state;

/** @brief Flag indicating if a program is loaded */
static int program_loaded = 0;

/* ============================================================================
 * Internal Helper Macros
 * ============================================================================
 */

/**
 * @brief Check for stack underflow before popping N items.
 */
#define CHECK_STACK_UNDERFLOW(n)                                               \
  do {                                                                         \
    if (vm_state.sp < (n)) {                                                   \
      vm_state.error = ZPLC_VM_STACK_UNDERFLOW;                                \
      vm_state.halted = 1;                                                     \
      return ZPLC_VM_STACK_UNDERFLOW;                                          \
    }                                                                          \
  } while (0)

/**
 * @brief Check for stack overflow before pushing.
 */
#define CHECK_STACK_OVERFLOW()                                                 \
  do {                                                                         \
    if (vm_state.sp >= ZPLC_STACK_MAX_DEPTH) {                                 \
      vm_state.error = ZPLC_VM_STACK_OVERFLOW;                                 \
      vm_state.halted = 1;                                                     \
      return ZPLC_VM_STACK_OVERFLOW;                                           \
    }                                                                          \
  } while (0)

/**
 * @brief Push a value onto the stack.
 */
#define PUSH(val)                                                              \
  do {                                                                         \
    CHECK_STACK_OVERFLOW();                                                    \
    vm_state.stack[vm_state.sp++] = (uint32_t)(val);                           \
  } while (0)

/**
 * @brief Pop a value from the stack.
 */
#define POP() (vm_state.stack[--vm_state.sp])

/**
 * @brief Peek at the top of stack without removing.
 */
#define PEEK() (vm_state.stack[vm_state.sp - 1])

/**
 * @brief Read a 16-bit little-endian value from code.
 */
#define READ_U16(offset)                                                       \
  ((uint16_t)mem_code[(offset)] | ((uint16_t)mem_code[(offset) + 1] << 8))

/**
 * @brief Read a 32-bit little-endian value from code.
 */
#define READ_U32(offset)                                                       \
  ((uint32_t)mem_code[(offset)] | ((uint32_t)mem_code[(offset) + 1] << 8) |    \
   ((uint32_t)mem_code[(offset) + 2] << 16) |                                  \
   ((uint32_t)mem_code[(offset) + 3] << 24))

/* ============================================================================
 * Memory Access Functions
 * ============================================================================
 * All memory access goes through these functions for bounds checking
 * and address translation.
 */

/**
 * @brief Get a pointer to memory at the given logical address.
 *
 * @param addr Logical address (0x0000-0x4FFF)
 * @param size Size of access in bytes
 * @param writable 1 if write access required, 0 for read
 * @return Pointer to memory, or NULL if out of bounds
 */
static uint8_t *mem_ptr(uint16_t addr, uint8_t size, int writable) {
  /* Input Process Image: 0x0000 - 0x0FFF (read-only for VM) */
  if (addr < ZPLC_MEM_OPI_BASE) {
    if (writable) {
      return NULL; /* Can't write to inputs */
    }
    if (addr + size > ZPLC_MEM_IPI_SIZE) {
      return NULL;
    }
    return &mem_ipi[addr];
  }

  /* Output Process Image: 0x1000 - 0x1FFF */
  if (addr < ZPLC_MEM_WORK_BASE) {
    uint16_t offset = addr - ZPLC_MEM_OPI_BASE;
    if (offset + size > ZPLC_MEM_OPI_SIZE) {
      return NULL;
    }
    return &mem_opi[offset];
  }

  /* Work Memory: 0x2000 - 0x3FFF */
  if (addr < ZPLC_MEM_RETAIN_BASE) {
    uint16_t offset = addr - ZPLC_MEM_WORK_BASE;
    if (offset + size > ZPLC_MEM_WORK_SIZE) {
      return NULL;
    }
    return &mem_work[offset];
  }

  /* Retentive Memory: 0x4000 - 0x4FFF */
  if (addr < ZPLC_MEM_CODE_BASE) {
    uint16_t offset = addr - ZPLC_MEM_RETAIN_BASE;
    if (offset + size > ZPLC_MEM_RETAIN_SIZE) {
      return NULL;
    }
    return &mem_retain[offset];
  }

  /* Code segment not accessible via load/store */
  return NULL;
}

/**
 * @brief Read an 8-bit value from memory.
 */
static int mem_read8(uint16_t addr, uint8_t *value) {
  uint8_t *ptr = mem_ptr(addr, 1, 0);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  *value = *ptr;
  return ZPLC_VM_OK;
}

/**
 * @brief Read a 16-bit little-endian value from memory.
 */
static int mem_read16(uint16_t addr, uint16_t *value) {
  uint8_t *ptr = mem_ptr(addr, 2, 0);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  *value = (uint16_t)ptr[0] | ((uint16_t)ptr[1] << 8);
  return ZPLC_VM_OK;
}

/**
 * @brief Read a 32-bit little-endian value from memory.
 */
static int mem_read32(uint16_t addr, uint32_t *value) {
  uint8_t *ptr = mem_ptr(addr, 4, 0);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  *value = (uint32_t)ptr[0] | ((uint32_t)ptr[1] << 8) |
           ((uint32_t)ptr[2] << 16) | ((uint32_t)ptr[3] << 24);
  return ZPLC_VM_OK;
}

/**
 * @brief Write an 8-bit value to memory.
 */
static int mem_write8(uint16_t addr, uint8_t value) {
  uint8_t *ptr = mem_ptr(addr, 1, 1);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  *ptr = value;
  return ZPLC_VM_OK;
}

/**
 * @brief Write a 16-bit little-endian value to memory.
 */
static int mem_write16(uint16_t addr, uint16_t value) {
  uint8_t *ptr = mem_ptr(addr, 2, 1);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  ptr[0] = (uint8_t)(value & 0xFF);
  ptr[1] = (uint8_t)((value >> 8) & 0xFF);
  return ZPLC_VM_OK;
}

/**
 * @brief Write a 32-bit little-endian value to memory.
 */
static int mem_write32(uint16_t addr, uint32_t value) {
  uint8_t *ptr = mem_ptr(addr, 4, 1);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  ptr[0] = (uint8_t)(value & 0xFF);
  ptr[1] = (uint8_t)((value >> 8) & 0xFF);
  ptr[2] = (uint8_t)((value >> 16) & 0xFF);
  ptr[3] = (uint8_t)((value >> 24) & 0xFF);
  return ZPLC_VM_OK;
}

/**
 * @brief Read a 64-bit little-endian value from memory.
 *
 * Returns the value as two 32-bit words (for stack-based operations).
 * Low word is stored first (little-endian).
 */
static int mem_read64(uint16_t addr, uint32_t *low, uint32_t *high) {
  uint8_t *ptr = mem_ptr(addr, 8, 0);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  *low = (uint32_t)ptr[0] | ((uint32_t)ptr[1] << 8) | ((uint32_t)ptr[2] << 16) |
         ((uint32_t)ptr[3] << 24);
  *high = (uint32_t)ptr[4] | ((uint32_t)ptr[5] << 8) |
          ((uint32_t)ptr[6] << 16) | ((uint32_t)ptr[7] << 24);
  return ZPLC_VM_OK;
}

/**
 * @brief Write a 64-bit little-endian value to memory.
 *
 * Takes two 32-bit words (low and high) from the stack.
 */
static int mem_write64(uint16_t addr, uint32_t low, uint32_t high) {
  uint8_t *ptr = mem_ptr(addr, 8, 1);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }
  ptr[0] = (uint8_t)(low & 0xFF);
  ptr[1] = (uint8_t)((low >> 8) & 0xFF);
  ptr[2] = (uint8_t)((low >> 16) & 0xFF);
  ptr[3] = (uint8_t)((low >> 24) & 0xFF);
  ptr[4] = (uint8_t)(high & 0xFF);
  ptr[5] = (uint8_t)((high >> 8) & 0xFF);
  ptr[6] = (uint8_t)((high >> 16) & 0xFF);
  ptr[7] = (uint8_t)((high >> 24) & 0xFF);
  return ZPLC_VM_OK;
}

/* ============================================================================
 * Public API
 * ============================================================================
 */

const char *zplc_core_version(void) {
  static char version_str[16] = {0};
  if (version_str[0] == '\0') {
    version_str[0] = '0' + ZPLC_CORE_VERSION_MAJOR;
    version_str[1] = '.';
    version_str[2] = '0' + ZPLC_CORE_VERSION_MINOR;
    version_str[3] = '.';
    version_str[4] = '0' + ZPLC_CORE_VERSION_PATCH;
    version_str[5] = '\0';
  }
  return version_str;
}

int zplc_core_init(void) {
  /* Zero all memory regions */
  memset(mem_ipi, 0, sizeof(mem_ipi));
  memset(mem_opi, 0, sizeof(mem_opi));
  memset(mem_work, 0, sizeof(mem_work));
  memset(mem_retain, 0, sizeof(mem_retain));
  memset(mem_code, 0, sizeof(mem_code));

  /* Reset VM state */
  memset(&vm_state, 0, sizeof(vm_state));
  vm_state.pc = 0;
  vm_state.sp = 0;
  vm_state.bp = 0;
  vm_state.call_depth = 0;
  vm_state.flags = 0;
  vm_state.error = ZPLC_VM_OK;
  vm_state.halted = 0;

  code_size = 0;
  program_loaded = 0;

  return 0;
}

int zplc_core_shutdown(void) {
  /* TODO: Flush retentive memory to HAL persistence */
  program_loaded = 0;
  vm_state.halted = 1;
  return 0;
}

int zplc_core_load(const uint8_t *binary, size_t size) {
  const zplc_file_header_t *header;
  size_t code_offset;

  /* Validate input */
  if (binary == NULL || size < ZPLC_FILE_HEADER_SIZE) {
    return -1; /* Invalid input */
  }

  /* Parse header */
  header = (const zplc_file_header_t *)binary;

  /* Validate magic */
  if (header->magic != ZPLC_MAGIC) {
    return -2; /* Bad magic */
  }

  /* Version check (we accept same major version) */
  if (header->version_major > ZPLC_VERSION_MAJOR) {
    return -3; /* Incompatible version */
  }

  /* Validate sizes */
  if (header->code_size > ZPLC_MEM_CODE_SIZE) {
    return -4; /* Code too large */
  }

  /*
   * Calculate code offset.
   * Format: [Header 32B][Segment Table][Code]
   * Segment table has segment_count entries of 8 bytes each.
   */
  code_offset =
      ZPLC_FILE_HEADER_SIZE + (header->segment_count * ZPLC_SEGMENT_ENTRY_SIZE);

  /* Check file has enough data */
  if (size < code_offset + header->code_size) {
    return -5; /* File truncated */
  }

  /* TODO: Validate CRC32 (stub for now) */

  /* Copy code segment */
  memcpy(mem_code, binary + code_offset, header->code_size);
  code_size = header->code_size;

  /* Set entry point */
  vm_state.pc = header->entry_point;
  vm_state.sp = 0;
  vm_state.halted = 0;
  vm_state.error = ZPLC_VM_OK;

  program_loaded = 1;

  return 0;
}

/**
 * @brief Load raw bytecode directly (for testing).
 *
 * This bypasses the .zplc header validation - use only for unit tests.
 *
 * @param bytecode Raw bytecode bytes
 * @param size Size of bytecode
 * @return 0 on success
 */
int zplc_core_load_raw(const uint8_t *bytecode, size_t size) {
  if (bytecode == NULL || size == 0 || size > ZPLC_MEM_CODE_SIZE) {
    return -1;
  }

  /* Copy bytecode directly */
  memcpy(mem_code, bytecode, size);
  code_size = (uint32_t)size;

  /* Reset VM state */
  vm_state.pc = 0;
  vm_state.sp = 0;
  vm_state.bp = 0;
  vm_state.call_depth = 0;
  vm_state.halted = 0;
  vm_state.error = ZPLC_VM_OK;

  program_loaded = 1;

  return 0;
}

/**
 * @brief Execute a single instruction.
 *
 * @return VM error code (ZPLC_VM_OK if successful)
 */
int zplc_core_step(void) {
  uint8_t opcode;
  uint8_t operand8;
  uint16_t operand16;
  uint32_t operand32;
  uint32_t a, b, result;
  int32_t sa, sb;
  int mem_result;

  /* Check if halted */
  if (vm_state.halted) {
    return vm_state.error;
  }

  /* Check program loaded */
  if (!program_loaded) {
    vm_state.error = ZPLC_VM_INVALID_OPCODE;
    vm_state.halted = 1;
    return vm_state.error;
  }

  /* Bounds check PC */
  if (vm_state.pc >= code_size) {
    vm_state.error = ZPLC_VM_INVALID_JUMP;
    vm_state.halted = 1;
    return vm_state.error;
  }

  /* Fetch opcode */
  opcode = mem_code[vm_state.pc];

  /* Decode and execute */
  switch (opcode) {

    /* ===== System Operations ===== */

  case OP_NOP:
    vm_state.pc++;
    break;

  case OP_HALT:
    vm_state.halted = 1;
    vm_state.error = ZPLC_VM_HALTED;
    vm_state.pc++;
    return ZPLC_VM_HALTED;

  case OP_BREAK:
    /* Debugger breakpoint - for now, just continue */
    vm_state.pc++;
    break;

  case OP_GET_TICKS:
    CHECK_STACK_OVERFLOW();
    PUSH(zplc_hal_tick());
    vm_state.pc++;
    break;

    /* ===== Stack Operations ===== */

  case OP_DUP:
    CHECK_STACK_UNDERFLOW(1);
    a = PEEK();
    PUSH(a);
    vm_state.pc++;
    break;

  case OP_DROP:
    CHECK_STACK_UNDERFLOW(1);
    (void)POP();
    vm_state.pc++;
    break;

  case OP_SWAP:
    CHECK_STACK_UNDERFLOW(2);
    a = vm_state.stack[vm_state.sp - 1];
    b = vm_state.stack[vm_state.sp - 2];
    vm_state.stack[vm_state.sp - 1] = b;
    vm_state.stack[vm_state.sp - 2] = a;
    vm_state.pc++;
    break;

  case OP_OVER:
    CHECK_STACK_UNDERFLOW(2);
    a = vm_state.stack[vm_state.sp - 2];
    PUSH(a);
    vm_state.pc++;
    break;

  case OP_ROT:
    CHECK_STACK_UNDERFLOW(3);
    a = vm_state.stack[vm_state.sp - 3];      /* bottom */
    b = vm_state.stack[vm_state.sp - 2];      /* middle */
    result = vm_state.stack[vm_state.sp - 1]; /* top */
    vm_state.stack[vm_state.sp - 3] = b;
    vm_state.stack[vm_state.sp - 2] = result;
    vm_state.stack[vm_state.sp - 1] = a;
    vm_state.pc++;
    break;

    /* ===== Integer Arithmetic ===== */

  case OP_ADD:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a + b);
    vm_state.pc++;
    break;

  case OP_SUB:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a - b);
    vm_state.pc++;
    break;

  case OP_MUL:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a * b);
    vm_state.pc++;
    break;

  case OP_DIV:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    if (b == 0) {
      vm_state.error = ZPLC_VM_DIV_BY_ZERO;
      vm_state.halted = 1;
      return ZPLC_VM_DIV_BY_ZERO;
    }
    /* Signed division */
    sa = (int32_t)a;
    sb = (int32_t)b;
    PUSH((uint32_t)(sa / sb));
    vm_state.pc++;
    break;

  case OP_MOD:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    if (b == 0) {
      vm_state.error = ZPLC_VM_DIV_BY_ZERO;
      vm_state.halted = 1;
      return ZPLC_VM_DIV_BY_ZERO;
    }
    sa = (int32_t)a;
    sb = (int32_t)b;
    PUSH((uint32_t)(sa % sb));
    vm_state.pc++;
    break;

  case OP_NEG:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH((uint32_t)(-(int32_t)a));
    vm_state.pc++;
    break;

  case OP_ABS:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    sa = (int32_t)a;
    PUSH((uint32_t)(sa < 0 ? -sa : sa));
    vm_state.pc++;
    break;

    /* ===== Float Arithmetic ===== */
    /*
     * Float representation: IEEE 754 single precision (32-bit)
     * We use memcpy for type-punning to avoid strict aliasing issues.
     * This is the C99-compliant way to do it.
     */

  case OP_ADDF:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      fr = fa + fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

  case OP_SUBF:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      fr = fa - fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

  case OP_MULF:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      fr = fa * fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

  case OP_DIVF:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      /* IEEE 754 handles div by zero (returns Inf or NaN) */
      /* But for industrial safety, we check anyway */
      if (fb == 0.0f) {
        vm_state.error = ZPLC_VM_DIV_BY_ZERO;
        vm_state.halted = 1;
        return ZPLC_VM_DIV_BY_ZERO;
      }
      fr = fa / fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

  case OP_NEGF:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    {
      float fa;
      memcpy(&fa, &a, sizeof(float));
      fa = -fa;
      memcpy(&result, &fa, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

  case OP_ABSF:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    {
      float fa;
      memcpy(&fa, &a, sizeof(float));
      if (fa < 0.0f)
        fa = -fa;
      memcpy(&result, &fa, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

    /* ===== Logical/Bitwise Operations ===== */

  case OP_AND:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a & b);
    vm_state.pc++;
    break;

  case OP_OR:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a | b);
    vm_state.pc++;
    break;

  case OP_XOR:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a ^ b);
    vm_state.pc++;
    break;

  case OP_NOT:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH(~a);
    vm_state.pc++;
    break;

  case OP_SHL:
    CHECK_STACK_UNDERFLOW(2);
    b = POP(); /* shift amount */
    a = POP();
    PUSH(a << (b & 31)); /* Mask to prevent UB */
    vm_state.pc++;
    break;

  case OP_SHR:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a >> (b & 31)); /* Logical shift */
    vm_state.pc++;
    break;

  case OP_SAR:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    sa = (int32_t)a;
    PUSH((uint32_t)(sa >> (b & 31))); /* Arithmetic shift */
    vm_state.pc++;
    break;

    /* ===== Comparison Operations ===== */

  case OP_EQ:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a == b ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_NE:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a != b ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_LT:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    sa = (int32_t)a;
    sb = (int32_t)b;
    PUSH(sa < sb ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_LE:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    sa = (int32_t)a;
    sb = (int32_t)b;
    PUSH(sa <= sb ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_GT:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    sa = (int32_t)a;
    sb = (int32_t)b;
    PUSH(sa > sb ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_GE:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    sa = (int32_t)a;
    sb = (int32_t)b;
    PUSH(sa >= sb ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_LTU:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a < b ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_GTU:
    CHECK_STACK_UNDERFLOW(2);
    b = POP();
    a = POP();
    PUSH(a > b ? 1 : 0);
    vm_state.pc++;
    break;

    /* ===== Push with 8-bit operand ===== */

  case OP_PUSH8:
    if (vm_state.pc + 1 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand8 = mem_code[vm_state.pc + 1];
    /* Sign-extend to 32-bit */
    PUSH((uint32_t)(int32_t)(int8_t)operand8);
    vm_state.pc += 2;
    break;

  case OP_JR:
    if (vm_state.pc + 1 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand8 = mem_code[vm_state.pc + 1];
    /* Relative jump with signed offset */
    vm_state.pc = (uint16_t)(vm_state.pc + 2 + (int8_t)operand8);
    break;

  case OP_JRZ:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 1 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand8 = mem_code[vm_state.pc + 1];
    a = POP();
    if (a == 0) {
      vm_state.pc = (uint16_t)(vm_state.pc + 2 + (int8_t)operand8);
    } else {
      vm_state.pc += 2;
    }
    break;

  case OP_JRNZ:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 1 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand8 = mem_code[vm_state.pc + 1];
    a = POP();
    if (a != 0) {
      vm_state.pc = (uint16_t)(vm_state.pc + 2 + (int8_t)operand8);
    } else {
      vm_state.pc += 2;
    }
    break;

    /* ===== Load/Store with 16-bit address ===== */

  case OP_LOAD8:
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    {
      uint8_t val8;
      mem_result = mem_read8(operand16, &val8);
      if (mem_result != ZPLC_VM_OK) {
        vm_state.error = (uint8_t)mem_result;
        vm_state.halted = 1;
        return mem_result;
      }
      PUSH((uint32_t)val8);
    }
    vm_state.pc += 3;
    break;

  case OP_LOAD16:
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    {
      uint16_t val16;
      mem_result = mem_read16(operand16, &val16);
      if (mem_result != ZPLC_VM_OK) {
        vm_state.error = (uint8_t)mem_result;
        vm_state.halted = 1;
        return mem_result;
      }
      PUSH((uint32_t)val16);
    }
    vm_state.pc += 3;
    break;

  case OP_LOAD32:
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    {
      uint32_t val32;
      mem_result = mem_read32(operand16, &val32);
      if (mem_result != ZPLC_VM_OK) {
        vm_state.error = (uint8_t)mem_result;
        vm_state.halted = 1;
        return mem_result;
      }
      PUSH(val32);
    }
    vm_state.pc += 3;
    break;

  case OP_LOAD64:
    /*
     * 64-bit load: pushes two 32-bit values onto the stack.
     * Low word is pushed first, then high word (TOS = high).
     * This matches IEC 61131-3 LWORD/LREAL representation.
     */
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    {
      uint32_t low, high;
      mem_result = mem_read64(operand16, &low, &high);
      if (mem_result != ZPLC_VM_OK) {
        vm_state.error = (uint8_t)mem_result;
        vm_state.halted = 1;
        return mem_result;
      }
      PUSH(low);
      PUSH(high);
    }
    vm_state.pc += 3;
    break;

  case OP_STORE8:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    a = POP();
    mem_result = mem_write8(operand16, (uint8_t)a);
    if (mem_result != ZPLC_VM_OK) {
      vm_state.error = (uint8_t)mem_result;
      vm_state.halted = 1;
      return mem_result;
    }
    vm_state.pc += 3;
    break;

  case OP_STORE16:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    a = POP();
    mem_result = mem_write16(operand16, (uint16_t)a);
    if (mem_result != ZPLC_VM_OK) {
      vm_state.error = (uint8_t)mem_result;
      vm_state.halted = 1;
      return mem_result;
    }
    vm_state.pc += 3;
    break;

  case OP_STORE32:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    a = POP();
    mem_result = mem_write32(operand16, a);
    if (mem_result != ZPLC_VM_OK) {
      vm_state.error = (uint8_t)mem_result;
      vm_state.halted = 1;
      return mem_result;
    }
    vm_state.pc += 3;
    break;

  case OP_STORE64:
    /*
     * 64-bit store: pops two 32-bit values from the stack.
     * High word is popped first (TOS), then low word.
     * Stores to memory in little-endian order.
     */
    CHECK_STACK_UNDERFLOW(2);
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    {
      uint32_t high = POP();
      uint32_t low = POP();
      mem_result = mem_write64(operand16, low, high);
      if (mem_result != ZPLC_VM_OK) {
        vm_state.error = (uint8_t)mem_result;
        vm_state.halted = 1;
        return mem_result;
      }
    }
    vm_state.pc += 3;
    break;

  case OP_PUSH16:
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    /* Sign-extend to 32-bit */
    PUSH((uint32_t)(int32_t)(int16_t)operand16);
    vm_state.pc += 3;
    break;

    /* ===== Control Flow with 16-bit address ===== */

  case OP_JMP:
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    vm_state.pc = operand16;
    break;

  case OP_JZ:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    a = POP();
    if (a == 0) {
      vm_state.pc = operand16;
    } else {
      vm_state.pc += 3;
    }
    break;

  case OP_JNZ:
    CHECK_STACK_UNDERFLOW(1);
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    a = POP();
    if (a != 0) {
      vm_state.pc = operand16;
    } else {
      vm_state.pc += 3;
    }
    break;

  case OP_CALL:
    if (vm_state.pc + 2 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    if (vm_state.call_depth >= ZPLC_CALL_STACK_MAX) {
      vm_state.error = ZPLC_VM_CALL_OVERFLOW;
      vm_state.halted = 1;
      return ZPLC_VM_CALL_OVERFLOW;
    }
    operand16 = READ_U16(vm_state.pc + 1);
    /* Push return address */
    vm_state.call_stack[vm_state.call_depth++] = vm_state.pc + 3;
    vm_state.pc = operand16;
    break;

  case OP_RET:
    if (vm_state.call_depth == 0) {
      /* Return from main - halt */
      vm_state.halted = 1;
      vm_state.error = ZPLC_VM_HALTED;
      return ZPLC_VM_HALTED;
    }
    vm_state.pc = vm_state.call_stack[--vm_state.call_depth];
    break;

    /* ===== Push with 32-bit operand ===== */

  case OP_PUSH32:
    if (vm_state.pc + 4 >= code_size) {
      vm_state.error = ZPLC_VM_INVALID_JUMP;
      vm_state.halted = 1;
      return ZPLC_VM_INVALID_JUMP;
    }
    operand32 = READ_U32(vm_state.pc + 1);
    PUSH(operand32);
    vm_state.pc += 5;
    break;

    /* ===== Type Conversion ===== */

  case OP_I2F:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    {
      float f = (float)(int32_t)a;
      memcpy(&result, &f, sizeof(uint32_t));
      PUSH(result);
    }
    vm_state.pc++;
    break;

  case OP_F2I:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    {
      float f;
      memcpy(&f, &a, sizeof(float));
      /* Truncate towards zero, like C cast */
      PUSH((uint32_t)(int32_t)f);
    }
    vm_state.pc++;
    break;

  case OP_I2B:
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH(a != 0 ? 1 : 0);
    vm_state.pc++;
    break;

  case OP_EXT8:
    /* Sign-extend 8-bit to 32-bit */
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH((uint32_t)(int32_t)(int8_t)(uint8_t)a);
    vm_state.pc++;
    break;

  case OP_EXT16:
    /* Sign-extend 16-bit to 32-bit */
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH((uint32_t)(int32_t)(int16_t)(uint16_t)a);
    vm_state.pc++;
    break;

  case OP_ZEXT8:
    /* Zero-extend 8-bit to 32-bit (mask off upper bits) */
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH(a & 0xFF);
    vm_state.pc++;
    break;

  case OP_ZEXT16:
    /* Zero-extend 16-bit to 32-bit (mask off upper bits) */
    CHECK_STACK_UNDERFLOW(1);
    a = POP();
    PUSH(a & 0xFFFF);
    vm_state.pc++;
    break;

    /* ===== Unknown opcode ===== */

  default:
    vm_state.error = ZPLC_VM_INVALID_OPCODE;
    vm_state.halted = 1;
    return ZPLC_VM_INVALID_OPCODE;
  }

  return ZPLC_VM_OK;
}

/**
 * @brief Run the VM for a fixed number of instructions or until halted.
 *
 * @param max_instructions Maximum instructions to execute (0 = unlimited)
 * @return Number of instructions executed, or negative error code
 */
int zplc_core_run(uint32_t max_instructions) {
  uint32_t count = 0;
  int result;

  while (!vm_state.halted) {
    result = zplc_core_step();

    if (result != ZPLC_VM_OK && result != ZPLC_VM_HALTED) {
      return -result; /* Return negative error code */
    }

    count++;

    if (max_instructions > 0 && count >= max_instructions) {
      break;
    }
  }

  return (int)count;
}

/**
 * @brief Run one PLC scan cycle.
 *
 * This is the main execution interface for the runtime:
 * 1. (Future) Latch inputs from HAL
 * 2. Execute program until HALT or cycle complete
 * 3. (Future) Flush outputs to HAL
 *
 * @return 0 on success, error code otherwise
 */
int zplc_core_run_cycle(void) {
  /* Reset for new cycle */
  vm_state.pc = 0;
  vm_state.sp = 0;
  vm_state.halted = 0;
  vm_state.error = ZPLC_VM_OK;

  /* Run until HALT */
  return zplc_core_run(0);
}

/* ============================================================================
 * State Access (for testing and debugging)
 * ============================================================================
 */

/**
 * @brief Get a read-only pointer to the VM state.
 *
 * @return Pointer to VM state structure
 */
const zplc_vm_state_t *zplc_core_get_state(void) { return &vm_state; }

/**
 * @brief Get the current stack pointer.
 */
uint16_t zplc_core_get_sp(void) { return vm_state.sp; }

/**
 * @brief Get a value from the evaluation stack.
 *
 * @param index Stack index (0 = bottom, sp-1 = top)
 * @return Stack value, or 0 if index out of bounds
 */
uint32_t zplc_core_get_stack(uint16_t index) {
  if (index >= vm_state.sp) {
    return 0;
  }
  return vm_state.stack[index];
}

/**
 * @brief Get the last error code.
 */
int zplc_core_get_error(void) { return vm_state.error; }

/**
 * @brief Check if VM is halted.
 */
int zplc_core_is_halted(void) { return vm_state.halted; }

/**
 * @brief Write a value to the IPI (for testing - simulates HAL input).
 */
int zplc_core_set_ipi(uint16_t offset, uint32_t value) {
  if (offset + 4 > ZPLC_MEM_IPI_SIZE) {
    return -1;
  }
  mem_ipi[offset] = (uint8_t)(value & 0xFF);
  mem_ipi[offset + 1] = (uint8_t)((value >> 8) & 0xFF);
  mem_ipi[offset + 2] = (uint8_t)((value >> 16) & 0xFF);
  mem_ipi[offset + 3] = (uint8_t)((value >> 24) & 0xFF);
  return 0;
}

/**
 * @brief Write a 16-bit value to the IPI (for testing - simulates HAL input).
 */
int zplc_core_set_ipi16(uint16_t offset, uint16_t value) {
  if (offset + 2 > ZPLC_MEM_IPI_SIZE) {
    return -1;
  }
  mem_ipi[offset] = (uint8_t)(value & 0xFF);
  mem_ipi[offset + 1] = (uint8_t)((value >> 8) & 0xFF);
  return 0;
}

/**
 * @brief Read a value from the OPI (for testing - check outputs).
 */
uint32_t zplc_core_get_opi(uint16_t offset) {
  if (offset + 4 > ZPLC_MEM_OPI_SIZE) {
    return 0;
  }
  return (uint32_t)mem_opi[offset] | ((uint32_t)mem_opi[offset + 1] << 8) |
         ((uint32_t)mem_opi[offset + 2] << 16) |
         ((uint32_t)mem_opi[offset + 3] << 24);
}
