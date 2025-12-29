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

#include <string.h>
#include <zplc_hal.h>
#include <zplc_core.h>

/* ============================================================================
 * Version Information
 * ============================================================================
 */

#define ZPLC_CORE_VERSION_MAJOR 0
#define ZPLC_CORE_VERSION_MINOR 3
#define ZPLC_CORE_VERSION_PATCH 0

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

/** @brief Code segment - bytecode (read-only during execution) */
static uint8_t mem_code[ZPLC_MEM_CODE_SIZE];

/** @brief Loaded code size (for bounds checking) */
static uint32_t code_size = 0;

/** @brief Default VM instance for legacy API */
static zplc_vm_t default_vm;

/** @brief Flag indicating if default VM has a program loaded */
static int default_program_loaded = 0;

/* ============================================================================
 * Internal Helper Macros
 * ============================================================================
 */

/**
 * @brief Check for stack underflow before popping N items.
 */
#define VM_CHECK_STACK_UNDERFLOW(vm, n)                                        \
    do {                                                                       \
        if ((vm)->sp < (n)) {                                                  \
            (vm)->error = ZPLC_VM_STACK_UNDERFLOW;                             \
            (vm)->halted = 1;                                                  \
            return ZPLC_VM_STACK_UNDERFLOW;                                    \
        }                                                                      \
    } while (0)

/**
 * @brief Check for stack overflow before pushing.
 */
#define VM_CHECK_STACK_OVERFLOW(vm)                                            \
    do {                                                                       \
        if ((vm)->sp >= ZPLC_STACK_MAX_DEPTH) {                                \
            (vm)->error = ZPLC_VM_STACK_OVERFLOW;                              \
            (vm)->halted = 1;                                                  \
            return ZPLC_VM_STACK_OVERFLOW;                                     \
        }                                                                      \
    } while (0)

/**
 * @brief Push a value onto the stack.
 */
