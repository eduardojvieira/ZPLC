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
 *
 * Memory Model:
 *   - Shared: IPI, OPI, Work, Retain, Code (global arrays)
 *   - Private: Stack, Call Stack, PC, flags (per zplc_vm_t instance)
 *
 * This design allows multiple VM instances to execute different tasks
 * while sharing the same I/O and data memory.
 */

#include "zplc_comm_dispatch.h"
#include "zplc_mem_extent.h"
#include <string.h>
#include <zplc_core.h>
#include <zplc_debug.h>
#include <zplc_hal.h>

/* ============================================================================
 * Version Information
 * ============================================================================
 */

#ifndef ZPLC_CORE_VERSION_STR
#define ZPLC_CORE_VERSION_STR "unversioned"
#endif

/* ============================================================================
 * Shared Memory Regions
 * ============================================================================
 * These are global and shared across all VM instances.
 * In a multi-task environment, access must be synchronized by the scheduler.
 */

/** @brief Input Process Image - updated by HAL, read by VM */
static uint8_t mem_ipi[ZPLC_MEM_IPI_SIZE];

/** @brief Output Process Image - written by VM, flushed to HAL */
static uint8_t mem_opi[ZPLC_MEM_OPI_SIZE];

/** @brief Work memory - stack, temporaries, locals */
static uint8_t mem_work[ZPLC_MEM_WORK_SIZE];

/** @brief Retentive memory - survives power cycle */
static uint8_t mem_retain[ZPLC_MEM_RETAIN_SIZE];
/** @brief Global static array for loaded code */
static uint8_t mem_code[ZPLC_MEM_CODE_SIZE];

/** @brief Global static array for variable tags */
static zplc_tag_entry_t mem_tags[ZPLC_MAX_TAGS];
static uint16_t tag_count = 0;

/** @brief Loaded code size (for bounds checking) */
static uint32_t code_size = 0;

/** @brief Process Image Mutex for thread-safe access */
static zplc_hal_mutex_t pi_mutex = NULL;

/** @brief Default VM instance for legacy API */
static zplc_vm_t default_vm;

/** @brief Legacy-compatible VM state snapshot for old tests/APIs */
static zplc_vm_state_t legacy_default_vm_state;

/** @brief Flag indicating if default VM has a program loaded */
static int default_program_loaded = 0;

typedef struct {
  uint8_t active;
  uint16_t addr;
  uint16_t size;
  uint8_t bytes[ZPLC_FORCE_MAX_BYTES];
} zplc_force_entry_t;

static zplc_force_entry_t force_entries[ZPLC_FORCE_MAX_ENTRIES];

/* ============================================================================
 * Internal Helper Macros
 * ============================================================================
 */

/**
 * @brief Check for stack underflow before popping N items.
 */
#define VM_CHECK_STACK_UNDERFLOW(vm, n)                                        \
  do {                                                                         \
    if ((vm)->sp < (n)) {                                                      \
      (vm)->error = ZPLC_VM_STACK_UNDERFLOW;                                   \
      (vm)->halted = 1;                                                        \
      return ZPLC_VM_STACK_UNDERFLOW;                                          \
    }                                                                          \
  } while (0)

/**
 * @brief Check for stack overflow before pushing.
 */
#define VM_CHECK_STACK_OVERFLOW(vm)                                            \
  do {                                                                         \
    if ((vm)->sp >= (vm)->stack_limit ||                                      \
        (vm)->sp >= ZPLC_STACK_MAX_DEPTH) {                                   \
      (vm)->error = ZPLC_VM_STACK_OVERFLOW;                                    \
      (vm)->halted = 1;                                                        \
      return ZPLC_VM_STACK_OVERFLOW;                                           \
    }                                                                          \
  } while (0)

/**
 * @brief Push a value onto the stack.
 */
#define VM_PUSH(vm, val)                                                       \
  do {                                                                         \
    VM_CHECK_STACK_OVERFLOW(vm);                                               \
    (vm)->stack[(vm)->sp++] = (uint32_t)(val);                                 \
  } while (0)

/**
 * @brief Pop a value from the stack.
 */
#define VM_POP(vm) ((vm)->stack[--(vm)->sp])

/**
 * @brief Peek at the top of stack without removing.
 */
#define VM_PEEK(vm) ((vm)->stack[(vm)->sp - 1])

/**
 * @brief Pop a 64-bit value (the high word is on top) into a uint64_t.
 */
#define VM_POP64(vm, out)                                                      \
  do {                                                                         \
    const uint32_t pop64_high_ = VM_POP(vm);                                   \
    const uint32_t pop64_low_ = VM_POP(vm);                                    \
    (out) = ((uint64_t)pop64_high_ << 32) | pop64_low_;                        \
  } while (0)

/**
 * @brief Push a 64-bit value: low word first, then the high word.
 */
#define VM_PUSH64(vm, val)                                                     \
  do {                                                                         \
    const uint64_t push64_value_ = (val);                                      \
    VM_PUSH(vm, (uint32_t)(push64_value_ & 0xFFFFFFFFU));                      \
    VM_PUSH(vm, (uint32_t)(push64_value_ >> 32));                              \
  } while (0)

/**
 * @brief Check that an instruction of n bytes (opcode and operand) lies inside
 *        the code of the task, before its operand is read.
 *
 * The sum cannot wrap: pc is 16 bits and n is at most 5.
 */
#define VM_CHECK_FETCH(vm, n)                                                  \
  do {                                                                         \
    if ((uint32_t)(vm)->pc + (n) > (vm)->code_size) {                          \
      (vm)->error = ZPLC_VM_INVALID_JUMP;                                      \
      (vm)->halted = 1;                                                        \
      return ZPLC_VM_INVALID_JUMP;                                             \
    }                                                                          \
  } while (0)

/**
 * @brief Read a 16-bit little-endian value from code.
 */
#define READ_U16(code, offset)                                                 \
  ((uint16_t)(code)[(offset)] | ((uint16_t)(code)[(offset) + 1] << 8))

/**
 * @brief Read a 32-bit little-endian value from code.
 */
#define READ_U32(code, offset)                                                 \
  ((uint32_t)(code)[(offset)] | ((uint32_t)(code)[(offset) + 1] << 8) |        \
   ((uint32_t)(code)[(offset) + 2] << 16) |                                    \
   ((uint32_t)(code)[(offset) + 3] << 24))

/* ============================================================================
 * Shared Memory Access Functions
 * ============================================================================
 * All memory access goes through these functions for bounds checking
 * and address translation.
 */

/**
 * @brief Get a pointer to memory at the given logical address.
 *
 * Every access of the VM, the string operations and the communication opcodes
 * goes through this function (RT-001): the whole extent [addr, addr + size)
 * must lie inside one region. The arguments are full 32-bit values, so an
 * address or a length that does not fit 16 bits is refused instead of
 * wrapping into another region.
 *
 * @param addr Logical address (any 32-bit value)
 * @param size Extent of the access in bytes (any 32-bit value)
 * @param writable 1 if write access required, 0 for read
 * @return Pointer to memory, or NULL if the extent is not inside one region
 *         (or the region is the read-only input image and a write is asked)
 */
static uint8_t *mem_ptr(uint32_t addr, uint32_t size, int writable) {
  uint32_t offset;

  switch (zplc_mem_extent_locate(addr, size, &offset)) {
  case ZPLC_MEM_REGION_IPI:
    return writable ? NULL : &mem_ipi[offset]; /* inputs: read-only for the VM */
  case ZPLC_MEM_REGION_OPI:
    return &mem_opi[offset];
  case ZPLC_MEM_REGION_WORK:
    return &mem_work[offset];
  case ZPLC_MEM_REGION_RETAIN:
    return &mem_retain[offset];
  default:
    return NULL; /* code segment and everything else: not load/store memory */
  }
}

/** Same placement for the host side (HAL, debugger), which may write inputs. */
static uint8_t *mem_ptr_raw(uint16_t addr, uint16_t size) {
  uint32_t offset;

  switch (zplc_mem_extent_locate(addr, size, &offset)) {
  case ZPLC_MEM_REGION_IPI:
    return &mem_ipi[offset];
  case ZPLC_MEM_REGION_OPI:
    return &mem_opi[offset];
  case ZPLC_MEM_REGION_WORK:
    return &mem_work[offset];
  case ZPLC_MEM_REGION_RETAIN:
    return &mem_retain[offset];
  default:
    return NULL;
  }
}

/**
 * @brief Check that a STRING of @p count characters at @p addr lies in one
 *        region: the 4-byte header, the characters and, for a write, the
 *        terminator (RT-001).
 */
static int string_extent_ok(uint32_t addr, uint32_t count, int writable) {
  return mem_ptr(addr, ZPLC_STRING_DATA_OFFSET + count + (writable ? 1U : 0U),
                 writable) != NULL;
}

static int force_entry_overlaps(const zplc_force_entry_t *entry, uint16_t addr,
                                uint16_t size) {
  uint32_t entry_start;
  uint32_t entry_end;
  uint32_t req_start;
  uint32_t req_end;

  if (entry == NULL || !entry->active || size == 0U) {
    return 0;
  }

  entry_start = (uint32_t)entry->addr;
  entry_end = entry_start + (uint32_t)entry->size;
  req_start = (uint32_t)addr;
  req_end = req_start + (uint32_t)size;

  return req_start < entry_end && entry_start < req_end;
}

static int force_get_byte(uint16_t addr, uint8_t *value) {
  for (uint8_t i = 0; i < ZPLC_FORCE_MAX_ENTRIES; i++) {
    zplc_force_entry_t *entry = &force_entries[i];
    if (!entry->active) {
      continue;
    }
    if (addr >= entry->addr && addr < (uint16_t)(entry->addr + entry->size)) {
      if (value != NULL) {
        *value = entry->bytes[addr - entry->addr];
      }
      return 1;
    }
  }

  return 0;
}

static int raw_write_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size) {
  uint8_t *ptr;

  if (bytes == NULL || size == 0U) {
    return -1;
  }

  ptr = mem_ptr_raw(addr, size);
  if (ptr == NULL) {
    return -2;
  }

  memcpy(ptr, bytes, size);
  return 0;
}

static void reapply_overlapping_forces(uint16_t addr, uint16_t size) {
  for (uint8_t i = 0; i < ZPLC_FORCE_MAX_ENTRIES; i++) {
    zplc_force_entry_t *entry = &force_entries[i];
    if (!force_entry_overlaps(entry, addr, size)) {
      continue;
    }
    (void)raw_write_bytes(entry->addr, entry->bytes, entry->size);
  }
}

static int mem_write_bytes(uint32_t addr, const uint8_t *bytes, uint8_t size) {
  uint8_t *ptr = mem_ptr(addr, size, 1);
  if (ptr == NULL) {
    return ZPLC_VM_OUT_OF_BOUNDS;
  }

  for (uint8_t i = 0; i < size; i++) {
    if (force_get_byte((uint16_t)(addr + i), NULL)) { /* addr + i < 0x5000 */
      continue;
    }
    ptr[i] = bytes[i];
  }

  return ZPLC_VM_OK;
}

/**
 * @brief Read an 8-bit value from memory.
 */
static int mem_read8(uint32_t addr, uint8_t *value) {
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
static int mem_read16(uint32_t addr, uint16_t *value) {
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
static int mem_read32(uint32_t addr, uint32_t *value) {
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
static int mem_write8(uint32_t addr, uint8_t value) {
  return mem_write_bytes(addr, &value, 1);
}

/**
 * @brief Write a 16-bit little-endian value to memory.
 */
static int mem_write16(uint32_t addr, uint16_t value) {
  uint8_t bytes[2];
  bytes[0] = (uint8_t)(value & 0xFF);
  bytes[1] = (uint8_t)((value >> 8) & 0xFF);
  return mem_write_bytes(addr, bytes, 2);
}

/**
 * @brief Write a 32-bit little-endian value to memory.
 */
static int mem_write32(uint32_t addr, uint32_t value) {
  uint8_t bytes[4];
  bytes[0] = (uint8_t)(value & 0xFF);
  bytes[1] = (uint8_t)((value >> 8) & 0xFF);
  bytes[2] = (uint8_t)((value >> 16) & 0xFF);
  bytes[3] = (uint8_t)((value >> 24) & 0xFF);
  return mem_write_bytes(addr, bytes, 4);
}

/**
 * @brief Read a 64-bit little-endian value from memory.
 */
static int mem_read64(uint32_t addr, uint32_t *low, uint32_t *high) {
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
 */
static int mem_write64(uint32_t addr, uint32_t low, uint32_t high) {
  uint8_t bytes[8];
  bytes[0] = (uint8_t)(low & 0xFF);
  bytes[1] = (uint8_t)((low >> 8) & 0xFF);
  bytes[2] = (uint8_t)((low >> 16) & 0xFF);
  bytes[3] = (uint8_t)((low >> 24) & 0xFF);
  bytes[4] = (uint8_t)(high & 0xFF);
  bytes[5] = (uint8_t)((high >> 8) & 0xFF);
  bytes[6] = (uint8_t)((high >> 16) & 0xFF);
  bytes[7] = (uint8_t)((high >> 24) & 0xFF);
  return mem_write_bytes(addr, bytes, 8);
}

/* ============================================================================
 * Shared Memory Public API
 * ============================================================================
 */

int zplc_mem_init(void) {
  memset(mem_ipi, 0, sizeof(mem_ipi));
  memset(mem_opi, 0, sizeof(mem_opi));
  memset(mem_work, 0, sizeof(mem_work));
  memset(mem_retain, 0, sizeof(mem_retain));
  memset(mem_code, 0, sizeof(mem_code));
  memset(force_entries, 0, sizeof(force_entries));
  code_size = 0;
  return 0;
}

uint8_t *zplc_mem_get_region(uint16_t base) {
  switch (base) {
  case ZPLC_MEM_IPI_BASE:
    return mem_ipi;
  case ZPLC_MEM_OPI_BASE:
    return mem_opi;
  case ZPLC_MEM_WORK_BASE:
    return mem_work;
  case ZPLC_MEM_RETAIN_BASE:
    return mem_retain;
  default:
    return NULL;
  }
}

#if defined(ZPLC_CORE_TESTING)
int zplc_test_mem_load_code(const uint8_t *code, size_t size,
                            uint16_t offset) {
  if (code == NULL || size == 0) {
    return -1;
  }
  if (size > ZPLC_MEM_CODE_SIZE || offset > ZPLC_MEM_CODE_SIZE - size) {
    return -2;
  }
  memcpy(&mem_code[offset], code, size);

  /* Track total code size */
  if (offset + size > code_size) {
    code_size = (uint32_t)(offset + size);
  }

  return 0;
}
#endif

const uint8_t *zplc_mem_get_code(uint16_t offset, size_t size) {
  if (size > code_size || offset > code_size - size) {
    return NULL;
  }
  return &mem_code[offset];
}

uint32_t zplc_mem_get_code_size(void) { return code_size; }

/* ============================================================================
 * I/O Helpers
 * ============================================================================
 */

int zplc_ipi_write32(uint16_t offset, uint32_t value) {
  uint8_t bytes[4];
  bytes[0] = (uint8_t)(value & 0xFF);
  bytes[1] = (uint8_t)((value >> 8) & 0xFF);
  bytes[2] = (uint8_t)((value >> 16) & 0xFF);
  bytes[3] = (uint8_t)((value >> 24) & 0xFF);
  return zplc_force_write_bytes(offset, bytes, 4);
}

int zplc_ipi_write16(uint16_t offset, uint16_t value) {
  uint8_t bytes[2];
  bytes[0] = (uint8_t)(value & 0xFF);
  bytes[1] = (uint8_t)((value >> 8) & 0xFF);
  return zplc_force_write_bytes(offset, bytes, 2);
}

int zplc_ipi_write8(uint16_t offset, uint8_t value) {
  return zplc_force_write_bytes(offset, &value, 1);
}

uint32_t zplc_ipi_read32(uint16_t offset) {
  if ((uint32_t)offset > ((uint32_t)ZPLC_MEM_IPI_SIZE - 4U)) {
    return 0;
  }
  return (uint32_t)mem_ipi[offset] | ((uint32_t)mem_ipi[offset + 1] << 8) |
         ((uint32_t)mem_ipi[offset + 2] << 16) |
         ((uint32_t)mem_ipi[offset + 3] << 24);
}

uint16_t zplc_ipi_read16(uint16_t offset) {
  if ((uint32_t)offset > ((uint32_t)ZPLC_MEM_IPI_SIZE - 2U)) {
    return 0;
  }
  return (uint16_t)mem_ipi[offset] | ((uint16_t)mem_ipi[offset + 1] << 8);
}

uint8_t zplc_ipi_read8(uint16_t offset) {
  if (offset >= ZPLC_MEM_IPI_SIZE) {
    return 0;
  }
  return mem_ipi[offset];
}

uint32_t zplc_opi_read32(uint16_t offset) {
  if ((uint32_t)offset > ((uint32_t)ZPLC_MEM_OPI_SIZE - 4U)) {
    return 0;
  }
  return (uint32_t)mem_opi[offset] | ((uint32_t)mem_opi[offset + 1] << 8) |
         ((uint32_t)mem_opi[offset + 2] << 16) |
         ((uint32_t)mem_opi[offset + 3] << 24);
}

uint16_t zplc_opi_read16(uint16_t offset) {
  if ((uint32_t)offset > ((uint32_t)ZPLC_MEM_OPI_SIZE - 2U)) {
    return 0;
  }
  return (uint16_t)mem_opi[offset] | ((uint16_t)mem_opi[offset + 1] << 8);
}

uint8_t zplc_opi_read8(uint16_t offset) {
  if (offset >= ZPLC_MEM_OPI_SIZE) {
    return 0;
  }
  return mem_opi[offset];
}

int zplc_force_set_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size) {
  int free_index = -1;

  if (bytes == NULL || size == 0U || size > ZPLC_FORCE_MAX_BYTES) {
    return -1;
  }

  if (mem_ptr_raw(addr, size) == NULL) {
    return -2;
  }

  for (uint8_t i = 0; i < ZPLC_FORCE_MAX_ENTRIES; i++) {
    zplc_force_entry_t *entry = &force_entries[i];
    if (entry->active && entry->addr == addr) {
      entry->size = size;
      memcpy(entry->bytes, bytes, size);
      return raw_write_bytes(addr, bytes, size);
    }
    if (!entry->active && free_index < 0) {
      free_index = (int)i;
      continue;
    }
    if (force_entry_overlaps(entry, addr, size)) {
      return -3;
    }
  }

  if (free_index < 0) {
    return -4;
  }

  force_entries[free_index].active = 1U;
  force_entries[free_index].addr = addr;
  force_entries[free_index].size = size;
  memcpy(force_entries[free_index].bytes, bytes, size);
  return raw_write_bytes(addr, bytes, size);
}

int zplc_force_clear(uint16_t addr) {
  for (uint8_t i = 0; i < ZPLC_FORCE_MAX_ENTRIES; i++) {
    if (force_entries[i].active && force_entries[i].addr == addr) {
      memset(&force_entries[i], 0, sizeof(force_entries[i]));
      return 0;
    }
  }
  return -1;
}

void zplc_force_clear_all(void) { memset(force_entries, 0, sizeof(force_entries)); }

uint8_t zplc_force_get_count(void) {
  uint8_t count = 0;
  for (uint8_t i = 0; i < ZPLC_FORCE_MAX_ENTRIES; i++) {
    if (force_entries[i].active) {
      count++;
    }
  }
  return count;
}

int zplc_force_get(uint8_t index, uint16_t *addr, uint16_t *size,
                   uint8_t *bytes, size_t bytes_capacity) {
  uint8_t current = 0;

  for (uint8_t i = 0; i < ZPLC_FORCE_MAX_ENTRIES; i++) {
    if (!force_entries[i].active) {
      continue;
    }
    if (current == index) {
      if (addr != NULL) {
        *addr = force_entries[i].addr;
      }
      if (size != NULL) {
        *size = force_entries[i].size;
      }
      if (bytes == NULL) {
        return bytes_capacity == 0U ? 0 : -2;
      }
      if (bytes_capacity < force_entries[i].size) {
        return -2;
      }
      memcpy(bytes, force_entries[i].bytes, force_entries[i].size);
      return 0;
    }
    current++;
  }

  return -1;
}

int zplc_force_write_bytes(uint16_t addr, const uint8_t *bytes, uint16_t size) {
  int rc;

  rc = raw_write_bytes(addr, bytes, size);
  if (rc != 0) {
    return rc;
  }

  reapply_overlapping_forces(addr, size);
  return 0;
}

/* ============================================================================
 * Thread-Safe Process Image Access
 * ============================================================================
 */

int zplc_pi_lock(void) {
  if (pi_mutex == NULL) {
    return ZPLC_HAL_ERROR;
  }
  return (int)zplc_hal_mutex_lock(pi_mutex);
}

void zplc_pi_unlock(void) {
  if (pi_mutex != NULL) {
    zplc_hal_mutex_unlock(pi_mutex);
  }
}

/* ============================================================================
 * 64-bit integers and IEEE 754 double precision (CMP-015)
 * ============================================================================
 *
 * A 64-bit value takes two stack words, the low word below the high word, as
 * LOAD64 leaves it. The double-precision opcodes are implemented here in
 * integer arithmetic only. A double is a uint64_t bit pattern and every
 * operation is an exact IEEE 754 binary64 operation in round-to-nearest-even,
 * so a result does not depend on the C library, on hardware floating point,
 * on x87 extended precision, on contraction of expressions or on the
 * floating-point environment: it is the same on the 64-bit host, on -m32 and
 * on every target (RT-005, CMP-016).
 *
 * Results the language reference states:
 *
 *   Opcode        Operands                          Result
 *   MUL64         any                               low 64 bits of the product
 *   DIVS64        b == 0                            fault ZPLC_VM_DIV_BY_ZERO
 *                 a == INT64_MIN and b == -1        INT64_MIN
 *                 otherwise                         quotient truncated toward zero
 *   DIVU64 MODU64 b == 0                            fault ZPLC_VM_DIV_BY_ZERO
 *   MODS64        b == 0                            fault ZPLC_VM_DIV_BY_ZERO
 *                 b == -1                           0
 *                 otherwise                         remainder, sign of the dividend
 *   NEG64 ABS64   INT64_MIN                         INT64_MIN
 *   SHL64 SHR64   count >= 64 (count read as an unsigned 32-bit word) 0
 *   SAR64         count >= 64                       -1 if the value is negative, else 0
 *   ADDD SUBD MULD DIVD
 *                 any                               the IEEE 754 result, rounded to
 *                                                   nearest even; overflow is an infinity,
 *                                                   underflow is gradual
 *   DIVD          divisor is 0.0 or -0.0            fault ZPLC_VM_DIV_BY_ZERO
 *   every NaN result of a double operation          0x7FF8000000000000 (REAL: 0x7FC00000)
 *   NEGD ABSD     any                               flip or clear the sign bit; a NaN
 *                                                   keeps its payload
 *   SQRTD         a <= 0.0 (and -0.0)               +0.0
 *                 NaN                               the quiet NaN
 *                 otherwise                         the correctly rounded root
 *   RNDD          any                               the nearest integral value, a tie to
 *                                                   the even one; -0.4 is -0.0
 *   EQD NED LTD LED GTD GED
 *                 a NaN operand                     false, except NED which is true
 *                 -0.0 and +0.0                     equal
 *   F2D D2F       NaN                               the quiet NaN of the destination
 *   D2I D2L D2U   NaN                               0
 *                 out of range                      the nearest limit (D2U: a value below
 *                                                   1.0 is 0)
 *                 otherwise                         truncated toward zero
 *   I2D L2D U2D L2F U2F                             one rounding, to nearest even
 */

#define ZPLC_D_SIGN 0x8000000000000000ULL
#define ZPLC_D_EXP 0x7FF0000000000000ULL
#define ZPLC_D_FRAC 0x000FFFFFFFFFFFFFULL
#define ZPLC_D_HIDDEN 0x0010000000000000ULL
#define ZPLC_D_QNAN 0x7FF8000000000000ULL
#define ZPLC_F_QNAN 0x7FC00000U

/** Layout of an IEEE 754 binary format the rounding routine packs into. */
typedef struct {
  int precision;   /* significand bits, hidden bit included */
  int exp_bits;    /* width of the exponent field */
  int emin;        /* unbiased exponent of the smallest normal number */
  int emax;        /* unbiased exponent of the largest finite number */
} zplc_fp_format_t;

static const zplc_fp_format_t ZPLC_FP_DOUBLE = {53, 11, -1022, 1023};
static const zplc_fp_format_t ZPLC_FP_SINGLE = {24, 8, -126, 127};

static int wide_is_nan(uint64_t x) { return (x & ~ZPLC_D_SIGN) > ZPLC_D_EXP; }
static int wide_is_inf(uint64_t x) { return (x & ~ZPLC_D_SIGN) == ZPLC_D_EXP; }
static int wide_is_zero(uint64_t x) { return (x & ~ZPLC_D_SIGN) == 0U; }

/** Number of significant bits of v: 0 for 0, 64 for a value with bit 63 set. */
static int wide_bit_length(uint64_t v) {
  int n = 0;
  if ((v >> 32) != 0U) {
    n += 32;
    v >>= 32;
  }
  if ((v >> 16) != 0U) {
    n += 16;
    v >>= 16;
  }
  if ((v >> 8) != 0U) {
    n += 8;
    v >>= 8;
  }
  if ((v >> 4) != 0U) {
    n += 4;
    v >>= 4;
  }
  if ((v >> 2) != 0U) {
    n += 2;
    v >>= 2;
  }
  if ((v >> 1) != 0U) {
    n += 1;
    v >>= 1;
  }
  return n + (int)v;
}

/**
 * Round sig * 2^exp2 (plus a positive amount below one unit of sig when
 * `sticky` is set) to the nearest value of the format, a tie to the even
 * one, and return its bit pattern. sig must not be 0. A caller that passes a
 * sticky amount gives a sig of at least 61 bits, so that the normalisation
 * below shifts it left by at most three bits and the amount stays a
 * remainder, never reaching the rounding position.
 */
static uint64_t wide_round_pack(int sign, int exp2, uint64_t sig, int sticky,
                                const zplc_fp_format_t *fmt) {
  const int frac_bits = fmt->precision - 1;
  const int sign_shift = frac_bits + fmt->exp_bits;
  const uint64_t sign_bit = (uint64_t)(sign != 0 ? 1U : 0U) << sign_shift;
  int drop = 64 - fmt->precision; /* bits of sig below the kept significand */
  uint64_t mantissa, rest, half;
  int e, subnormal = 0;

  if (sig == 0U) {
    return sign_bit;
  }
  {
    const int shift = 64 - wide_bit_length(sig);
    sig <<= shift;
    exp2 -= shift;
  }
  e = exp2 + 63; /* exponent of the leading bit */
  if (e < fmt->emin) {
    drop += fmt->emin - e;
    subnormal = 1;
  }
  if (drop > 64) {
    /* below half of the smallest step: rounds to zero */
    return sign_bit;
  }
  if (drop == 64) {
    mantissa = 0U;
    rest = sig;
    half = 0x8000000000000000ULL;
  } else {
    mantissa = sig >> drop;
    rest = sig & ((1ULL << drop) - 1U);
    half = 1ULL << (drop - 1);
  }
  if (rest > half || (rest == half && (sticky != 0 || (mantissa & 1U) != 0U))) {
    mantissa++;
  }
  if (subnormal != 0) {
    /* a mantissa that rounded up to 2^frac_bits is the smallest normal number */
    return sign_bit | mantissa;
  }
  if (mantissa == (1ULL << fmt->precision)) {
    mantissa >>= 1;
    e++;
  }
  if (e > fmt->emax) {
    return sign_bit | ((uint64_t)((1U << fmt->exp_bits) - 1U) << frac_bits);
  }
  return sign_bit | ((uint64_t)(e + fmt->emax) << frac_bits) |
         (mantissa & ((1ULL << frac_bits) - 1U));
}

/** A finite double as sign and m * 2^e, m below 2^53. */
static void wide_unpack_d(uint64_t x, int *sign, int *e, uint64_t *m) {
  const int field = (int)((x >> 52) & 0x7FFU);
  *sign = (int)(x >> 63);
  if (field == 0) {
    *m = x & ZPLC_D_FRAC;
    *e = -1074;
  } else {
    *m = (x & ZPLC_D_FRAC) | ZPLC_D_HIDDEN;
    *e = field - 1075;
  }
}

/** Shift m left until bit 52 is set, for the operands of a product or a quotient. */
static void wide_normalize53(uint64_t *m, int *e) {
  while ((*m & ZPLC_D_HIDDEN) == 0U) {
    *m <<= 1;
    (*e)--;
  }
}

static uint64_t wide_add_d(uint64_t a, uint64_t b, int subtract) {
  int sa, sb, ea, eb, d, sticky = 0, sign;
  uint64_t ma, mb, wa, wb, sum;

  if (wide_is_nan(a) || wide_is_nan(b)) {
    return ZPLC_D_QNAN;
  }
  if (subtract != 0) {
    b ^= ZPLC_D_SIGN;
  }
  if (wide_is_inf(a)) {
    return (wide_is_inf(b) && ((a ^ b) & ZPLC_D_SIGN) != 0U) ? ZPLC_D_QNAN : a;
  }
  if (wide_is_inf(b)) {
    return b;
  }
  if (wide_is_zero(a) && wide_is_zero(b)) {
    return a & b & ZPLC_D_SIGN; /* only -0.0 + -0.0 is -0.0 */
  }
  if (wide_is_zero(a)) {
    return b;
  }
  if (wide_is_zero(b)) {
    return a;
  }
  wide_unpack_d(a, &sa, &ea, &ma);
  wide_unpack_d(b, &sb, &eb, &mb);
  if (ea < eb || (ea == eb && ma < mb)) {
    int t;
    uint64_t u;
    t = sa; sa = sb; sb = t;
    t = ea; ea = eb; eb = t;
    u = ma; ma = mb; mb = u;
  }
  /* ten guard bits below each significand; b is then aligned, its lost bits are a sticky */
  wa = ma << 10;
  wb = mb << 10;
  d = ea - eb;
  if (d >= 64) {
    sticky = 1;
    wb = 0U;
  } else if (d > 0) {
    sticky = (wb & ((1ULL << d) - 1U)) != 0U;
    wb >>= d;
  }
  if (sa == sb) {
    sum = wa + wb;
    sign = sa;
  } else {
    sum = wa - wb - (uint64_t)sticky;
    sign = sa;
    if (sum == 0U && sticky == 0) {
      return 0U; /* x - x is +0.0 */
    }
  }
  return wide_round_pack(sign, ea - 10, sum, sticky, &ZPLC_FP_DOUBLE);
}

static uint64_t wide_mul_d(uint64_t a, uint64_t b) {
  const uint64_t sign = (a ^ b) & ZPLC_D_SIGN;
  int sa, sb, ea, eb, shift;
  uint64_t ma, mb, p00, p01, p10, p11, mid, low, high;

  if (wide_is_nan(a) || wide_is_nan(b)) {
    return ZPLC_D_QNAN;
  }
  if (wide_is_inf(a) || wide_is_inf(b)) {
    return (wide_is_zero(a) || wide_is_zero(b)) ? ZPLC_D_QNAN : (sign | ZPLC_D_EXP);
  }
  if (wide_is_zero(a) || wide_is_zero(b)) {
    return sign;
  }
  wide_unpack_d(a, &sa, &ea, &ma);
  wide_unpack_d(b, &sb, &eb, &mb);
  wide_normalize53(&ma, &ea);
  wide_normalize53(&mb, &eb);
  /* the 106-bit product from 32-bit limbs: ma and mb are below 2^53 */
  p00 = (ma & 0xFFFFFFFFU) * (mb & 0xFFFFFFFFU);
  p01 = (ma & 0xFFFFFFFFU) * (mb >> 32);
  p10 = (ma >> 32) * (mb & 0xFFFFFFFFU);
  p11 = (ma >> 32) * (mb >> 32);
  mid = p01 + p10;
  low = p00 + ((mid & 0xFFFFFFFFU) << 32);
  high = p11 + (mid >> 32) + (low < p00 ? 1U : 0U);
  /* bring the leading bit of (high:low) to bit 127; high holds 42 bits at most */
  shift = 64 - wide_bit_length(high);
  high = (high << shift) | (low >> (64 - shift));
  low <<= shift;
  return wide_round_pack((int)(sign >> 63), ea + eb + 64 - shift, high, low != 0U,
                         &ZPLC_FP_DOUBLE);
}

/** a / b for a divisor that is not zero (the VM faults on a zero divisor before it gets here). */
static uint64_t wide_div_d(uint64_t a, uint64_t b) {
  const uint64_t sign = (a ^ b) & ZPLC_D_SIGN;
  int sa, sb, ea, eb, i;
  uint64_t ma, mb, remainder, quotient = 0U;

  if (wide_is_nan(a) || wide_is_nan(b)) {
    return ZPLC_D_QNAN;
  }
  if (wide_is_inf(a)) {
    return wide_is_inf(b) ? ZPLC_D_QNAN : (sign | ZPLC_D_EXP);
  }
  if (wide_is_zero(b)) {
    return ZPLC_D_QNAN; /* not reached: the VM faults on a zero divisor first */
  }
  if (wide_is_inf(b) || wide_is_zero(a)) {
    return sign;
  }
  wide_unpack_d(a, &sa, &ea, &ma);
  wide_unpack_d(b, &sb, &eb, &mb);
  wide_normalize53(&ma, &ea);
  wide_normalize53(&mb, &eb);
  /* floor(ma * 2^62 / mb) by restoring division: one integer bit and 62 fraction bits */
  remainder = ma;
  for (i = 0; i < 63; i++) {
    quotient <<= 1;
    if (remainder >= mb) {
      remainder -= mb;
      quotient |= 1U;
    }
    remainder <<= 1;
  }
  return wide_round_pack((int)(sign >> 63), ea - eb - 62, quotient, remainder != 0U,
                         &ZPLC_FP_DOUBLE);
}

/** Correctly rounded square root of a positive finite double. */
static uint64_t wide_sqrt_d(uint64_t x) {
  int sign, e, i;
  uint64_t m, root = 0U, rem_hi = 0U, rem_lo = 0U;

  wide_unpack_d(x, &sign, &e, &m);
  wide_normalize53(&m, &e);
  if ((e & 1) != 0) {
    m <<= 1;
    e--;
  }
  /* sqrt(m * 2^e) = isqrt(m * 2^72) * 2^((e - 72) / 2); n = (m << 8):0 as two words */
  {
    const uint64_t n_hi = m << 8;
    for (i = 63; i >= 0; i--) {
      uint64_t trial_hi, trial_lo, bits;

      bits = (i >= 32) ? ((n_hi >> (2 * (i - 32))) & 3U) : 0U;
      rem_hi = (rem_hi << 2) | (rem_lo >> 62);
      rem_lo = (rem_lo << 2) | bits;
      trial_hi = root >> 62;
      trial_lo = (root << 2) | 1U;
      root <<= 1;
      if (rem_hi > trial_hi || (rem_hi == trial_hi && rem_lo >= trial_lo)) {
        rem_hi -= trial_hi + (rem_lo < trial_lo ? 1U : 0U);
        rem_lo -= trial_lo;
        root |= 1U;
      }
    }
  }
  return wide_round_pack(0, (e - 72) / 2, root, (rem_hi | rem_lo) != 0U, &ZPLC_FP_DOUBLE);
}

/** -1, 0 or 1 for the order of two doubles, 2 when either is a NaN. */
static int wide_compare_d(uint64_t a, uint64_t b) {
  int64_t ka, kb;
  if (wide_is_nan(a) || wide_is_nan(b)) {
    return 2;
  }
  ka = (int64_t)(a & ~ZPLC_D_SIGN);
  kb = (int64_t)(b & ~ZPLC_D_SIGN);
  if ((a & ZPLC_D_SIGN) != 0U) {
    ka = -ka;
  }
  if ((b & ZPLC_D_SIGN) != 0U) {
    kb = -kb;
  }
  return ka < kb ? -1 : (ka > kb ? 1 : 0);
}

/** The double nearest to the integer sign * mag. */
static uint64_t wide_from_integer(int sign, uint64_t mag) {
  return mag == 0U ? 0U : wide_round_pack(sign, 0, mag, 0, &ZPLC_FP_DOUBLE);
}

/** The REAL pattern nearest to the integer sign * mag: one rounding. */
static uint32_t wide_integer_to_f(int sign, uint64_t mag) {
  return (uint32_t)wide_round_pack(sign, 0, mag, 0, &ZPLC_FP_SINGLE);
}

static uint64_t wide_f_to_d(uint32_t x) {
  const int sign = (int)(x >> 31);
  const int field = (int)((x >> 23) & 0xFFU);
  const uint32_t frac = x & 0x7FFFFFU;
  if (field == 0xFF) {
    return frac != 0U ? ZPLC_D_QNAN
                      : (((uint64_t)(unsigned)sign << 63) | ZPLC_D_EXP);
  }
  if (field == 0 && frac == 0U) {
    return (uint64_t)(unsigned)sign << 63;
  }
  if (field == 0) {
    return wide_round_pack(sign, -149, frac, 0, &ZPLC_FP_DOUBLE);
  }
  return wide_round_pack(sign, field - 150, frac | 0x800000U, 0, &ZPLC_FP_DOUBLE);
}

static uint32_t wide_d_to_f(uint64_t x) {
  int sign, e;
  uint64_t m;
  if (wide_is_nan(x)) {
    return ZPLC_F_QNAN;
  }
  sign = (int)(x >> 63);
  if (wide_is_inf(x)) {
    return ((uint32_t)sign << 31) | 0x7F800000U;
  }
  if (wide_is_zero(x)) {
    return (uint32_t)sign << 31;
  }
  wide_unpack_d(x, &sign, &e, &m);
  return (uint32_t)wide_round_pack(sign, e, m, 0, &ZPLC_FP_SINGLE);
}

/**
 * The magnitude of a double truncated toward zero. *overflow is set when it is
 * 2^64 or more (an infinity included); a NaN has none and gives 0.
 */
static uint64_t wide_truncate_d(uint64_t x, int *sign, int *overflow) {
  int e;
  uint64_t m;
  *overflow = 0;
  *sign = (int)(x >> 63);
  if (wide_is_nan(x) || wide_is_zero(x)) {
    return 0U;
  }
  if (wide_is_inf(x)) {
    *overflow = 1;
    return 0U;
  }
  wide_unpack_d(x, sign, &e, &m);
  if (e >= 0) {
    if (e > 11 || wide_bit_length(m) + e > 64) {
      *overflow = 1;
      return 0U;
    }
    return m << e;
  }
  return -e >= 64 ? 0U : m >> (-e);
}

/** D2L: the two's complement pattern of the truncated, saturated 64-bit integer. */
static uint64_t wide_d_to_i64(uint64_t x) {
  int sign, overflow;
  uint64_t mag;
  if (wide_is_nan(x)) {
    return 0U;
  }
  mag = wide_truncate_d(x, &sign, &overflow);
  if (sign == 0) {
    return (overflow != 0 || mag > 0x7FFFFFFFFFFFFFFFULL) ? 0x7FFFFFFFFFFFFFFFULL : mag;
  }
  return (overflow != 0 || mag > 0x8000000000000000ULL) ? 0x8000000000000000ULL : 0U - mag;
}

static uint64_t wide_d_to_u64(uint64_t x) {
  int sign, overflow;
  uint64_t mag;
  if (wide_is_nan(x)) {
    return 0U;
  }
  mag = wide_truncate_d(x, &sign, &overflow);
  if (sign != 0 && !wide_is_zero(x)) {
    return 0U;
  }
  return overflow != 0 ? 0xFFFFFFFFFFFFFFFFULL : mag;
}

/** D2I: the 64-bit result narrowed with saturation to the signed 32-bit range. */
static uint32_t wide_d_to_i32(uint64_t x) {
  const uint64_t v = wide_d_to_i64(x);
  if ((v >> 63) != 0U) {
    return v < 0xFFFFFFFF80000000ULL ? 0x80000000U : (uint32_t)v;
  }
  return v > 0x7FFFFFFFU ? 0x7FFFFFFFU : (uint32_t)v;
}

/** RNDD: the nearest integral value, a tie to the even one, the sign of a zero kept. */
static uint64_t wide_round_integral_d(uint64_t x) {
  int sign, e, shift;
  uint64_t m, whole, rest, half;
  if (wide_is_nan(x)) {
    return ZPLC_D_QNAN;
  }
  if (wide_is_inf(x) || wide_is_zero(x)) {
    return x;
  }
  wide_unpack_d(x, &sign, &e, &m);
  if (e >= 0) {
    return x; /* every double with an exponent of 2^52 or more is integral */
  }
  shift = -e;
  if (shift > 63) {
    return x & ZPLC_D_SIGN; /* below 2^-10: rounds to zero */
  }
  whole = m >> shift;
  rest = m & ((1ULL << shift) - 1U);
  half = 1ULL << (shift - 1);
  if (rest > half || (rest == half && (whole & 1U) != 0U)) {
    whole++;
  }
  if (whole == 0U) {
    return x & ZPLC_D_SIGN;
  }
  return wide_round_pack(sign, 0, whole, 0, &ZPLC_FP_DOUBLE);
}

/* ============================================================================
 * VM Instance API
 * ============================================================================
 */

int zplc_vm_init(zplc_vm_t *vm) {
  if (vm == NULL) {
    return -1;
  }

  memset(vm, 0, sizeof(zplc_vm_t));
  vm->pc = 0;
  vm->sp = 0;
  vm->stack_limit = ZPLC_STACK_MAX_DEPTH;
  vm->bp = 0;
  vm->call_depth = 0;
  vm->flags = 0;
  vm->error = ZPLC_VM_OK;
  vm->halted = 0;
  vm->paused = 0;
  vm->resume_skip_breakpoint_once = 0;
  vm->scan_resumed = 0;
  vm->scan_instructions = 0;
  vm->breakpoint_count = 0;
  vm->code = mem_code;
  vm->code_size = code_size;
  vm->entry_point = 0;
  vm->task_id = 0;
  vm->priority = 0;

  return 0;
}

int zplc_vm_set_entry(zplc_vm_t *vm, uint16_t entry_point,
                      uint32_t task_code_size) {
  if (vm == NULL) {
    return -1;
  }
  /* entry_point + task_code_size may exceed 32 bits: compare without adding */
  if (task_code_size > code_size || entry_point > code_size - task_code_size) {
    return -2;
  }

  vm->entry_point = entry_point;
  vm->code = mem_code;
  /* code_size is the END of this task's code in global segment
   * (entry_point + task_code_size), not just the task's size.
   * This allows bounds check: pc >= code_size fails if pc goes past end */
  vm->code_size = entry_point + task_code_size;
  vm->pc = entry_point;
  vm->scan_resumed = 0U;
  vm->scan_instructions = 0U;

  return 0;
}

void zplc_vm_reset_cycle(zplc_vm_t *vm) {
  const uint8_t resume_skip_breakpoint_once = vm != NULL ? vm->resume_skip_breakpoint_once : 0U;

  if (vm == NULL) {
    return;
  }
  vm->pc = vm->entry_point;
  vm->sp = 0;
  vm->call_depth = 0;
  vm->halted = 0;
  vm->paused = 0;
  vm->resume_skip_breakpoint_once = resume_skip_breakpoint_once;
  vm->scan_resumed = 0U; /* starting over abandons any interrupted scan */
  vm->scan_instructions = 0U;
  vm->error = ZPLC_VM_OK;
  /* Note: breakpoints are preserved across cycles */
}

int zplc_vm_get_error(const zplc_vm_t *vm) {
  if (vm == NULL) {
    return -1;
  }
  return vm->error;
}

int zplc_vm_is_halted(const zplc_vm_t *vm) {
  if (vm == NULL) {
    return 1;
  }
  return vm->halted;
}

uint32_t zplc_vm_get_stack(const zplc_vm_t *vm, uint16_t index) {
  if (vm == NULL || vm->stack_limit == 0U ||
      vm->stack_limit > ZPLC_STACK_MAX_DEPTH || index >= vm->sp ||
      index >= vm->stack_limit || index >= ZPLC_STACK_MAX_DEPTH) {
    return 0;
  }
  return vm->stack[index];
}

uint16_t zplc_vm_get_sp(const zplc_vm_t *vm) {
  if (vm == NULL) {
    return 0;
  }
  return vm->sp;
}

uint16_t zplc_vm_get_pc(const zplc_vm_t *vm) {
  if (vm == NULL) {
    return 0;
  }
  return vm->pc;
}

/**
 * @brief Execute a single instruction on a VM instance.
 *
 * @param vm Pointer to VM instance
 * @return VM error code (ZPLC_VM_OK if successful)
 */
int zplc_vm_step(zplc_vm_t *vm) {
  uint8_t opcode;
  uint8_t operand8;
  uint16_t operand16;
  uint32_t operand32;
  uint32_t a, b, result;
  uint64_t wa, wb, wr;
  int32_t sa, sb;
  int mem_result;
  const uint8_t *code;
  uint8_t bp_idx;

  if (vm == NULL) {
    return ZPLC_VM_INVALID_OPCODE;
  }

  if (vm->stack_limit == 0U || vm->stack_limit > ZPLC_STACK_MAX_DEPTH ||
      vm->sp > vm->stack_limit || vm->sp > ZPLC_STACK_MAX_DEPTH) {
    vm->error = ZPLC_VM_STACK_OVERFLOW;
    vm->halted = 1U;
    vm->paused = 0U;
    return ZPLC_VM_STACK_OVERFLOW;
  }

  /* Check if paused (at breakpoint) */
  if (vm->paused) {
    return ZPLC_VM_PAUSED;
  }

  /* Check if halted */
  if (vm->halted) {
    return vm->error;
  }

  /* Check code pointer */
  code = vm->code;
  if (code == NULL) {
    vm->error = ZPLC_VM_INVALID_OPCODE;
    vm->halted = 1;
    return vm->error;
  }

  /* Bounds check PC */
  if (vm->pc >= vm->code_size) {
    vm->error = ZPLC_VM_INVALID_JUMP;
    vm->halted = 1;
    return vm->error;
  }

  /* Check for breakpoints at current PC */
  if (vm->resume_skip_breakpoint_once != 0U) {
    vm->resume_skip_breakpoint_once = 0U;
  } else {
    for (bp_idx = 0; bp_idx < vm->breakpoint_count; bp_idx++) {
      if (vm->breakpoints[bp_idx] == vm->pc) {
        vm->paused = 1;
        vm->error = ZPLC_VM_PAUSED;
        hil_trace_break(vm->pc);
        return ZPLC_VM_PAUSED;
      }
    }
  }

  /* Fetch opcode */
  opcode = code[vm->pc];

  /* Decode and execute */
  switch (opcode) {

    /* ===== System Operations ===== */

  case OP_NOP:
    vm->pc++;
    break;

  case OP_HALT:
    vm->halted = 1;
    vm->error = ZPLC_VM_HALTED;
    vm->pc++;
    return ZPLC_VM_HALTED;

  case OP_BREAK:
    /* Debugger breakpoint - pause execution */
    vm->paused = 1;
    vm->error = ZPLC_VM_PAUSED;
    hil_trace_break(vm->pc);
    vm->pc++; /* Advance past BREAK so resume continues */
    return ZPLC_VM_PAUSED;

  case OP_GET_TICKS:
    VM_CHECK_STACK_OVERFLOW(vm);
    VM_PUSH(vm, zplc_hal_tick());
    vm->pc++;
    break;

    /* ===== Stack Operations ===== */

  case OP_DUP:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_PEEK(vm);
    VM_PUSH(vm, a);
    vm->pc++;
    break;

  case OP_DROP:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    (void)VM_POP(vm);
    vm->pc++;
    break;

  case OP_SWAP:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    a = vm->stack[vm->sp - 1];
    b = vm->stack[vm->sp - 2];
    vm->stack[vm->sp - 1] = b;
    vm->stack[vm->sp - 2] = a;
    vm->pc++;
    break;

  case OP_OVER:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    a = vm->stack[vm->sp - 2];
    VM_PUSH(vm, a);
    vm->pc++;
    break;

  case OP_ROT:
    VM_CHECK_STACK_UNDERFLOW(vm, 3);
    a = vm->stack[vm->sp - 3];      /* bottom */
    b = vm->stack[vm->sp - 2];      /* middle */
    result = vm->stack[vm->sp - 1]; /* top */
    vm->stack[vm->sp - 3] = b;
    vm->stack[vm->sp - 2] = result;
    vm->stack[vm->sp - 1] = a;
    vm->pc++;
    break;

    /* ===== Indirect Memory Access ===== */

  case OP_LOADI8:
    /* Stack: [addr] -> [value] */
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm); /* address */
    {
      uint8_t val8;
      mem_result = mem_read8(a, &val8);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, (uint32_t)val8);
    }
    vm->pc++;
    break;

  case OP_LOADI32:
    /* Stack: [addr] -> [value] */
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm); /* address */
    {
      uint32_t val32;
      mem_result = mem_read32(a, &val32);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, val32);
    }
    vm->pc++;
    break;

  case OP_STOREI8:
    /* Stack: [addr val] -> [] */
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    a = VM_POP(vm); /* value */
    b = VM_POP(vm); /* address */
    mem_result = mem_write8(b, (uint8_t)a);
    if (mem_result != ZPLC_VM_OK) {
      vm->error = (uint8_t)mem_result;
      vm->halted = 1;
      return mem_result;
    }
    vm->pc++;
    break;

  case OP_STOREI32:
    /* Stack: [addr val] -> [] */
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    a = VM_POP(vm); /* value */
    b = VM_POP(vm); /* address */
    mem_result = mem_write32(b, a);
    if (mem_result != ZPLC_VM_OK) {
      vm->error = (uint8_t)mem_result;
      vm->halted = 1;
      return mem_result;
    }
    vm->pc++;
    break;

  case OP_LOADI16:
    /* Stack: [addr] -> [value] */
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm); /* address */
    {
      uint16_t val16;
      mem_result = mem_read16(a, &val16);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, (uint32_t)val16);
    }
    vm->pc++;
    break;

  case OP_STOREI16:
    /* Stack: [addr val] -> [] */
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    a = VM_POP(vm); /* value */
    b = VM_POP(vm); /* address */
    mem_result = mem_write16(b, (uint16_t)a);
    if (mem_result != ZPLC_VM_OK) {
      vm->error = (uint8_t)mem_result;
      vm->halted = 1;
      return mem_result;
    }
    vm->pc++;
    break;

    /* ===== String Operations ===== */
    /*
     * String memory layout:
     *   Offset 0: current_length (uint16_t)
     *   Offset 2: max_capacity (uint16_t)
     *   Offset 4: data[max_capacity+1] (null-terminated)
     */

  case OP_STRLEN:
    /* Stack: [str_addr] -> [length] */
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm); /* string address */
    {
      uint16_t str_len;
      mem_result = mem_read16(a, &str_len);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, (uint32_t)str_len);
    }
    vm->pc++;
    break;

  case OP_STRCPY:
    /* Stack: [src_addr dst_addr] -> [] (safe copy with bounds check) */
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm); /* dst_addr */
    a = VM_POP(vm); /* src_addr */
    {
      uint16_t src_len, dst_cap;
      uint16_t copy_len;
      uint16_t i;
      uint8_t ch;

      /* Headers first. Both strings are then placed in full before the first
       * byte is written, so a fault leaves memory as it was (RT-001). */
      if (!string_extent_ok(a, 0U, 0) || !string_extent_ok(b, 0U, 1)) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }
      mem_result = mem_read16(a, &src_len);
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_read16(b + ZPLC_STRING_CAP_OFFSET, &dst_cap);
      }
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }

      /* Calculate safe copy length (bounds check) */
      copy_len = (src_len < dst_cap) ? src_len : dst_cap;
      if (!string_extent_ok(a, copy_len, 0) ||
          !string_extent_ok(b, copy_len, 1)) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }

      /* Copy character by character (a and b are below 0x5000 here) */
      for (i = 0; i < copy_len; i++) {
        mem_result = mem_read8(a + ZPLC_STRING_DATA_OFFSET + i, &ch);
        if (mem_result == ZPLC_VM_OK) {
          mem_result = mem_write8(b + ZPLC_STRING_DATA_OFFSET + i, ch);
        }
        if (mem_result != ZPLC_VM_OK) {
          vm->error = (uint8_t)mem_result;
          vm->halted = 1;
          return mem_result;
        }
      }

      /* Null-terminate, then update the destination length */
      mem_result = mem_write8(b + ZPLC_STRING_DATA_OFFSET + copy_len, 0);
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_write16(b, copy_len);
      }
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
    }
    vm->pc++;
    break;

  case OP_STRCAT:
    /* Stack: [src_addr dst_addr] -> [] (safe concat with bounds check) */
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm); /* dst_addr */
    a = VM_POP(vm); /* src_addr */
    {
      uint16_t src_len, dst_len, dst_cap;
      uint16_t space_left, copy_len;
      uint16_t i;
      uint8_t ch;

      if (!string_extent_ok(a, 0U, 0) || !string_extent_ok(b, 0U, 1)) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }
      mem_result = mem_read16(a, &src_len);
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_read16(b, &dst_len);
      }
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_read16(b + ZPLC_STRING_CAP_OFFSET, &dst_cap);
      }
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }

      /* Calculate safe append length (bounds check) */
      space_left = (dst_cap > dst_len) ? (dst_cap - dst_len) : 0;
      copy_len = (src_len < space_left) ? src_len : space_left;
      if (!string_extent_ok(a, copy_len, 0) ||
          !string_extent_ok(b, (uint32_t)dst_len + copy_len, 1)) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }

      /* Append character by character (a and b are below 0x5000 here) */
      for (i = 0; i < copy_len; i++) {
        mem_result = mem_read8(a + ZPLC_STRING_DATA_OFFSET + i, &ch);
        if (mem_result == ZPLC_VM_OK) {
          mem_result =
              mem_write8(b + ZPLC_STRING_DATA_OFFSET + dst_len + i, ch);
        }
        if (mem_result != ZPLC_VM_OK) {
          vm->error = (uint8_t)mem_result;
          vm->halted = 1;
          return mem_result;
        }
      }

      /* Null-terminate, then update the destination length */
      mem_result =
          mem_write8(b + ZPLC_STRING_DATA_OFFSET + dst_len + copy_len, 0);
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_write16(b, (uint16_t)(dst_len + copy_len));
      }
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
    }
    vm->pc++;
    break;

  case OP_STRCMP:
    /* Stack: [addr1 addr2] -> [result] (-1, 0, or 1) */
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm); /* addr2 */
    a = VM_POP(vm); /* addr1 */
    {
      uint16_t len1, len2;
      uint16_t min_len, i;
      uint8_t ch1, ch2;
      int32_t strcmp_result = 0;

      /* Read lengths; an address that is not in PLC memory faults here, so
       * the data offsets below stay under 0x5000 (they cannot wrap) */
      mem_result = mem_read16(a, &len1);
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_read16(b, &len2);
      }
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }

      /* The characters compared are the shorter length of the two. Each
       * string is placed whole (header and those characters) before the first
       * is read, as STRCPY does, so a length that reaches past the end of its
       * region faults instead of reading on into the next one (RT-001). */
      min_len = (len1 < len2) ? len1 : len2;
      if (!string_extent_ok(a, min_len, 0) ||
          !string_extent_ok(b, min_len, 0)) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }

      /* Compare character by character */
      for (i = 0; i < min_len; i++) {
        mem_result = mem_read8(a + ZPLC_STRING_DATA_OFFSET + i, &ch1);
        if (mem_result == ZPLC_VM_OK) {
          mem_result = mem_read8(b + ZPLC_STRING_DATA_OFFSET + i, &ch2);
        }
        if (mem_result != ZPLC_VM_OK) {
          vm->error = (uint8_t)mem_result;
          vm->halted = 1;
          return mem_result;
        }
        if (ch1 < ch2) {
          strcmp_result = -1;
          break;
        } else if (ch1 > ch2) {
          strcmp_result = 1;
          break;
        }
      }

      /* If all compared chars equal, shorter string is "less" */
      if (strcmp_result == 0) {
        if (len1 < len2) {
          strcmp_result = -1;
        } else if (len1 > len2) {
          strcmp_result = 1;
        }
      }

      VM_PUSH(vm, (uint32_t)strcmp_result);
    }
    vm->pc++;
    break;

  case OP_STRCLR:
    /* Stack: [str_addr] -> [] (clear string to empty) */
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm); /* string address */
    {
      /* Header and terminator are placed before either is written */
      if (!string_extent_ok(a, 0U, 1)) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }
      /* Set length to 0, then null-terminate at start */
      mem_result = mem_write16(a, 0);
      if (mem_result == ZPLC_VM_OK) {
        mem_result = mem_write8(a + ZPLC_STRING_DATA_OFFSET, 0);
      }
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
    }
    vm->pc++;
    break;

    /* ===== Integer Arithmetic =====
     *
     * Defined results of the integer and REAL edge cases (RT-005, CMP-016).
     * No input may crash the process or invoke undefined behaviour in C, and
     * every result is the same on every platform. The stack holds 32-bit two's
     * complement values; a narrower type wraps at its own width when its STORE
     * opcode truncates the result. Until the language reference states these
     * results (generated reference, DOC-006), this table is the statement.
     *
     *   Opcode      Operands                       Result
     *   ADD SUB MUL any                            wraps modulo 2^32
     *   DIV         b == 0                         fault ZPLC_VM_DIV_BY_ZERO
     *               a == INT32_MIN and b == -1     INT32_MIN
     *               otherwise                      quotient truncated toward zero
     *   MOD         b == 0                         fault ZPLC_VM_DIV_BY_ZERO
     *               b == -1                        0
     *               otherwise                      remainder, sign of the dividend
     *   NEG ABS     INT32_MIN                      INT32_MIN
     *   SHL SHR     count >= 32                    0
     *   SAR         count >= 32                    -1 if the value is negative, else 0
     *   F2I         NaN                            0
     *               >= 2^31 (or +Inf)              INT32_MAX
     *               <= -2^31 (or -Inf)             INT32_MIN
     *               otherwise                      truncated toward zero
     *
     * A shift count is read as unsigned, so a negative count is 32 or more.
     */

  case OP_ADD:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a + b);
    vm->pc++;
    break;

  case OP_SUB:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a - b);
    vm->pc++;
    break;

  case OP_MUL:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a * b);
    vm->pc++;
    break;

  case OP_DIV:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    if (b == 0) {
      vm->error = ZPLC_VM_DIV_BY_ZERO;
      vm->halted = 1;
      return ZPLC_VM_DIV_BY_ZERO;
    }
    sa = (int32_t)a;
    sb = (int32_t)b;
    /* INT32_MIN / -1 does not fit: negate in unsigned arithmetic (INT32_MIN). */
    VM_PUSH(vm, sb == -1 ? 0U - a : (uint32_t)(sa / sb));
    vm->pc++;
    break;

  case OP_MOD:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    if (b == 0) {
      vm->error = ZPLC_VM_DIV_BY_ZERO;
      vm->halted = 1;
      return ZPLC_VM_DIV_BY_ZERO;
    }
    sa = (int32_t)a;
    sb = (int32_t)b;
    VM_PUSH(vm, sb == -1 ? 0U : (uint32_t)(sa % sb));
    vm->pc++;
    break;

  case OP_NEG:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, 0U - a);
    vm->pc++;
    break;

  case OP_ABS:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, (a >> 31) != 0U ? 0U - a : a);
    vm->pc++;
    break;

    /* ===== Float Arithmetic ===== */

  case OP_ADDF:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      fr = fa + fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_SUBF:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      fr = fa - fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_MULF:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      fr = fa * fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_DIVF:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    {
      float fa, fb, fr;
      memcpy(&fa, &a, sizeof(float));
      memcpy(&fb, &b, sizeof(float));
      if (fb == 0.0f) {
        vm->error = ZPLC_VM_DIV_BY_ZERO;
        vm->halted = 1;
        return ZPLC_VM_DIV_BY_ZERO;
      }
      fr = fa / fb;
      memcpy(&result, &fr, sizeof(uint32_t));
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_NEGF:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    {
      float fa;
      memcpy(&fa, &a, sizeof(float));
      fa = -fa;
      memcpy(&result, &fa, sizeof(uint32_t));
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_ABSF:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    /* IEEE-754 absolute value clears the sign bit: -0.0 gives +0.0 and a
     * negative NaN a positive one (a comparison with 0.0 would keep both). */
    VM_PUSH(vm, a & 0x7FFFFFFFU);
    vm->pc++;
    break;

    /* ===== Logical/Bitwise Operations ===== */

  case OP_AND:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a & b);
    vm->pc++;
    break;

  case OP_OR:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a | b);
    vm->pc++;
    break;

  case OP_XOR:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a ^ b);
    vm->pc++;
    break;

  case OP_NOT:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, ~a);
    vm->pc++;
    break;

  case OP_SHL:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, b >= 32U ? 0U : a << b);
    vm->pc++;
    break;

  case OP_SHR:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, b >= 32U ? 0U : a >> b);
    vm->pc++;
    break;

  case OP_SAR:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    /* Clamping the count to 31 gives -1 or 0 for a count of 32 or more; the
     * complement form avoids the implementation-defined signed right shift. */
    if (b > 31U) {
      b = 31U;
    }
    VM_PUSH(vm, (a >> 31) != 0U ? ~(~a >> b) : a >> b);
    vm->pc++;
    break;

    /* ===== Comparison Operations ===== */

  case OP_EQ:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a == b ? 1 : 0);
    vm->pc++;
    break;

  case OP_NE:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a != b ? 1 : 0);
    vm->pc++;
    break;

  case OP_LT:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    sa = (int32_t)a;
    sb = (int32_t)b;
    VM_PUSH(vm, sa < sb ? 1 : 0);
    vm->pc++;
    break;

  case OP_LE:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    sa = (int32_t)a;
    sb = (int32_t)b;
    VM_PUSH(vm, sa <= sb ? 1 : 0);
    vm->pc++;
    break;

  case OP_GT:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    sa = (int32_t)a;
    sb = (int32_t)b;
    VM_PUSH(vm, sa > sb ? 1 : 0);
    vm->pc++;
    break;

  case OP_GE:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    sa = (int32_t)a;
    sb = (int32_t)b;
    VM_PUSH(vm, sa >= sb ? 1 : 0);
    vm->pc++;
    break;

  case OP_LTU:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a < b ? 1 : 0);
    vm->pc++;
    break;

  case OP_GTU:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    b = VM_POP(vm);
    a = VM_POP(vm);
    VM_PUSH(vm, a > b ? 1 : 0);
    vm->pc++;
    break;

    /* ===== Push with 8-bit operand ===== */

  case OP_PUSH8:
    VM_CHECK_FETCH(vm, 2U);
    operand8 = code[vm->pc + 1];
    VM_PUSH(vm, (uint32_t)(int32_t)(int8_t)operand8);
    vm->pc += 2;
    break;

  case OP_PICK:
    /* PICK n: Copy the nth element from top of stack to top (0=top, 1=second,
     * etc.) Stack before: [..., a, b, c, d] (d on top) PICK 2 -> Stack after:
     * [..., a, b, c, d, b] This is a standard Forth/stack-machine operation for
     * accessing deep stack values. */
    VM_CHECK_FETCH(vm, 2U);
    operand8 = code[vm->pc + 1];
    /* Check that we have enough elements: need at least (n+1) elements */
    VM_CHECK_STACK_UNDERFLOW(vm, operand8 + 1);
    /* Copy element at position (sp - 1 - n) to top */
    a = vm->stack[vm->sp - 1 - operand8];
    VM_PUSH(vm, a);
    vm->pc += 2;
    break;

  case OP_JR:
    VM_CHECK_FETCH(vm, 2U);
    operand8 = code[vm->pc + 1];
    vm->pc = (uint16_t)(vm->pc + 2 + (int8_t)operand8);
    break;

  case OP_JRZ:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 2U);
    operand8 = code[vm->pc + 1];
    a = VM_POP(vm);
    if (a == 0) {
      vm->pc = (uint16_t)(vm->pc + 2 + (int8_t)operand8);
    } else {
      vm->pc += 2;
    }
    break;

  case OP_JRNZ:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 2U);
    operand8 = code[vm->pc + 1];
    a = VM_POP(vm);
    if (a != 0) {
      vm->pc = (uint16_t)(vm->pc + 2 + (int8_t)operand8);
    } else {
      vm->pc += 2;
    }
    break;

    /* ===== Load/Store with 16-bit address ===== */

  case OP_LOAD8:
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    {
      uint8_t val8;
      mem_result = mem_read8(operand16, &val8);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, (uint32_t)val8);
    }
    vm->pc += 3;
    break;

  case OP_LOAD16:
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    {
      uint16_t val16;
      mem_result = mem_read16(operand16, &val16);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, (uint32_t)val16);
    }
    vm->pc += 3;
    break;

  case OP_LOAD32:
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    {
      uint32_t val32;
      mem_result = mem_read32(operand16, &val32);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, val32);
    }
    vm->pc += 3;
    break;

  case OP_LOAD64:
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    {
      uint32_t low, high;
      mem_result = mem_read64(operand16, &low, &high);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
      VM_PUSH(vm, low);
      VM_PUSH(vm, high);
    }
    vm->pc += 3;
    break;

  case OP_STORE8:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    a = VM_POP(vm);
    mem_result = mem_write8(operand16, (uint8_t)a);
    if (mem_result != ZPLC_VM_OK) {
      vm->error = (uint8_t)mem_result;
      vm->halted = 1;
      return mem_result;
    }
    vm->pc += 3;
    break;

  case OP_STORE16:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    a = VM_POP(vm);
    mem_result = mem_write16(operand16, (uint16_t)a);
    if (mem_result != ZPLC_VM_OK) {
      vm->error = (uint8_t)mem_result;
      vm->halted = 1;
      return mem_result;
    }
    vm->pc += 3;
    break;

  case OP_STORE32:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    a = VM_POP(vm);
    mem_result = mem_write32(operand16, a);
    if (mem_result != ZPLC_VM_OK) {
      vm->error = (uint8_t)mem_result;
      vm->halted = 1;
      return mem_result;
    }
    vm->pc += 3;
    break;

  case OP_STORE64:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    {
      uint32_t high = VM_POP(vm);
      uint32_t low = VM_POP(vm);
      mem_result = mem_write64(operand16, low, high);
      if (mem_result != ZPLC_VM_OK) {
        vm->error = (uint8_t)mem_result;
        vm->halted = 1;
        return mem_result;
      }
    }
    vm->pc += 3;
    break;

  case OP_PUSH16:
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    VM_PUSH(vm, (uint32_t)(int32_t)(int16_t)operand16);
    vm->pc += 3;
    break;

    /* ===== Control Flow with 16-bit address ===== */

  case OP_JMP:
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    vm->pc = operand16;
    break;

  case OP_JZ:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    a = VM_POP(vm);
    if (a == 0) {
      vm->pc = operand16;
    } else {
      vm->pc += 3;
    }
    break;

  case OP_JNZ:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    VM_CHECK_FETCH(vm, 3U);
    operand16 = READ_U16(code, vm->pc + 1);
    a = VM_POP(vm);
    if (a != 0) {
      vm->pc = operand16;
    } else {
      vm->pc += 3;
    }
    break;

  case OP_CALL:
    VM_CHECK_FETCH(vm, 3U);
    if (vm->call_depth >= ZPLC_CALL_STACK_MAX) {
      vm->error = ZPLC_VM_CALL_OVERFLOW;
      vm->halted = 1;
      return ZPLC_VM_CALL_OVERFLOW;
    }
    operand16 = READ_U16(code, vm->pc + 1);
    vm->call_stack[vm->call_depth++] = vm->pc + 3;
    vm->pc = operand16;
    break;

  case OP_RET:
    if (vm->call_depth == 0) {
      vm->halted = 1;
      vm->error = ZPLC_VM_HALTED;
      return ZPLC_VM_HALTED;
    }
    vm->pc = vm->call_stack[--vm->call_depth];
    break;

    /* ===== Push with 32-bit operand ===== */

  case OP_PUSH32:
    VM_CHECK_FETCH(vm, 5U);
    operand32 = READ_U32(code, vm->pc + 1);
    VM_PUSH(vm, operand32);
    vm->pc += 5;
    break;

    /* ===== Communication with 32-bit operand ===== */

  case OP_COMM_EXEC:
  case OP_COMM_STATUS:
  case OP_COMM_RESET:
    VM_CHECK_FETCH(vm, 5U);
    operand32 = READ_U32(code, vm->pc + 1);
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm); /* FB base address inside memory regions */
    {
      zplc_comm_fb_kind_t kind;
      uint16_t fb_len;
      uint8_t *fb_mem;

      /* Validate the 32-bit operand before it is narrowed to the kind type.
       * The enum is one byte on targets built with -fshort-enums, so casting
       * first would turn 0x00000114 into the valid kind 0x14. */
      if (operand32 == (uint32_t)ZPLC_COMM_FB_NONE ||
          operand32 >= (uint32_t)ZPLC_COMM_FB_KIND_MAX) {
        vm->error = ZPLC_VM_INVALID_OPCODE;
        vm->halted = 1;
        return ZPLC_VM_INVALID_OPCODE;
      }
      kind = (zplc_comm_fb_kind_t)operand32;

      /* The block is as long as its kind says (RT-002); a kind without a
       * layout is the 8-byte handshake the dispatcher itself touches. The
       * whole block must lie in one region, and EXEC and RESET write it, so
       * it cannot be in the input image (RT-001). */
      fb_len = zplc_comm_fb_size(operand32);
      if (fb_len == 0U) {
        fb_len = ZPLC_COMM_FB_HANDSHAKE_SIZE;
      }
      fb_mem = mem_ptr(a, fb_len, opcode != OP_COMM_STATUS);
      if (fb_mem == NULL) {
        vm->error = ZPLC_VM_OUT_OF_BOUNDS;
        vm->halted = 1;
        return ZPLC_VM_OUT_OF_BOUNDS;
      }

      mem_result = ZPLC_VM_OK;

      switch (opcode) {
      case OP_COMM_EXEC:
        mem_result = zplc_comm_fb_exec(kind, fb_mem, fb_len);
        break;
      case OP_COMM_RESET:
        mem_result = zplc_comm_fb_reset(kind, fb_mem, fb_len);
        break;
      case OP_COMM_STATUS: {
        /* Push STATUS (bytes 4..7 of the 8-byte handshake) */
        uint32_t status_val = (uint32_t)fb_mem[4] | ((uint32_t)fb_mem[5] << 8) |
                              ((uint32_t)fb_mem[6] << 16) |
                              ((uint32_t)fb_mem[7] << 24);
        VM_CHECK_STACK_OVERFLOW(vm);
        VM_PUSH(vm, status_val);
        mem_result = 0;
        break;
      }
      default:
        vm->error = ZPLC_VM_INVALID_OPCODE;
        vm->halted = 1;
        return ZPLC_VM_INVALID_OPCODE;
      }

      if (mem_result < 0) {
        vm->error = ZPLC_VM_INVALID_OPCODE;
        vm->halted = 1;
        return ZPLC_VM_INVALID_OPCODE;
      }
    }
    vm->pc += 5;
    break;

    /* ===== Type Conversion ===== */

  case OP_I2F:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    {
      float f = (float)(int32_t)a;
      memcpy(&result, &f, sizeof(uint32_t));
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_F2I:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    {
      float f;
      memcpy(&f, &a, sizeof(float));
      if (f != f) {
        result = 0U; /* NaN */
      } else if (f >= 2147483648.0f) {
        result = (uint32_t)INT32_MAX;
      } else if (f <= -2147483648.0f) {
        result = (uint32_t)INT32_MIN;
      } else {
        result = (uint32_t)(int32_t)f;
      }
      VM_PUSH(vm, result);
    }
    vm->pc++;
    break;

  case OP_I2B:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, a != 0 ? 1 : 0);
    vm->pc++;
    break;

  case OP_EXT8:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, (uint32_t)(int32_t)(int8_t)(uint8_t)a);
    vm->pc++;
    break;

  case OP_EXT16:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, (uint32_t)(int32_t)(int16_t)(uint16_t)a);
    vm->pc++;
    break;

  case OP_ZEXT8:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, a & 0xFF);
    vm->pc++;
    break;

  case OP_ZEXT16:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH(vm, a & 0xFFFF);
    vm->pc++;
    break;

    /* ===== 64-bit integer arithmetic (CMP-015) =====
     * The results are stated in the table above the helper routines. */

  case OP_MUL64:
  case OP_DIVS64:
  case OP_DIVU64:
  case OP_MODS64:
  case OP_MODU64:
    VM_CHECK_STACK_UNDERFLOW(vm, 4);
    VM_POP64(vm, wb);
    VM_POP64(vm, wa);
    if (opcode != OP_MUL64 && wb == 0U) {
      vm->error = ZPLC_VM_DIV_BY_ZERO;
      vm->halted = 1;
      return ZPLC_VM_DIV_BY_ZERO;
    }
    switch (opcode) {
    case OP_MUL64:
      wr = wa * wb;
      break;
    case OP_DIVU64:
      wr = wa / wb;
      break;
    case OP_MODU64:
      wr = wa % wb;
      break;
    case OP_DIVS64:
      /* INT64_MIN / -1 does not fit: negate in unsigned arithmetic (INT64_MIN) */
      wr = wb == 0xFFFFFFFFFFFFFFFFULL ? 0U - wa
                                       : (uint64_t)((int64_t)wa / (int64_t)wb);
      break;
    default: /* OP_MODS64 */
      wr = wb == 0xFFFFFFFFFFFFFFFFULL ? 0U
                                       : (uint64_t)((int64_t)wa % (int64_t)wb);
      break;
    }
    VM_PUSH64(vm, wr);
    vm->pc++;
    break;

  case OP_NEG64:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, 0U - wa);
    vm->pc++;
    break;

  case OP_ABS64:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, (wa >> 63) != 0U ? 0U - wa : wa);
    vm->pc++;
    break;

  case OP_SHL64:
  case OP_SHR64:
  case OP_SAR64:
    VM_CHECK_STACK_UNDERFLOW(vm, 3);
    a = VM_POP(vm); /* the count, an unsigned 32-bit word */
    VM_POP64(vm, wa);
    if (opcode == OP_SHL64) {
      wr = a >= 64U ? 0U : wa << a;
    } else if (opcode == OP_SHR64 || (wa >> 63) == 0U) {
      wr = a >= 64U ? 0U : wa >> a;
    } else {
      /* the complement form avoids the implementation-defined signed shift */
      wr = a >= 64U ? 0xFFFFFFFFFFFFFFFFULL : ~(~wa >> a);
    }
    VM_PUSH64(vm, wr);
    vm->pc++;
    break;

    /* ===== Double-precision arithmetic (CMP-015) ===== */

  case OP_ADDD:
  case OP_SUBD:
  case OP_MULD:
    VM_CHECK_STACK_UNDERFLOW(vm, 4);
    VM_POP64(vm, wb);
    VM_POP64(vm, wa);
    wr = opcode == OP_MULD ? wide_mul_d(wa, wb)
                           : wide_add_d(wa, wb, opcode == OP_SUBD);
    VM_PUSH64(vm, wr);
    vm->pc++;
    break;

  case OP_DIVD:
    VM_CHECK_STACK_UNDERFLOW(vm, 4);
    VM_POP64(vm, wb);
    VM_POP64(vm, wa);
    if (wide_is_zero(wb)) {
      /* as DIVF: a divisor of 0.0 or -0.0 faults, whatever the dividend */
      vm->error = ZPLC_VM_DIV_BY_ZERO;
      vm->halted = 1;
      return ZPLC_VM_DIV_BY_ZERO;
    }
    VM_PUSH64(vm, wide_div_d(wa, wb));
    vm->pc++;
    break;

  case OP_NEGD:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, wa ^ ZPLC_D_SIGN);
    vm->pc++;
    break;

  case OP_ABSD:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, wa & ~ZPLC_D_SIGN);
    vm->pc++;
    break;

  case OP_SQRTD:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    if (wide_is_nan(wa)) {
      wr = ZPLC_D_QNAN;
    } else if ((wa >> 63) != 0U || wide_is_zero(wa)) {
      wr = 0U; /* the same rule as SQRT on a REAL: 0.0 for 0.0, -0.0 and below */
    } else if (wide_is_inf(wa)) {
      wr = wa;
    } else {
      wr = wide_sqrt_d(wa);
    }
    VM_PUSH64(vm, wr);
    vm->pc++;
    break;

  case OP_RNDD:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, wide_round_integral_d(wa));
    vm->pc++;
    break;

  case OP_EQD:
  case OP_NED:
  case OP_LTD:
  case OP_LED:
  case OP_GTD:
  case OP_GED:
    VM_CHECK_STACK_UNDERFLOW(vm, 4);
    VM_POP64(vm, wb);
    VM_POP64(vm, wa);
    {
      const int order = wide_compare_d(wa, wb); /* 2: unordered */
      int truth;
      switch (opcode) {
      case OP_EQD:
        truth = order == 0;
        break;
      case OP_NED:
        truth = order != 0;
        break;
      case OP_LTD:
        truth = order == -1;
        break;
      case OP_LED:
        truth = order == -1 || order == 0;
        break;
      case OP_GTD:
        truth = order == 1;
        break;
      default: /* OP_GED */
        truth = order == 1 || order == 0;
        break;
      }
      VM_PUSH(vm, truth ? 1U : 0U);
    }
    vm->pc++;
    break;

    /* ===== 64-bit and double-precision conversions (CMP-015) ===== */

  case OP_F2D:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH64(vm, wide_f_to_d(a));
    vm->pc++;
    break;

  case OP_D2F:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH(vm, wide_d_to_f(wa));
    vm->pc++;
    break;

  case OP_I2D:
    VM_CHECK_STACK_UNDERFLOW(vm, 1);
    a = VM_POP(vm);
    VM_PUSH64(vm, wide_from_integer((a >> 31) != 0U, (a >> 31) != 0U
                                                         ? (uint64_t)(0U - a)
                                                         : (uint64_t)a));
    vm->pc++;
    break;

  case OP_D2I:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH(vm, wide_d_to_i32(wa));
    vm->pc++;
    break;

  case OP_L2D:
  case OP_L2F:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    {
      const int negative = (wa >> 63) != 0U;
      const uint64_t magnitude = negative ? 0U - wa : wa;
      if (opcode == OP_L2D) {
        VM_PUSH64(vm, wide_from_integer(negative, magnitude));
      } else {
        VM_PUSH(vm, wide_integer_to_f(negative, magnitude));
      }
    }
    vm->pc++;
    break;

  case OP_U2D:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, wide_from_integer(0, wa));
    vm->pc++;
    break;

  case OP_U2F:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH(vm, wa == 0U ? 0U : wide_integer_to_f(0, wa));
    vm->pc++;
    break;

  case OP_D2L:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, wide_d_to_i64(wa));
    vm->pc++;
    break;

  case OP_D2U:
    VM_CHECK_STACK_UNDERFLOW(vm, 2);
    VM_POP64(vm, wa);
    VM_PUSH64(vm, wide_d_to_u64(wa));
    vm->pc++;
    break;

    /* ===== Unknown opcode ===== */

  default:
    vm->error = ZPLC_VM_INVALID_OPCODE;
    vm->halted = 1;
    return ZPLC_VM_INVALID_OPCODE;
  }

  return ZPLC_VM_OK;
}