#define VM_PUSH(vm, val)                                                       \
    do {                                                                       \
        VM_CHECK_STACK_OVERFLOW(vm);                                           \
        (vm)->stack[(vm)->sp++] = (uint32_t)(val);                             \
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
 * @brief Read a 16-bit little-endian value from code.
 */
#define READ_U16(code, offset)                                                 \
    ((uint16_t)(code)[(offset)] | ((uint16_t)(code)[(offset) + 1] << 8))

/**
 * @brief Read a 32-bit little-endian value from code.
 */
#define READ_U32(code, offset)                                                 \
    ((uint32_t)(code)[(offset)] | ((uint32_t)(code)[(offset) + 1] << 8) |      \
     ((uint32_t)(code)[(offset) + 2] << 16) |                                  \
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
 * @param addr Logical address (0x0000-0x4FFF)
 * @param size Size of access in bytes
 * @param writable 1 if write access required, 0 for read
 * @return Pointer to memory, or NULL if out of bounds
 */
static uint8_t *mem_ptr(uint16_t addr, uint8_t size, int writable)
{
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
static int mem_read8(uint16_t addr, uint8_t *value)
{
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
static int mem_read16(uint16_t addr, uint16_t *value)
{
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
static int mem_read32(uint16_t addr, uint32_t *value)
{
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
static int mem_write8(uint16_t addr, uint8_t value)
{
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
static int mem_write16(uint16_t addr, uint16_t value)
{
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
static int mem_write32(uint16_t addr, uint32_t value)
{
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
 */
static int mem_read64(uint16_t addr, uint32_t *low, uint32_t *high)
{
    uint8_t *ptr = mem_ptr(addr, 8, 0);
    if (ptr == NULL) {
        return ZPLC_VM_OUT_OF_BOUNDS;
    }
    *low = (uint32_t)ptr[0] | ((uint32_t)ptr[1] << 8) |
           ((uint32_t)ptr[2] << 16) | ((uint32_t)ptr[3] << 24);
    *high = (uint32_t)ptr[4] | ((uint32_t)ptr[5] << 8) |
            ((uint32_t)ptr[6] << 16) | ((uint32_t)ptr[7] << 24);
    return ZPLC_VM_OK;
}

/**
 * @brief Write a 64-bit little-endian value to memory.
 */
static int mem_write64(uint16_t addr, uint32_t low, uint32_t high)
{
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
 * Shared Memory Public API
 * ============================================================================ */

int zplc_mem_init(void)
{
    memset(mem_ipi, 0, sizeof(mem_ipi));
    memset(mem_opi, 0, sizeof(mem_opi));
    memset(mem_work, 0, sizeof(mem_work));
    memset(mem_retain, 0, sizeof(mem_retain));
    memset(mem_code, 0, sizeof(mem_code));
    code_size = 0;
    return 0;
}

uint8_t *zplc_mem_get_region(uint16_t base)
{
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

int zplc_mem_load_code(const uint8_t *code, size_t size, uint16_t offset)
{
    if (code == NULL || size == 0) {
        return -1;
    }
    if (offset + size > ZPLC_MEM_CODE_SIZE) {
        return -2;
    }
    memcpy(&mem_code[offset], code, size);
    
    /* Track total code size */
    if (offset + size > code_size) {
        code_size = (uint32_t)(offset + size);
    }
    return 0;
}

const uint8_t *zplc_mem_get_code(uint16_t offset, size_t size)
{
    if (offset + size > code_size) {
        return NULL;
    }
    return &mem_code[offset];
}

uint32_t zplc_mem_get_code_size(void)
{
    return code_size;
}

/* ============================================================================
 * I/O Helpers
 * ============================================================================ */

int zplc_ipi_write32(uint16_t offset, uint32_t value)
{
    if (offset + 4 > ZPLC_MEM_IPI_SIZE) {
        return -1;
    }
    mem_ipi[offset] = (uint8_t)(value & 0xFF);
    mem_ipi[offset + 1] = (uint8_t)((value >> 8) & 0xFF);
    mem_ipi[offset + 2] = (uint8_t)((value >> 16) & 0xFF);
    mem_ipi[offset + 3] = (uint8_t)((value >> 24) & 0xFF);
    return 0;
}

int zplc_ipi_write16(uint16_t offset, uint16_t value)
{
    if (offset + 2 > ZPLC_MEM_IPI_SIZE) {
        return -1;
    }
    mem_ipi[offset] = (uint8_t)(value & 0xFF);
    mem_ipi[offset + 1] = (uint8_t)((value >> 8) & 0xFF);
    return 0;
}

int zplc_ipi_write8(uint16_t offset, uint8_t value)
{
    if (offset >= ZPLC_MEM_IPI_SIZE) {
        return -1;
    }
    mem_ipi[offset] = value;
    return 0;
}

uint32_t zplc_opi_read32(uint16_t offset)
{
    if (offset + 4 > ZPLC_MEM_OPI_SIZE) {
        return 0;
    }
    return (uint32_t)mem_opi[offset] |
           ((uint32_t)mem_opi[offset + 1] << 8) |
           ((uint32_t)mem_opi[offset + 2] << 16) |
           ((uint32_t)mem_opi[offset + 3] << 24);
}

uint16_t zplc_opi_read16(uint16_t offset)
{
    if (offset + 2 > ZPLC_MEM_OPI_SIZE) {
        return 0;
    }
    return (uint16_t)mem_opi[offset] |
           ((uint16_t)mem_opi[offset + 1] << 8);
}

uint8_t zplc_opi_read8(uint16_t offset)
{
    if (offset >= ZPLC_MEM_OPI_SIZE) {
        return 0;
    }
    return mem_opi[offset];
}

/* ============================================================================
 * VM Instance API
 * ============================================================================ */

int zplc_vm_init(zplc_vm_t *vm)
{
    if (vm == NULL) {
        return -1;
    }
    
    memset(vm, 0, sizeof(zplc_vm_t));
    vm->pc = 0;
    vm->sp = 0;
    vm->bp = 0;
    vm->call_depth = 0;
    vm->flags = 0;
    vm->error = ZPLC_VM_OK;
    vm->halted = 0;
    vm->code = mem_code;
    vm->code_size = code_size;
    vm->entry_point = 0;
    vm->task_id = 0;
    vm->priority = 0;
    
    return 0;
}

int zplc_vm_set_entry(zplc_vm_t *vm, uint16_t entry_point, uint32_t task_code_size)
{
    if (vm == NULL) {
        return -1;
    }
    if (entry_point + task_code_size > code_size) {
        return -2;
    }
    
    vm->entry_point = entry_point;
    vm->code = mem_code;
    /* code_size is the END of this task's code in global segment
     * (entry_point + task_code_size), not just the task's size.
     * This allows bounds check: pc >= code_size fails if pc goes past end */
    vm->code_size = entry_point + task_code_size;
    vm->pc = entry_point;
    
    return 0;
}

void zplc_vm_reset_cycle(zplc_vm_t *vm)
{
    if (vm == NULL) {
        return;
    }
    vm->pc = vm->entry_point;
    vm->sp = 0;
    vm->call_depth = 0;
    vm->halted = 0;
    vm->error = ZPLC_VM_OK;
}

int zplc_vm_get_error(const zplc_vm_t *vm)
{
    if (vm == NULL) {
        return -1;
    }
    return vm->error;
}

int zplc_vm_is_halted(const zplc_vm_t *vm)
{
    if (vm == NULL) {
        return 1;
    }
    return vm->halted;
}

uint32_t zplc_vm_get_stack(const zplc_vm_t *vm, uint16_t index)
{
    if (vm == NULL || index >= vm->sp) {
        return 0;
    }
    return vm->stack[index];
}

uint16_t zplc_vm_get_sp(const zplc_vm_t *vm)
{
    if (vm == NULL) {
        return 0;
    }
    return vm->sp;
}

uint16_t zplc_vm_get_pc(const zplc_vm_t *vm)
{
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
int zplc_vm_step(zplc_vm_t *vm)
{
    uint8_t opcode;
    uint8_t operand8;
    uint16_t operand16;
    uint32_t operand32;
    uint32_t a, b, result;
    int32_t sa, sb;
    int mem_result;
    const uint8_t *code;

    if (vm == NULL) {
        return ZPLC_VM_INVALID_OPCODE;
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
        /* Debugger breakpoint - for now, just continue */
        vm->pc++;
        break;

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

    /* ===== Integer Arithmetic ===== */

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
        VM_PUSH(vm, (uint32_t)(sa / sb));
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
        VM_PUSH(vm, (uint32_t)(sa % sb));
        vm->pc++;
        break;

    case OP_NEG:
        VM_CHECK_STACK_UNDERFLOW(vm, 1);
        a = VM_POP(vm);
        VM_PUSH(vm, (uint32_t)(-(int32_t)a));
        vm->pc++;
        break;

    case OP_ABS:
        VM_CHECK_STACK_UNDERFLOW(vm, 1);
        a = VM_POP(vm);
        sa = (int32_t)a;
        VM_PUSH(vm, (uint32_t)(sa < 0 ? -sa : sa));
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
        {
            float fa;
            memcpy(&fa, &a, sizeof(float));
            if (fa < 0.0f)
                fa = -fa;
            memcpy(&result, &fa, sizeof(uint32_t));
            VM_PUSH(vm, result);
        }
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
        VM_PUSH(vm, a << (b & 31));
        vm->pc++;
        break;

    case OP_SHR:
        VM_CHECK_STACK_UNDERFLOW(vm, 2);
        b = VM_POP(vm);
        a = VM_POP(vm);
        VM_PUSH(vm, a >> (b & 31));
        vm->pc++;
        break;

    case OP_SAR:
        VM_CHECK_STACK_UNDERFLOW(vm, 2);
        b = VM_POP(vm);
        a = VM_POP(vm);
        sa = (int32_t)a;
        VM_PUSH(vm, (uint32_t)(sa >> (b & 31)));
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
        if (vm->pc + 1 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
        operand8 = code[vm->pc + 1];
        VM_PUSH(vm, (uint32_t)(int32_t)(int8_t)operand8);
        vm->pc += 2;
        break;

    case OP_JR:
        if (vm->pc + 1 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
        operand8 = code[vm->pc + 1];
        vm->pc = (uint16_t)(vm->pc + 2 + (int8_t)operand8);
        break;

    case OP_JRZ:
        VM_CHECK_STACK_UNDERFLOW(vm, 1);
        if (vm->pc + 1 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 1 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
        operand16 = READ_U16(code, vm->pc + 1);
        VM_PUSH(vm, (uint32_t)(int32_t)(int16_t)operand16);
        vm->pc += 3;
        break;

    /* ===== Control Flow with 16-bit address ===== */

    case OP_JMP:
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
        operand16 = READ_U16(code, vm->pc + 1);
        vm->pc = operand16;
        break;

    case OP_JZ:
        VM_CHECK_STACK_UNDERFLOW(vm, 1);
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
        operand16 = READ_U16(code, vm->pc + 1);
        a = VM_POP(vm);
        if (a != 0) {
            vm->pc = operand16;
        } else {
            vm->pc += 3;
        }
        break;

    case OP_CALL:
        if (vm->pc + 2 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
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
        if (vm->pc + 4 >= vm->code_size) {
            vm->error = ZPLC_VM_INVALID_JUMP;
            vm->halted = 1;
            return ZPLC_VM_INVALID_JUMP;
        }
        operand32 = READ_U32(code, vm->pc + 1);
        VM_PUSH(vm, operand32);
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
            VM_PUSH(vm, (uint32_t)(int32_t)f);
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

    /* ===== Unknown opcode ===== */

    default:
        vm->error = ZPLC_VM_INVALID_OPCODE;
        vm->halted = 1;
        return ZPLC_VM_INVALID_OPCODE;
    }

    return ZPLC_VM_OK;
}

int zplc_vm_run(zplc_vm_t *vm, uint32_t max_instructions)
{
    uint32_t count = 0;
    int result;

    if (vm == NULL) {
        return -1;
    }

    while (!vm->halted) {
        result = zplc_vm_step(vm);

        if (result != ZPLC_VM_OK && result != ZPLC_VM_HALTED) {
            return -result;
        }

        count++;

        if (max_instructions > 0 && count >= max_instructions) {
            break;
        }
    }

    return (int)count;
}

int zplc_vm_run_cycle(zplc_vm_t *vm)
{
    if (vm == NULL) {
        return -1;
    }

    /* Reset for new cycle */
    zplc_vm_reset_cycle(vm);

    /* Run until HALT */
    return zplc_vm_run(vm, 0);
}

/* ============================================================================
 * Legacy Singleton API (backward compatibility)
 * ============================================================================ */

const char *zplc_core_version(void)
{
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

int zplc_core_init(void)
{
    /* Initialize shared memory */
    zplc_mem_init();
    
    /* Initialize default VM */
    zplc_vm_init(&default_vm);
    default_program_loaded = 0;
    
    return 0;
}

int zplc_core_shutdown(void)
{
    default_program_loaded = 0;
    default_vm.halted = 1;
    return 0;
}

int zplc_core_load(const uint8_t *binary, size_t size)
{
    const zplc_file_header_t *header;
    size_t code_offset;

    if (binary == NULL || size < ZPLC_FILE_HEADER_SIZE) {
        return -1;
    }

    header = (const zplc_file_header_t *)binary;

    if (header->magic != ZPLC_MAGIC) {
        return -2;
    }

    if (header->version_major > ZPLC_VERSION_MAJOR) {
        return -3;
    }

    if (header->code_size > ZPLC_MEM_CODE_SIZE) {
        return -4;
    }

    code_offset = ZPLC_FILE_HEADER_SIZE + 
                  (header->segment_count * ZPLC_SEGMENT_ENTRY_SIZE);

    if (size < code_offset + header->code_size) {
        return -5;
    }

    /* Load code into shared segment */
    zplc_mem_load_code(binary + code_offset, header->code_size, 0);

    /* Configure default VM */
    zplc_vm_init(&default_vm);
    zplc_vm_set_entry(&default_vm, header->entry_point, header->code_size);
    default_program_loaded = 1;

    return 0;
}

int zplc_core_load_raw(const uint8_t *bytecode, size_t size)
{
    if (bytecode == NULL || size == 0 || size > ZPLC_MEM_CODE_SIZE) {
        return -1;
    }

    /* Load code into shared segment at offset 0 */
    zplc_mem_load_code(bytecode, size, 0);

    /* Configure default VM */
    zplc_vm_init(&default_vm);
    zplc_vm_set_entry(&default_vm, 0, (uint32_t)size);
    default_program_loaded = 1;

    return 0;
}

int zplc_core_step(void)
{
    if (!default_program_loaded) {
        return ZPLC_VM_INVALID_OPCODE;
    }
    return zplc_vm_step(&default_vm);
}

int zplc_core_run(uint32_t max_instructions)
{
    if (!default_program_loaded) {
        return -1;
    }
    return zplc_vm_run(&default_vm, max_instructions);
}

int zplc_core_run_cycle(void)
{
    if (!default_program_loaded) {
        return -1;
    }
    return zplc_vm_run_cycle(&default_vm);
}

const zplc_vm_state_t *zplc_core_get_state(void)
{
    /* 
     * Legacy API returns zplc_vm_state_t*, but our new zplc_vm_t is compatible
     * since it starts with the same fields. Cast is safe for read-only access.
     */
    return (const zplc_vm_state_t *)&default_vm;
}

uint16_t zplc_core_get_sp(void)
{
    return default_vm.sp;
}

uint32_t zplc_core_get_stack(uint16_t index)
{
    return zplc_vm_get_stack(&default_vm, index);
}

int zplc_core_get_error(void)
{
    return default_vm.error;
}

int zplc_core_is_halted(void)
{
    return default_vm.halted;
}

int zplc_core_set_ipi(uint16_t offset, uint32_t value)
{
    return zplc_ipi_write32(offset, value);
}

int zplc_core_set_ipi16(uint16_t offset, uint16_t value)
{
    return zplc_ipi_write16(offset, value);
}

uint32_t zplc_core_get_opi(uint16_t offset)
{
    return zplc_opi_read32(offset);
}

zplc_vm_t *zplc_core_get_default_vm(void)
{
    return &default_vm;
}

/* ============================================================================
 * Multi-Task Loading API
 * ============================================================================ */

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
 * @return Number of tasks loaded, or negative error code:
 *         -1: NULL pointer or insufficient size
 *         -2: Invalid magic number
 *         -3: Unsupported version
 *         -4: Code too large
 *         -5: File truncated
 *         -6: No TASK segment found
 */
int zplc_core_load_tasks(const uint8_t *binary, size_t size,
                         zplc_task_def_t *tasks, uint8_t max_tasks)
{
    const zplc_file_header_t *header;
    const zplc_segment_entry_t *seg_table;
    size_t seg_table_size;
    size_t data_offset;
    
    /* Segment locations (filled during scan) */
    size_t code_seg_offset = 0;
    uint32_t code_seg_size = 0;
    size_t task_seg_offset = 0;
    uint32_t task_seg_size = 0;
    int code_found = 0;
    int task_found = 0;
    
    uint8_t task_count;
    uint8_t i;

    /* Validate inputs */
    if (binary == NULL || size < ZPLC_FILE_HEADER_SIZE || tasks == NULL) {
        return -1;
    }

    /* Parse header */
    header = (const zplc_file_header_t *)binary;

    if (header->magic != ZPLC_MAGIC) {
        return -2;
    }

    if (header->version_major > ZPLC_VERSION_MAJOR) {
        return -3;
    }

    /* Calculate segment table size and data offset */
    seg_table_size = header->segment_count * ZPLC_SEGMENT_ENTRY_SIZE;
    
    if (size < ZPLC_FILE_HEADER_SIZE + seg_table_size) {
        return -5; /* File truncated */
    }
    
    seg_table = (const zplc_segment_entry_t *)(binary + ZPLC_FILE_HEADER_SIZE);
    data_offset = ZPLC_FILE_HEADER_SIZE + seg_table_size;

    /* Scan segment table to find CODE and TASK segments */
    for (i = 0; i < header->segment_count; i++) {
        if (seg_table[i].type == ZPLC_SEG_CODE) {
            code_seg_offset = data_offset;
            code_seg_size = seg_table[i].size;
            code_found = 1;
        } else if (seg_table[i].type == ZPLC_SEG_TASK) {
            task_seg_offset = data_offset;
            task_seg_size = seg_table[i].size;
            task_found = 1;
        }
        /* Advance data_offset past this segment's data */
        data_offset += seg_table[i].size;
    }

    /* Verify we found required segments */
    if (!code_found) {
        /* No code segment - use header's code_size for backwards compat */
        code_seg_offset = ZPLC_FILE_HEADER_SIZE + seg_table_size;
        code_seg_size = header->code_size;
    }

    if (!task_found) {
        return -6; /* No TASK segment */
    }

    /* Validate code size */
    if (code_seg_size > ZPLC_MEM_CODE_SIZE) {
        return -4;
    }

    /* Verify file has enough data */
    if (code_seg_offset + code_seg_size > size ||
        task_seg_offset + task_seg_size > size) {
        return -5;
    }

    /* Load code into shared segment */
    zplc_mem_load_code(binary + code_seg_offset, code_seg_size, 0);

    /* Parse task definitions */
    task_count = (uint8_t)(task_seg_size / ZPLC_TASK_DEF_SIZE);
    if (task_count > max_tasks) {
        task_count = max_tasks;
    }

    /* Copy task definitions with endian-safe parsing */
    for (i = 0; i < task_count; i++) {
        const uint8_t *task_ptr = binary + task_seg_offset + 
                                  (i * ZPLC_TASK_DEF_SIZE);
        
        /* Parse little-endian fields manually for portability */
        tasks[i].id = (uint16_t)task_ptr[0] | 
                      ((uint16_t)task_ptr[1] << 8);
        tasks[i].type = task_ptr[2];
        tasks[i].priority = task_ptr[3];
        tasks[i].interval_us = (uint32_t)task_ptr[4] |
                               ((uint32_t)task_ptr[5] << 8) |
                               ((uint32_t)task_ptr[6] << 16) |
                               ((uint32_t)task_ptr[7] << 24);
        tasks[i].entry_point = (uint16_t)task_ptr[8] |
                               ((uint16_t)task_ptr[9] << 8);
        tasks[i].stack_size = (uint16_t)task_ptr[10] |
                              ((uint16_t)task_ptr[11] << 8);
        tasks[i].reserved = 0; /* Ignore reserved field */
    }

    return (int)task_count;
}