int zplc_vm_run(zplc_vm_t *vm, uint32_t max_instructions) {
  uint32_t count = 0;
  int result;

  if (vm == NULL) {
    return -1;
  }

  while (!vm->halted && !vm->paused) {
#ifdef CONFIG_ZPLC_HIL_DEBUG
    /* HIL Trace: Capture state before execution */
    uint16_t trace_pc = vm->pc;
    uint8_t trace_op = 0;
    if (vm->code && trace_pc < vm->code_size) {
      trace_op = vm->code[trace_pc];
    }
#endif

    result = zplc_vm_step(vm);

#ifdef CONFIG_ZPLC_HIL_DEBUG
    /* HIL Trace: Output result */
    if (result == ZPLC_VM_OK || result == ZPLC_VM_HALTED ||
        result == ZPLC_VM_PAUSED) {
      int32_t tos = (vm->sp > 0) ? (int32_t)vm->stack[vm->sp - 1] : 0;
      hil_trace_opcode(trace_op, trace_pc, (uint8_t)vm->sp, tos);
    } else {
      hil_trace_error((uint8_t)result, hil_error_name((uint8_t)result),
                      trace_pc);
    }
#endif

    /* Stop on halt, pause, or error */
    if (result == ZPLC_VM_HALTED || result == ZPLC_VM_PAUSED) {
      break;
    }
    if (result != ZPLC_VM_OK) {
      return -result;
    }

    count++;

    if (max_instructions > 0 && count >= max_instructions) {
      break;
    }
  }

  return (int)count;
}

int zplc_vm_run_bounded(zplc_vm_t *vm, uint32_t max_instructions) {
  int result;

  if (vm == NULL || max_instructions == 0U) {
    return -1;
  }

  result = zplc_vm_run(vm, max_instructions);
  if (result < 0 || vm->halted != 0U || vm->paused != 0U) {
    return result;
  }

  vm->error = ZPLC_VM_WATCHDOG;
  vm->halted = 1U;
  vm->paused = 0U;
  return -ZPLC_VM_WATCHDOG;
}

int zplc_vm_run_cycle(zplc_vm_t *vm) {
  uint32_t spent = 0U;
  int result;

  if (vm == NULL) {
    return -1;
  }

  if (vm->scan_resumed != 0U && vm->paused == 0U && vm->halted == 0U &&
      vm->scan_instructions < ZPLC_VM_CYCLE_INSTRUCTION_BUDGET) {
    /* Continue the scan a debugger resumed: pc, stacks and locals stay as the
     * pause left them, and the instructions it already spent stay counted. */
    spent = vm->scan_instructions;
    vm->scan_resumed = 0U;
  } else {
    /* Reset for new cycle */
    zplc_vm_reset_cycle(vm);
  }

  result = zplc_vm_run_bounded(vm, ZPLC_VM_CYCLE_INSTRUCTION_BUDGET - spent);
  vm->scan_instructions =
      (result >= 0 && vm->paused != 0U) ? spent + (uint32_t)result : 0U;
  return result;
}

/* ============================================================================
 * Legacy Singleton API (backward compatibility)
 * ============================================================================
 */

const char *zplc_core_version(void) { return ZPLC_CORE_VERSION_STR; }

int zplc_core_init(void) {
  /* Initialize shared memory */
  zplc_mem_init();

  /* Create PI Mutex */
  if (pi_mutex == NULL) {
    pi_mutex = zplc_hal_mutex_create();
  }

  /* Initialize default VM */
  zplc_vm_init(&default_vm);
  default_program_loaded = 0;

  return 0;
}

int zplc_core_shutdown(void) {
  default_program_loaded = 0;
  default_vm.halted = 1;
  return 0;
}

static void zplc_core_commit_verified(const zplc_program_view_t *view) {
  uint32_t index;

  memcpy(mem_code, view->code, view->code_size);
  code_size = view->code_size;
  memset(mem_tags, 0, sizeof(mem_tags));
  tag_count = (uint16_t)view->tag_count;
  for (index = 0U; index < view->tag_count; index++) {
    const uint8_t *tag = view->tags + index * ZPLC_TAG_ENTRY_SIZE;
    mem_tags[index].var_addr = (uint16_t)tag[0] | ((uint16_t)tag[1] << 8);
    mem_tags[index].var_type = tag[2];
    mem_tags[index].tag_id = tag[3];
    mem_tags[index].value = (uint32_t)tag[4] | ((uint32_t)tag[5] << 8) |
                            ((uint32_t)tag[6] << 16) |
                            ((uint32_t)tag[7] << 24);
  }
  zplc_vm_init(&default_vm);
  default_vm.entry_point = view->entry_point;
  default_vm.pc = view->entry_point;
  default_vm.code = mem_code;
  default_vm.code_size = view->code_size;
  default_program_loaded = 1;
}

int zplc_core_load(const uint8_t *binary, size_t size, uint8_t *workspace,
                   size_t workspace_size) {
  zplc_program_view_t view;
  int result = zplc_loader_verify(binary, size, workspace, workspace_size, &view);

  if (result != ZPLC_LOADER_OK) {
    return result;
  }
  zplc_mem_init();
  zplc_core_commit_verified(&view);
  return ZPLC_LOADER_OK;
}

#if defined(ZPLC_CORE_TESTING)
int zplc_test_load_raw(const uint8_t *bytecode, size_t size) {
  int result;

  if (bytecode == NULL || size == 0 || size > ZPLC_MEM_CODE_SIZE) {
    return -1;
  }

  /* Load code into shared segment at offset 0 */
  result = zplc_test_mem_load_code(bytecode, size, 0);
  if (result != 0) {
    return result;
  }

  /* Configure default VM */
  zplc_vm_init(&default_vm);
  zplc_vm_set_entry(&default_vm, 0, (uint32_t)size);
  default_program_loaded = 1;

  return 0;
}
#endif

int zplc_core_step(void) {
  if (!default_program_loaded) {
    return ZPLC_VM_INVALID_OPCODE;
  }
  return zplc_vm_step(&default_vm);
}

int zplc_core_run(uint32_t max_instructions) {
  if (!default_program_loaded) {
    return -1;
  }
  return zplc_vm_run(&default_vm, max_instructions);
}

int zplc_core_run_cycle(void) {
  if (!default_program_loaded) {
    return -1;
  }
  return zplc_vm_run_cycle(&default_vm);
}

const zplc_vm_state_t *zplc_core_get_state(void) {
  legacy_default_vm_state.pc = default_vm.pc;
  legacy_default_vm_state.sp = default_vm.sp;
  legacy_default_vm_state.bp = default_vm.bp;
  legacy_default_vm_state.call_depth = default_vm.call_depth;
  legacy_default_vm_state.flags = default_vm.flags;
  legacy_default_vm_state.error = default_vm.error;
  legacy_default_vm_state.halted = default_vm.halted;
  legacy_default_vm_state.paused = default_vm.paused;
  legacy_default_vm_state.breakpoint_count = default_vm.breakpoint_count;
  memcpy(legacy_default_vm_state.breakpoints,
         default_vm.breakpoints,
         sizeof(legacy_default_vm_state.breakpoints));
  memcpy(legacy_default_vm_state.stack,
         default_vm.stack,
         sizeof(legacy_default_vm_state.stack));
  memcpy(legacy_default_vm_state.call_stack,
         default_vm.call_stack,
         sizeof(legacy_default_vm_state.call_stack));

  return &legacy_default_vm_state;
}

uint16_t zplc_core_get_sp(void) { return default_vm.sp; }

uint16_t zplc_core_get_pc(void) { return default_vm.pc; }

uint32_t zplc_core_get_stack(uint16_t index) {
  return zplc_vm_get_stack(&default_vm, index);
}

int zplc_core_get_error(void) { return default_vm.error; }

int zplc_core_is_halted(void) { return default_vm.halted; }

int zplc_core_set_ipi(uint16_t offset, uint32_t value) {
  return zplc_ipi_write32(offset, value);
}

int zplc_core_set_ipi16(uint16_t offset, uint16_t value) {
  return zplc_ipi_write16(offset, value);
}

uint32_t zplc_core_get_opi(uint16_t offset) { return zplc_opi_read32(offset); }

zplc_vm_t *zplc_core_get_default_vm(void) { return &default_vm; }

/* ============================================================================
 * Multi-Task Loading API
 * ============================================================================
 */

/**
 * @brief Load tasks from a .zplc binary containing a TASK segment.
 *
 * Parses the TASK segment and populates an array of task definitions.
 * Also loads the code segment into shared memory.
 *
 * @param binary Pointer to .zplc file contents
 * @param size Size of binary data
 * @param tasks Output array to fill with task definitions
 * @param max_tasks Maximum number of tasks to load
 * @return Number of tasks loaded, or a ZPLC_LOADER_* error code
 */
int zplc_core_load_tasks(const uint8_t *binary, size_t size,
                         zplc_task_def_t *tasks, uint8_t max_tasks,
                         uint8_t *workspace, size_t workspace_size) {
  zplc_program_view_t view;
  uint32_t task_count;
  uint32_t index;
  int result;

  if (tasks == NULL) {
    return ZPLC_LOADER_ERR_SIZE;
  }
  result = zplc_loader_verify(binary, size, workspace, workspace_size, &view);
  if (result != ZPLC_LOADER_OK) {
    return result;
  }
  if (view.tasks == NULL) {
    return ZPLC_LOADER_ERR_TASK;
  }
  task_count = view.task_count;
  if (task_count > max_tasks) {
    return ZPLC_LOADER_ERR_TASK;
  }
  if ((size_t)task_count * sizeof(zplc_task_def_t) > workspace_size) {
    return ZPLC_LOADER_ERR_WORKSPACE;
  }
  for (index = 0U; index < task_count; index++) {
    const uint8_t *source = view.tasks + index * ZPLC_TASK_DEF_SIZE;
    zplc_task_def_t parsed;
    parsed.id = (uint16_t)source[0] | ((uint16_t)source[1] << 8);
    parsed.type = source[2];
    parsed.priority = source[3];
    parsed.interval_us = (uint32_t)source[4] | ((uint32_t)source[5] << 8) |
                         ((uint32_t)source[6] << 16) |
                         ((uint32_t)source[7] << 24);
    parsed.entry_point = (uint16_t)source[8] | ((uint16_t)source[9] << 8);
    parsed.stack_size = (uint16_t)source[10] | ((uint16_t)source[11] << 8);
    parsed.reserved = 0U;
    memcpy(workspace + index * sizeof(parsed), &parsed, sizeof(parsed));
  }
  zplc_core_commit_verified(&view);
  memmove(tasks, workspace, task_count * sizeof(*tasks));
  return (int)task_count;
}

/* ============================================================================
 * Debugger API Implementation
 * ============================================================================
 */

int zplc_vm_is_paused(const zplc_vm_t *vm) {
  if (vm == NULL) {
    return 0;
  }
  return vm->paused;
}

int zplc_vm_resume(zplc_vm_t *vm) {
  if (vm == NULL) {
    return -1;
  }
  if (vm->paused != 0U) {
    /* The scan stopped part-way: the next zplc_vm_run_cycle() continues it. */
    vm->scan_resumed = 1U;
  }
  vm->paused = 0;
  vm->resume_skip_breakpoint_once = 1U;
  vm->error = ZPLC_VM_OK;
  return 0;
}

int zplc_vm_add_breakpoint(zplc_vm_t *vm, uint16_t pc) {
  uint8_t i;

  if (vm == NULL) {
    return -1;
  }

  /* Check if breakpoint already exists */
  for (i = 0; i < vm->breakpoint_count; i++) {
    if (vm->breakpoints[i] == pc) {
      return -3; /* Already exists */
    }
  }

  /* Check if table is full */
  if (vm->breakpoint_count >= ZPLC_MAX_BREAKPOINTS) {
    return -2; /* Table full */
  }

  /* Add breakpoint */
  vm->breakpoints[vm->breakpoint_count] = pc;
  vm->breakpoint_count++;

  return 0;
}

int zplc_vm_remove_breakpoint(zplc_vm_t *vm, uint16_t pc) {
  uint8_t i;

  if (vm == NULL) {
    return -1;
  }

  /* Find breakpoint */
  for (i = 0; i < vm->breakpoint_count; i++) {
    if (vm->breakpoints[i] == pc) {
      /* Found - shift remaining breakpoints down */
      while (i < vm->breakpoint_count - 1) {
        vm->breakpoints[i] = vm->breakpoints[i + 1];
        i++;
      }
      vm->breakpoint_count--;
      return 0;
    }
  }

  return -2; /* Not found */
}

int zplc_vm_clear_breakpoints(zplc_vm_t *vm) {
  if (vm == NULL) {
    return -1;
  }
  vm->breakpoint_count = 0;
  return 0;
}

uint8_t zplc_vm_get_breakpoint_count(const zplc_vm_t *vm) {
  if (vm == NULL) {
    return 0;
  }
  return vm->breakpoint_count;
}

uint16_t zplc_vm_get_breakpoint(const zplc_vm_t *vm, uint8_t index) {
  if (vm == NULL || index >= vm->breakpoint_count) {
    return 0xFFFF;
  }
  return vm->breakpoints[index];
}

uint16_t zplc_core_get_tag_count(void) { return tag_count; }

const zplc_tag_entry_t *zplc_core_get_tag(uint16_t index) {
  if (index >= tag_count) {
    return NULL;
  }
  return &mem_tags[index];
}
