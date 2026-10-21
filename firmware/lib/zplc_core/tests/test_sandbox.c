/**
 * @file test_sandbox.c
 * @brief Sandbox closure of the VM and the loader (RT-001, RT-002, RT-003).
 *
 * A crafted program must never read or write outside PLC memory. Each access
 * class of the VM has rows at the boundary (last valid byte accepted, first
 * invalid byte refused, an extent that crosses a region end, address
 * arithmetic that wraps, huge extents) and the loader rows for the static
 * function-block fit and the stack-depth verification.
 *
 * The sanitizer is the oracle for "never outside PLC memory"; the assertions
 * name the defined result: a VM fault (ZPLC_VM_OUT_OF_BOUNDS) for a run, a
 * loader code for an artifact.
 *
 * SPDX-License-Identifier: MIT
 */

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <zplc_comm_dispatch.h>
#include <zplc_core.h>
#include <zplc_isa.h>
#include <zplc_loader.h>

/* Available because this target is built with ZPLC_CORE_TESTING (RT-033). */
#include <zplc_test_hooks.h>

static int failures;
static int checks;

#define CHECK(condition, name)                                 \
  do {                                                         \
    checks++;                                                  \
    if (!(condition)) {                                        \
      fprintf(stderr, "FAIL: %s (line %d)\n", name, __LINE__); \
      failures++;                                              \
    }                                                          \
  } while (0)

#define CHECK_EQ(actual, expected, name)                                                  \
  do {                                                                                    \
    long a_ = (long)(actual), e_ = (long)(expected);                                      \
    checks++;                                                                             \
    if (a_ != e_) {                                                                       \
      fprintf(stderr, "FAIL: %s: got %ld, want %ld (line %d)\n", name, a_, e_, __LINE__); \
      failures++;                                                                         \
    }                                                                                     \
  } while (0)

/* ----------------------------------------------------------------------------
 * Code and artifact builders
 * ------------------------------------------------------------------------- */

typedef struct {
  uint8_t b[1400];
  size_t n;
} code_t;

typedef struct {
  uint16_t entry;
  uint16_t stack;
} task_t;

static void op(code_t *c, uint8_t o) { c->b[c->n++] = o; }
static void op8(code_t *c, uint8_t o, uint8_t v) {
  c->b[c->n++] = o;
  c->b[c->n++] = v;
}
static void op16(code_t *c, uint8_t o, uint16_t v) {
  c->b[c->n++] = o;
  c->b[c->n++] = (uint8_t)v;
  c->b[c->n++] = (uint8_t)(v >> 8);
}
static void op32(code_t *c, uint8_t o, uint32_t v) {
  c->b[c->n++] = o;
  c->b[c->n++] = (uint8_t)v;
  c->b[c->n++] = (uint8_t)(v >> 8);
  c->b[c->n++] = (uint8_t)(v >> 16);
  c->b[c->n++] = (uint8_t)(v >> 24);
}

/** Push a value the loader cannot see as a constant: it goes through memory. */
static void push_runtime(code_t *c, uint32_t value) {
  op32(c, OP_PUSH32, value);
  op16(c, OP_STORE32, 0x2000U);
  op16(c, OP_LOAD32, 0x2000U);
}

static uint32_t crc32_update(uint32_t crc, const uint8_t *d, size_t n) {
  size_t i;
  for (i = 0; i < n; i++) {
    int bit;
    crc ^= d[i];
    for (bit = 0; bit < 8; bit++)
      crc = (crc & 1U) ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
  }
  return crc;
}

static void put16(uint8_t *p, uint16_t v) {
  p[0] = (uint8_t)v;
  p[1] = (uint8_t)(v >> 8);
}
static void put32(uint8_t *p, uint32_t v) {
  put16(p, (uint16_t)v);
  put16(p + 2, (uint16_t)(v >> 16));
}

/** One CODE segment of `code_n` bytes and, when ntasks > 0, one TASK segment. */
static size_t build_bytes(uint8_t *out, const uint8_t *code, size_t code_n, uint16_t entry, const task_t *tasks, unsigned ntasks) {
  size_t segments = ntasks != 0U ? 2U : 1U;
  size_t table = ZPLC_FILE_HEADER_SIZE + segments * ZPLC_SEGMENT_ENTRY_SIZE;
  size_t task_bytes = (size_t)ntasks * ZPLC_TASK_DEF_SIZE;
  size_t length = table + code_n + task_bytes;
  uint32_t crc;
  unsigned i;

  memset(out, 0, length);
  memcpy(out, "ZPLC", 4U);
  put16(out + 4U, ZPLC_VERSION_MAJOR);
  put16(out + 6U, ZPLC_VERSION_MINOR);
  put32(out + 16U, (uint32_t)code_n);
  put32(out + 20U, (uint32_t)task_bytes);
  put16(out + 24U, entry);
  put16(out + 26U, (uint16_t)segments);
  put32(out + 28U, ZPLC_DRAFT_COUNTER);
  put16(out + 32U, ZPLC_SEG_CODE);
  put32(out + 36U, (uint32_t)code_n);
  if (ntasks != 0U) {
    put16(out + 40U, ZPLC_SEG_TASK);
    put32(out + 44U, (uint32_t)task_bytes);
  }
  memcpy(out + table, code, code_n);
  for (i = 0U; i < ntasks; i++) {
    uint8_t *task = out + table + code_n + (size_t)i * ZPLC_TASK_DEF_SIZE;
    put16(task, (uint16_t)(i + 1U));
    put32(task + 4U, 10000U);
    put16(task + 8U, tasks[i].entry);
    put16(task + 10U, tasks[i].stack);
  }
  crc = crc32_update(0xFFFFFFFFU, out, 12U);
  crc = crc32_update(crc, out + 16U, length - 16U) ^ 0xFFFFFFFFU;
  put32(out + 12U, crc);
  return length;
}

static size_t build(uint8_t *out, const code_t *code, uint16_t entry, const task_t *tasks, unsigned ntasks) {
  return build_bytes(out, code->b, code->n, entry, tasks, ntasks);
}

static uint8_t workspace[ZPLC_LOADER_VERIFY_WORKSPACE_SIZE];

/** Loader verdict for a program with the default entry and no TASK segment. */
static int verdict(const code_t *code) {
  static uint8_t file[2048];
  zplc_program_view_t view;
  size_t length = build(file, code, 0U, NULL, 0U);
  return zplc_loader_verify(file, length, workspace, sizeof workspace, &view);
}

/** Loader verdict with tasks (entry and declared stack depth each). */
static int verdict_tasks(const code_t *code, const task_t *tasks, unsigned ntasks) {
  static uint8_t file[2048];
  zplc_program_view_t view;
  size_t length = build(file, code, 0U, tasks, ntasks);
  return zplc_loader_verify(file, length, workspace, sizeof workspace, &view);
}

/** Load through the loader and run one cycle; returns the VM error, or the
 *  loader code (negative) when the artifact is refused. */
static int run_verified(const code_t *code) {
  static uint8_t file[2048];
  size_t length = build(file, code, 0U, NULL, 0U);
  int rc;
  zplc_core_init();
  rc = zplc_core_load(file, length, workspace, sizeof workspace);
  if (rc != ZPLC_LOADER_OK)
    return rc;
  (void)zplc_core_run_cycle();
  return zplc_core_get_error();
}

/** Run the bytes directly: what the VM does with an artifact that the loader
 *  did not see (defence in depth). Returns the VM error. */
static int run_raw(const code_t *code) {
  zplc_core_init();
  if (zplc_test_load_raw(code->b, code->n) != 0)
    return -1000;
  (void)zplc_core_run_cycle();
  return zplc_core_get_error();
}

#define OK ZPLC_VM_HALTED
#define OOB ZPLC_VM_OUT_OF_BOUNDS

/* ----------------------------------------------------------------------------
 * RT-001: indirect loads and stores
 * ------------------------------------------------------------------------- */

static void indirect_load(const char *name, uint8_t opcode, uint32_t address, int expected) {
  code_t c = {{0}, 0};
  push_runtime(&c, address);
  op(&c, opcode);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, name);
  CHECK_EQ(run_verified(&c), expected, name);
}

static void indirect_store(const char *name, uint8_t opcode, uint32_t address, int expected) {
  code_t c = {{0}, 0};
  push_runtime(&c, address);
  op8(&c, OP_PUSH8, 0x5A);
  op(&c, opcode);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, name);
  CHECK_EQ(run_verified(&c), expected, name);
}

static void test_indirect_access(void) {
  printf("=== RT-001 indirect load and store ===\n");

  /* last valid byte accepted, first invalid byte refused */
  indirect_load("LOADI8 at the last retentive byte", OP_LOADI8, 0x4FFFU, OK);
  indirect_load("LOADI8 at the first code-region byte", OP_LOADI8, 0x5000U, OOB);
  indirect_load("LOADI16 ending at the last byte", OP_LOADI16, 0x4FFEU, OK);
  indirect_load("LOADI16 extent crosses the region end", OP_LOADI16, 0x4FFFU, OOB);
  indirect_load("LOADI32 ending at the last byte", OP_LOADI32, 0x4FFCU, OK);
  indirect_load("LOADI32 extent crosses the region end", OP_LOADI32, 0x4FFDU, OOB);

  /* an extent that crosses the boundary of two valid regions */
  indirect_load("LOADI32 across input and output images", OP_LOADI32, 0x0FFEU, OOB);
  indirect_load("LOADI16 across output image and work memory", OP_LOADI16, 0x1FFFU, OOB);
  indirect_load("LOADI16 across work and retentive memory", OP_LOADI16, 0x3FFFU, OOB);

  /* address arithmetic that wraps past 16 bits */
  indirect_load("LOADI8 at 0x10000 does not alias input 0", OP_LOADI8, 0x00010000U, OOB);
  indirect_load("LOADI8 at 0x12000 does not alias work memory", OP_LOADI8, 0x00012000U, OOB);
  indirect_load("LOADI32 at -4 (0xFFFFFFFC)", OP_LOADI32, 0xFFFFFFFCU, OOB);
  indirect_load("LOADI8 at 0xFFFFFFFF", OP_LOADI8, 0xFFFFFFFFU, OOB);
  indirect_load("LOADI8 at 0x80002000 (sign bit set)", OP_LOADI8, 0x80002000U, OOB);

  indirect_store("STOREI8 at the last retentive byte", OP_STOREI8, 0x4FFFU, OK);
  indirect_store("STOREI8 at the first code-region byte", OP_STOREI8, 0x5000U, OOB);
  indirect_store("STOREI16 extent crosses the region end", OP_STOREI16, 0x4FFFU, OOB);
  indirect_store("STOREI32 ending at the last byte", OP_STOREI32, 0x4FFCU, OK);
  indirect_store("STOREI32 extent crosses the region end", OP_STOREI32, 0x4FFDU, OOB);
  indirect_store("STOREI32 across output image and work memory", OP_STOREI32, 0x1FFEU, OOB);
  indirect_store("STOREI8 at 0x12000 does not alias work memory", OP_STOREI8, 0x00012000U, OOB);
  indirect_store("STOREI8 at 0xFFFFFFFF", OP_STOREI8, 0xFFFFFFFFU, OOB);
  indirect_store("STOREI8 into the read-only input image", OP_STOREI8, 0x0000U, OOB);
  indirect_store("STOREI32 into the read-only input image", OP_STOREI32, 0x0FFCU, OOB);
}

static void test_direct_access_at_the_vm(void) {
  code_t c;
  printf("=== RT-001 direct access, program the loader did not see ===\n");

  c.n = 0;
  op16(&c, OP_LOAD64, 0x4FF8U);
  op(&c, OP_DROP);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_raw(&c), OK, "LOAD64 ending at the last byte");
  c.n = 0;
  op16(&c, OP_LOAD64, 0x4FFCU);
  op(&c, OP_HALT);
  CHECK_EQ(run_raw(&c), OOB, "LOAD64 extent crosses the region end");
  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op8(&c, OP_PUSH8, 2);
  op16(&c, OP_STORE64, 0x3FFCU);
  op(&c, OP_HALT);
  CHECK_EQ(run_raw(&c), OOB, "STORE64 across work and retentive memory");
  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op16(&c, OP_STORE32, 0x0000U);
  op(&c, OP_HALT);
  CHECK_EQ(run_raw(&c), OOB, "STORE32 into the input image");
}

/* RT-001: a region is its window of the address space, from its base to the
 * base of the next region, and no larger, whatever the storage behind it is:
 * with a WORK memory above 0x2000 bytes, address 0x4000 is retentive memory,
 * not the rest of WORK (test_sandbox_regions runs this whole file on such a
 * build). */
static void test_region_windows(void) {
  code_t c;
  const uint8_t *retain;
  printf("=== RT-001 a region is its window of the address space ===\n");

  c.n = 0;
  op8(&c, OP_PUSH8, 0x5A);
  op16(&c, OP_STORE8, 0x4000U);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "STORE8 at the first retentive byte is accepted");
  CHECK_EQ(run_verified(&c), OK, "STORE8 at the first retentive byte runs");
  retain = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
  CHECK_EQ(retain[0], 0x5A, "and it is retentive memory that it writes");
#if ZPLC_MEM_WORK_SIZE > 0x2000U
  CHECK_EQ(zplc_mem_get_region(ZPLC_MEM_WORK_BASE)[0x2000U], 0, "and not the work memory behind the end of its window");
#endif

  c.n = 0;
  push_runtime(&c, 0x4000U);
  op(&c, OP_LOADI8);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OK, "LOADI8 at the first retentive byte");

  c.n = 0;
  op16(&c, OP_LOAD8, 0x5000U);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_MEMORY, "LOAD8 at the first byte after retentive memory is refused");
  CHECK_EQ(run_raw(&c), OOB, "and the VM faults on it");

  c.n = 0;
  op16(&c, OP_LOAD16, 0x4FFFU);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_MEMORY, "LOAD16 across the end of retentive memory is refused");
  CHECK_EQ(run_raw(&c), OOB, "and the VM faults on it");
}

/* ----------------------------------------------------------------------------
 * RT-001: string operations
 * ------------------------------------------------------------------------- */

/** Make a string header: length and capacity, in work memory. */
static void set_string(code_t *c, uint16_t address, uint16_t length, uint16_t capacity) {
  op16(c, OP_PUSH16, length);
  op16(c, OP_STORE16, address);
  op16(c, OP_PUSH16, capacity);
  op16(c, OP_STORE16, (uint16_t)(address + 2U));
}

static void test_string_operations(void) {
  code_t c;
  const uint8_t *retain;
  printf("=== RT-001 string operations ===\n");

  c.n = 0;
  push_runtime(&c, 0x4FFFU);
  op(&c, OP_STRLEN);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRLEN header crosses the region end");

  c.n = 0;
  push_runtime(&c, 0x00010000U);
  op(&c, OP_STRLEN);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRLEN at 0x10000 does not alias input 0");

  c.n = 0;
  push_runtime(&c, 0xFFFFFFFEU);
  op(&c, OP_STRCLR);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRCLR at 0xFFFFFFFE does not wrap to input 0");

  /* STRCPY whose destination capacity runs past the end of retentive memory:
   * it faults and writes nothing (no partial copy). */
  c.n = 0;
  set_string(&c, 0x2100U, 50U, 50U);
  op8(&c, OP_PUSH8, 0x41);
  op16(&c, OP_STORE8, 0x2104U);
  set_string(&c, 0x4FF0U, 0U, 100U);
  push_runtime(&c, 0x2100U);
  push_runtime(&c, 0x4FF0U);
  op(&c, OP_STRCPY);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRCPY past the region end faults");
  retain = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
  CHECK_EQ(retain[0xFF4], 0, "STRCPY past the region end writes nothing");

  /* the same copy that fits is performed */
  c.n = 0;
  set_string(&c, 0x2100U, 4U, 4U);
  op8(&c, OP_PUSH8, 0x41);
  op16(&c, OP_STORE8, 0x2104U);
  set_string(&c, 0x4FF0U, 0U, 4U);
  push_runtime(&c, 0x2100U);
  push_runtime(&c, 0x4FF0U);
  op(&c, OP_STRCPY);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OK, "STRCPY that fits runs");
  retain = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
  CHECK_EQ(retain[0xFF4], 0x41, "STRCPY that fits copies the character");

  /* STRCAT: appended text would run past the end of retentive memory */
  c.n = 0;
  set_string(&c, 0x2100U, 60U, 60U);
  op8(&c, OP_PUSH8, 0x42);
  op16(&c, OP_STORE8, 0x2104U);
  set_string(&c, 0x4FF0U, 2U, 100U);
  push_runtime(&c, 0x2100U);
  push_runtime(&c, 0x4FF0U);
  op(&c, OP_STRCAT);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRCAT past the region end faults");
  retain = zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE);
  CHECK_EQ(retain[0xFF6], 0, "STRCAT past the region end writes nothing");

  /* STRCMP of a string whose length reaches past the end of retentive memory */
  c.n = 0;
  set_string(&c, 0x4FF0U, 200U, 200U);
  set_string(&c, 0x2100U, 200U, 200U);
  push_runtime(&c, 0x4FF0U);
  push_runtime(&c, 0x2100U);
  op(&c, OP_STRCMP);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRCMP past the region end faults");

  c.n = 0;
  set_string(&c, 0x2100U, 3U, 3U);
  set_string(&c, 0x2200U, 3U, 3U);
  push_runtime(&c, 0x2100U);
  push_runtime(&c, 0x2200U);
  op(&c, OP_STRCMP);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OK, "STRCMP of two equal strings runs");

  /* STRCPY from an address that wraps */
  c.n = 0;
  push_runtime(&c, 0x00012100U);
  push_runtime(&c, 0x2100U);
  op(&c, OP_STRCPY);
  op(&c, OP_HALT);
  CHECK_EQ(run_verified(&c), OOB, "STRCPY source at 0x12100 does not alias work memory");
}

/** A string of `text` and room for `capacity` characters, in work memory. */
static void put_text(code_t *c, uint16_t address, const char *text, uint16_t capacity) {
  size_t i, n = strlen(text);

  set_string(c, address, (uint16_t)n, capacity);
  for (i = 0U; i < n; i++) {
    op8(c, OP_PUSH8, (uint8_t)text[i]);
    op16(c, OP_STORE8, (uint16_t)(address + ZPLC_STRING_DATA_OFFSET + i));
  }
}

/** STRCMP of two texts; the result of the instruction, or 100 on a fault. */
static int compare_texts(const char *a, const char *b) {
  code_t c = {{0}, 0};
  const uint8_t *work;

  put_text(&c, 0x2100U, a, 16U);
  put_text(&c, 0x2200U, b, 16U);
  push_runtime(&c, 0x2100U);
  push_runtime(&c, 0x2200U);
  op(&c, OP_STRCMP);
  op16(&c, OP_STORE32, 0x2300U);
  op(&c, OP_HALT);
  if (run_verified(&c) != OK)
    return 100;
  work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
  return (int)(int32_t)((uint32_t)work[0x300] | ((uint32_t)work[0x301] << 8) | ((uint32_t)work[0x302] << 16) |
                        ((uint32_t)work[0x303] << 24));
}

/** STRCMP of the string at `a` (header written by the program, or by the host
 *  into the input image, which the program cannot write) and a string of the
 *  same length in work memory. Returns the VM error. */
static int compare_at(uint16_t a, uint16_t length, int header_from_host) {
  code_t c = {{0}, 0};
  static uint8_t file[2048];
  size_t size;
  int rc;

  if (!header_from_host)
    set_string(&c, a, length, length);
  set_string(&c, 0x2200U, length, length);
  push_runtime(&c, a);
  push_runtime(&c, 0x2200U);
  op(&c, OP_STRCMP);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  size = build(file, &c, 0U, NULL, 0U);
  zplc_core_init();
  rc = zplc_core_load(file, size, workspace, sizeof workspace);
  if (rc != ZPLC_LOADER_OK)
    return rc;
  if (header_from_host) {
    CHECK_EQ(zplc_ipi_write16(a, length), 0, "header of a string in the input image");
    CHECK_EQ(zplc_ipi_write16((uint16_t)(a + 2U), length), 0, "its capacity");
  }
  (void)zplc_core_run_cycle();
  return zplc_core_get_error();
}

/* RT-001: STRCMP places both strings, header and the characters compared,
 * before it reads one, like STRCPY. It used to read the characters one at a
 * time and place each on its own, so a string whose header claims more
 * characters than its region holds was read across the end of the region into
 * the next. */
static void test_strcmp_extents(void) {
  printf("=== RT-001 STRCMP places the strings it compares ===\n");

  CHECK_EQ(compare_texts("abc", "abc"), 0, "equal strings compare equal");
  CHECK_EQ(compare_texts("abc", "abd"), -1, "the first different character decides, less");
  CHECK_EQ(compare_texts("abd", "abc"), 1, "the first different character decides, greater");
  CHECK_EQ(compare_texts("ab", "abc"), -1, "a prefix is less");
  CHECK_EQ(compare_texts("abc", "ab"), 1, "and the longer is greater");
  CHECK_EQ(compare_texts("", ""), 0, "empty strings are equal");

  /* the characters end exactly at the last byte of a region: accepted; one
   * more character crosses into the next region: a fault */
  CHECK_EQ(compare_at(0x0FF8U, 4U, 1), OK, "4 characters end at the last input byte");
  CHECK_EQ(compare_at(0x0FF8U, 5U, 1), OOB, "5 characters cross from the input image into the output image");
  CHECK_EQ(compare_at(0x0FF8U, 0x20U, 1), OOB, "a length of 0x20 in the input image faults");
  CHECK_EQ(compare_at(0x1FF8U, 4U, 0), OK, "4 characters end at the last output byte");
  CHECK_EQ(compare_at(0x1FF8U, 5U, 0), OOB, "5 characters cross from the output image into work memory");
  CHECK_EQ(compare_at(0x1FF8U, 0x20U, 0), OOB, "a length of 0x20 in the output image faults");
  CHECK_EQ(compare_at(0x3FF8U, 4U, 0), OK, "4 characters end at the last work byte");
  CHECK_EQ(compare_at(0x3FF8U, 5U, 0), OOB, "5 characters cross from work into retentive memory");
  CHECK_EQ(compare_at(0x3FF8U, 0x20U, 0), OOB, "a length of 0x20 in work memory faults");
  CHECK_EQ(compare_at(0x4FF8U, 4U, 0), OK, "4 characters end at the last retentive byte");
  CHECK_EQ(compare_at(0x4FF8U, 5U, 0), OOB, "5 characters cross out of retentive memory");
}

/* ----------------------------------------------------------------------------
 * RT-001: communication opcodes (the PoC shapes, address built at run time)
 * ------------------------------------------------------------------------- */

static void comm_runtime(const char *name, uint8_t opcode, uint32_t kind, uint32_t address, int expected) {
  code_t c = {{0}, 0};
  push_runtime(&c, address);
  op32(&c, opcode, kind);
  if (opcode == OP_COMM_STATUS)
    op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, name);
  CHECK_EQ(run_verified(&c), expected, name);
}

static void test_comm_opcodes(void) {
  printf("=== RT-001 communication opcodes ===\n");

  /* Modbus read holding registers: 110 bytes */
  comm_runtime("COMM_EXEC block ending at the last retentive byte", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x4F92U, OK);
  comm_runtime("COMM_EXEC block one byte past the last retentive byte", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x4F93U, OOB);
  comm_runtime("COMM_EXEC block at the last retentive byte (review PoC)", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x4FFFU, OOB);
  comm_runtime("COMM_STATUS block at the last output-image byte (review PoC)", OP_COMM_STATUS, ZPLC_COMM_FB_MB_READ_HREG, 0x1FFCU, OOB);
  comm_runtime("COMM_RESET block past the retentive end", OP_COMM_RESET, ZPLC_COMM_FB_MQTT_PUBLISH, 0x4F80U, OOB);
  comm_runtime("COMM_EXEC block across output image and work memory", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x1FF0U, OOB);
  comm_runtime("COMM_EXEC block that would write the input image", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x0000U, OOB);
  comm_runtime("COMM_RESET block that would write the input image", OP_COMM_RESET, ZPLC_COMM_FB_SPB_REBIRTH, 0x0100U, OOB);
  comm_runtime("COMM_STATUS may read the input image", OP_COMM_STATUS, ZPLC_COMM_FB_SPB_REBIRTH, 0x0000U, OK);
  comm_runtime("COMM_EXEC at 0x12000 does not alias work memory", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x00012000U, OOB);
  comm_runtime("COMM_EXEC at 0xFFFFFFFF", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0xFFFFFFFFU, OOB);

  /* the smallest block with a layout, the 8-byte handshake and the byte of the dispatcher, at its boundary */
  comm_runtime("9-byte block at the last 9 retentive bytes", OP_COMM_EXEC, ZPLC_COMM_FB_SPB_REBIRTH, 0x5000U - ZPLC_COMM_SPB_REBIRTH_SIZE,
               OK);
  comm_runtime("9-byte block one byte too far", OP_COMM_EXEC, ZPLC_COMM_FB_SPB_REBIRTH, 0x5000U - ZPLC_COMM_SPB_REBIRTH_SIZE + 1U, OOB);

  /* a kind with no layout is the 8-byte handshake only */
  comm_runtime("kind without layout at the last 8 bytes", OP_COMM_STATUS, ZPLC_COMM_FB_COMM_STATUS, 0x4FF8U, OK);
  comm_runtime("kind without layout one byte too far", OP_COMM_STATUS, ZPLC_COMM_FB_COMM_STATUS, 0x4FF9U, OOB);
}

static void raw_comm(const char *name, uint8_t opcode, uint32_t kind, uint32_t address, int expected) {
  code_t c = {{0}, 0};
  op32(&c, OP_PUSH32, address);
  op32(&c, opcode, kind);
  if (opcode == OP_COMM_STATUS)
    op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(run_raw(&c), expected, name);
}

static void test_comm_opcodes_raw(void) {
  printf("=== RT-001 communication opcodes, constant address at the VM ===\n");
  raw_comm("COMM_EXEC at the last retentive byte", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x4FFFU, OOB);
  raw_comm("COMM_STATUS at 0x1FFC", OP_COMM_STATUS, ZPLC_COMM_FB_MB_READ_HREG, 0x1FFCU, OOB);
  raw_comm("COMM_EXEC block that fits", OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG, 0x4F92U, OK);
}

/* ----------------------------------------------------------------------------
 * RT-001, RT-002: what the run fuzzer found in the communication opcodes
 * (D1 write of the input image, D2 write past a region, D3 read past a
 * region, D4 a handler given a block that does not fit)
 * ------------------------------------------------------------------------- */

/** One COMM_* on a block at `base`, as a program the loader sees (PUSH32, then
 *  the opcode) and as bytes the VM runs unchecked. */
static void comm_at(const char *name, uint8_t opcode, uint32_t kind, uint32_t base, int expect_ok) {
  code_t c = {{0}, 0};
  static const uint8_t zeros[ZPLC_MEM_IPI_SIZE];
  const uint8_t *input_image;

  op32(&c, OP_PUSH32, base);
  op32(&c, opcode, kind);
  if (opcode == OP_COMM_STATUS)
    op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), expect_ok ? ZPLC_LOADER_OK : ZPLC_LOADER_ERR_COMM, name);
  CHECK_EQ(run_raw(&c), expect_ok ? OK : OOB, name);
  input_image = zplc_mem_get_region(ZPLC_MEM_IPI_BASE);
  CHECK(memcmp(input_image, zeros, sizeof zeros) == 0, name);
}

static void test_region_ends(void) {
  /* the end of the input image, output image, work and retentive memory */
  static const struct {
    uint32_t end;
    int writable;
    const char *name;
  } ends[] = {{0x1000U, 0, "input image"}, {0x2000U, 1, "output image"}, {0x4000U, 1, "work memory"}, {0x5000U, 1, "retentive memory"}};
  static const uint32_t kinds[] = {ZPLC_COMM_FB_MB_READ_HREG, ZPLC_COMM_FB_MQTT_CONNECT, ZPLC_COMM_FB_SPB_REBIRTH,
                                   ZPLC_COMM_FB_COMM_STATUS};
  static const uint8_t opcodes[] = {OP_COMM_EXEC, OP_COMM_STATUS, OP_COMM_RESET};
  size_t e, k, o;
  unsigned back;
  char name[96];
  printf("=== RT-001, RT-002 the block against the end of each region ===\n");

  for (e = 0U; e < sizeof ends / sizeof ends[0]; e++) {
    for (k = 0U; k < sizeof kinds / sizeof kinds[0]; k++) {
      uint32_t length = zplc_comm_fb_size(kinds[k]);
      if (length == 0U)
        length = ZPLC_COMM_FB_HANDSHAKE_SIZE;
      for (o = 0U; o < sizeof opcodes / sizeof opcodes[0]; o++) {
        for (back = 1U; back <= length + 2U; back++) {
          const int fits = back >= length;
          const int write = opcodes[o] != OP_COMM_STATUS;
          /* sampling a long block: the first sixteen, and the three around its length */
          if (back > 16U && (back + 1U < length || back > length + 1U))
            continue;
          snprintf(name, sizeof name, "op 0x%02X kind 0x%02X, %u bytes before the end of the %s", opcodes[o], (unsigned)kinds[k], back,
                   ends[e].name);
          comm_at(name, opcodes[o], kinds[k], ends[e].end - back, fits && (!write || ends[e].writable));
        }
      }
    }
  }

  /* the reproducers of the fuzzer, literally */
  comm_at("PUSH32 0; COMM_RESET 1 writes the input image", OP_COMM_RESET, 1U, 0x0000U, 0);
  comm_at("COMM_EXEC on the input image", OP_COMM_EXEC, 1U, 0x0100U, 0);
  comm_at("COMM_EXEC at the last 4 bytes of the output image", OP_COMM_EXEC, 1U, 0x1FFCU, 0);
  comm_at("COMM_STATUS at the last 4 bytes of the input image", OP_COMM_STATUS, 1U, 0x0FFCU, 0);
  comm_at("COMM_RESET at the last 4 bytes of retentive memory", OP_COMM_RESET, 1U, 0x4FFCU, 0);
  comm_at("COMM_EXEC with the handshake at 0x4FFD", OP_COMM_EXEC, 1U, 0x4FFDU, 0);
}

static int handler_calls;
static uint16_t handler_length;
static uint8_t *handler_block;

static int recording_handler(zplc_comm_fb_kind_t kind, uint8_t *fb_mem, uint16_t fb_len, zplc_comm_call_t call) {
  (void)kind;
  (void)call;
  handler_calls++;
  handler_length = fb_len;
  handler_block = fb_mem;
  /* CONNECTED, the member that follows PROFILE: writes inside the 12 bytes */
  fb_mem[ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET] = 1U;
  return 0;
}

static void test_handler_gets_a_block_that_fits(void) {
  code_t c;
  uint8_t *work;
  printf("=== RT-002 a handler is given a block that fits, and its length ===\n");

  CHECK_EQ(zplc_comm_register_handler(ZPLC_COMM_FB_MQTT_CONNECT, recording_handler), 0, "register a handler");

  /* D4: the handshake of an MQTT_CONNECT (12 bytes) at 0x3FF8 fits the work
   * memory, the block does not: the handler is not called, nothing is written */
  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op16(&c, OP_STORE8, 0x3FF8U); /* EN */
  op32(&c, OP_PUSH32, 0x3FF8U);
  op32(&c, OP_COMM_EXEC, ZPLC_COMM_FB_MQTT_CONNECT);
  op(&c, OP_HALT);
  handler_calls = 0;
  CHECK_EQ(run_raw(&c), OOB, "MQTT_CONNECT at 0x3FF8 does not fit work memory");
  CHECK_EQ(handler_calls, 0, "the handler is not called for it");
  CHECK_EQ(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE)[0], 0, "nothing is written past work memory");

  /* the same block 4 bytes lower ends exactly at the end of work memory */
  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op16(&c, OP_STORE8, 0x3FF4U); /* EN */
  op32(&c, OP_PUSH32, 0x3FF4U);
  op32(&c, OP_COMM_EXEC, ZPLC_COMM_FB_MQTT_CONNECT);
  op(&c, OP_HALT);
  handler_calls = 0;
  CHECK_EQ(run_raw(&c), OK, "MQTT_CONNECT at 0x3FF4 fits work memory");
  CHECK_EQ(handler_calls, 1, "the handler is called once");
  CHECK_EQ(handler_length, ZPLC_COMM_MQTT_CONNECT_SIZE, "with the length of its kind");
  work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
  CHECK(handler_block == &work[0x3FF4U - ZPLC_MEM_WORK_BASE], "and a pointer to the block");
  CHECK_EQ(work[0x3FF4U - ZPLC_MEM_WORK_BASE + ZPLC_COMM_MQTT_CONNECT_CONNECTED_OFFSET], 1, "the handler wrote inside the block");
  CHECK_EQ(zplc_mem_get_region(ZPLC_MEM_RETAIN_BASE)[0], 0, "and nothing outside it");
}

/* ----------------------------------------------------------------------------
 * RT-002: the loader refuses a statically known block that does not fit
 * ------------------------------------------------------------------------- */

static int comm_verdict(uint16_t address, uint8_t opcode, uint32_t kind) {
  code_t c = {{0}, 0};
  op16(&c, OP_PUSH16, address);
  op32(&c, opcode, kind);
  if (opcode == OP_COMM_STATUS)
    op(&c, OP_DROP);
  op(&c, OP_HALT);
  return verdict(&c);
}

static void test_loader_block_fit(void) {
  code_t c;
  printf("=== RT-002 static function-block fit ===\n");

  CHECK_EQ(comm_verdict(0x4F92U, OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_OK, "block ending at the last retentive byte fits");
  CHECK_EQ(comm_verdict(0x4F93U, OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_ERR_COMM, "block one byte past the retentive end");
  CHECK_EQ(comm_verdict(0x4FFFU, OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_ERR_COMM, "block at the last retentive byte");
  CHECK_EQ(comm_verdict(0x1FF0U, OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_ERR_COMM,
           "block across output image and work memory");
  CHECK_EQ(comm_verdict(0x0000U, OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_ERR_COMM,
           "block the handler would write in the input image");
  CHECK_EQ(comm_verdict(0x0000U, OP_COMM_STATUS, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_OK, "status read of a block in the input image");
  CHECK_EQ(comm_verdict(0x0FFCU, OP_COMM_STATUS, ZPLC_COMM_FB_MB_READ_HREG), ZPLC_LOADER_ERR_COMM,
           "status read of a block across two regions");
  CHECK_EQ(comm_verdict(0x4FF8U, OP_COMM_STATUS, ZPLC_COMM_FB_COMM_STATUS), ZPLC_LOADER_OK, "kind without layout, 8 bytes, fits");
  CHECK_EQ(comm_verdict(0x4FF9U, OP_COMM_STATUS, ZPLC_COMM_FB_COMM_STATUS), ZPLC_LOADER_ERR_COMM, "kind without layout, one byte too far");

  /* a 32-bit push whose value is no address of PLC memory */
  c.n = 0;
  op32(&c, OP_PUSH32, 0x00014F92U);
  op32(&c, OP_COMM_EXEC, ZPLC_COMM_FB_MB_READ_HREG);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_COMM, "block at 0x14F92 is outside PLC memory");

  /* every kind of the generated table: exactly fitting, then one byte over */
#define ZPLC_TEST_KIND_FIT(name, kind, size)                                                                                     \
  CHECK_EQ(comm_verdict((uint16_t)(0x5000 - (size)), OP_COMM_EXEC, (kind)), ZPLC_LOADER_OK, #name " fits at the retentive end"); \
  CHECK_EQ(comm_verdict((uint16_t)(0x5000 - (size) + 1), OP_COMM_EXEC, (kind)), ZPLC_LOADER_ERR_COMM,                            \
           #name " one byte over the retentive end");                                                                            \
  CHECK_EQ(comm_verdict((uint16_t)(0x4000 - (size) + 1), OP_COMM_RESET, (kind)), ZPLC_LOADER_ERR_COMM,                           \
           #name " across work and retentive memory");
  ZPLC_COMM_FB_TABLE(ZPLC_TEST_KIND_FIT)
#undef ZPLC_TEST_KIND_FIT
}

/* ----------------------------------------------------------------------------
 * RT-003: the loader verifies the stack effect of every path
 * ------------------------------------------------------------------------- */

static void test_stack_underflow(void) {
  code_t c;
  printf("=== RT-003 underflow ===\n");

  c.n = 0;
  op(&c, OP_ADD);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "ADD on an empty stack");

  c.n = 0;
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "DROP on an empty stack");

  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op(&c, OP_ADD);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "ADD with one operand");

  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op8(&c, OP_PUSH8, 2);
  op(&c, OP_ADD);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "ADD with two operands");

  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op8(&c, OP_PICK, 1);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "PICK 1 with one value");

  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op8(&c, OP_PUSH8, 2);
  op8(&c, OP_PICK, 1);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "PICK 1 with two values");

  c.n = 0;
  op32(&c, OP_COMM_STATUS, ZPLC_COMM_FB_MB_READ_HREG);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "COMM_STATUS without an address");

  c.n = 0;
  op16(&c, OP_STORE16, 0x2000U);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "STORE16 on an empty stack");

  c.n = 0;
  op8(&c, OP_PUSH8, 1);
  op8(&c, OP_PUSH8, 2);
  op16(&c, OP_STORE64, 0x2000U);
  op16(&c, OP_LOAD64, 0x2000U);
  op(&c, OP_DROP);
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "STORE64 then LOAD64 balance");
}

/* CMP-015: a two-word operand is two stack words, and the verifier proves it from the table. */
static void wide_program(code_t *c, unsigned pushes, uint8_t opcode, unsigned drops) {
  unsigned i;
  c->n = 0;
  for (i = 0; i < pushes; i++)
    op8(c, OP_PUSH8, 1);
  op(c, opcode);
  for (i = 0; i < drops; i++)
    op(c, OP_DROP);
  op(c, OP_HALT);
}

static void test_wide_stack_effects(void) {
  code_t c;
  printf("=== RT-003 two-word operands (CMP-015) ===\n");

  wide_program(&c, 3U, OP_MUL64, 0U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "MUL64 with three words is an underflow");
  wide_program(&c, 4U, OP_MUL64, 2U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "MUL64 takes four words and leaves two");
  wide_program(&c, 4U, OP_MUL64, 3U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "MUL64 leaves two words, not three");

  wide_program(&c, 2U, OP_SHL64, 0U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "SHL64 needs the count word as well as the value");
  wide_program(&c, 3U, OP_SAR64, 2U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "SAR64 takes a two-word value and a count");

  wide_program(&c, 1U, OP_NEG64, 0U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "NEG64 with one word is an underflow");
  wide_program(&c, 2U, OP_ABS64, 2U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "ABS64 is two words in and two words out");

  wide_program(&c, 2U, OP_ADDD, 0U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "ADDD with one operand is an underflow");
  wide_program(&c, 4U, OP_DIVD, 2U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "DIVD takes two doubles and leaves one");
  wide_program(&c, 4U, OP_LTD, 1U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "LTD takes two doubles and leaves one word");
  wide_program(&c, 3U, OP_GED, 0U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "GED with three words is an underflow");

  wide_program(&c, 1U, OP_F2D, 2U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "F2D turns one word into two");
  wide_program(&c, 1U, OP_F2D, 3U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "F2D leaves two words, not three");
  wide_program(&c, 1U, OP_D2F, 0U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "D2F with one word is an underflow");
  wide_program(&c, 2U, OP_D2F, 1U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "D2F turns two words into one");
  wide_program(&c, 2U, OP_D2I, 1U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "D2I turns two words into one");

  /* the contract's own number of words: a store of a converted value */
  c.n = 0;
  op8(&c, OP_PUSH8, 3);
  op(&c, OP_I2D);
  op16(&c, OP_STORE64, 0x2000U);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "I2D then STORE64 balance");
}

static void test_stack_paths(void) {
  code_t c;
  printf("=== RT-003 paths ===\n");

  /* the jump reaches DROP with nothing on the stack, the fallthrough with one */
  c.n = 0;
  op8(&c, OP_PUSH8, 1); /* 0 */
  op16(&c, OP_JNZ, 7U); /* 2: depth 0 on both edges */
  op8(&c, OP_PUSH8, 7); /* 5: fallthrough pushes */
  op(&c, OP_DROP);      /* 7: reached with depth 0 and with depth 1 */
  op(&c, OP_HALT);      /* 8 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "join with two different depths");

  /* a loop that grows the stack on every pass */
  c.n = 0;
  op8(&c, OP_PUSH8, 1); /* 0 */
  op16(&c, OP_JMP, 0U); /* 2 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "loop that grows the stack");

  /* a loop that keeps the stack level */
  c.n = 0;
  op8(&c, OP_PUSH8, 1); /* 0: depth 1 */
  op(&c, OP_DUP);       /* 2: 2 */
  op(&c, OP_DROP);      /* 3: 1 */
  op16(&c, OP_JNZ, 0U); /* 4: pops, back to the entry with depth 0 */
  op(&c, OP_HALT);      /* 7 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "loop that keeps the stack level");

  /* the selector of a CASE stays on the stack across the branches */
  c.n = 0;
  op16(&c, OP_LOAD16, 0x2000U);  /* 0:  1 */
  op(&c, OP_DUP);                /* 3:  2 */
  op8(&c, OP_PUSH8, 1);          /* 4:  3 */
  op(&c, OP_EQ);                 /* 6:  2 */
  op16(&c, OP_JNZ, 20U);         /* 7:  1 on both edges */
  op(&c, OP_DUP);                /* 10: 2 */
  op8(&c, OP_PUSH8, 2);          /* 11: 3 */
  op(&c, OP_EQ);                 /* 13: 2 */
  op16(&c, OP_JNZ, 20U);         /* 14: 1 */
  op16(&c, OP_JMP, 29U);         /* 17: else */
  op(&c, OP_DROP);               /* 20: branch, 0 */
  op8(&c, OP_PUSH8, 9);          /* 21: 1 */
  op16(&c, OP_STORE16, 0x2002U); /* 23: 0 */
  op16(&c, OP_JMP, 30U);         /* 26: end */
  op(&c, OP_DROP);               /* 29: else, 0 */
  op(&c, OP_HALT);               /* 30 */
  CHECK_EQ(c.n, 31U, "CASE shape length");
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "CASE selector kept across branches");

  /* the else branch forgets to drop the selector (what the compiler emits for
   * a CASE with no ELSE when no label matches): the depth at the end is 0 or
   * 1, which is within the stack and is accepted ... */
  c.b[29] = OP_NOP;
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "a branch that leaves one value behind is bounded");

  /* ... but the same leak followed by a DROP can underflow on the other path */
  c.n = 30;
  op(&c, OP_DROP);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "drop after a join of depth 0 and 1");

  /* a value left behind on every pass of a loop is not bounded */
  c.n = 0;
  op16(&c, OP_LOAD16, 0x2000U); /* 0: one more each time round */
  op16(&c, OP_LOAD16, 0x2002U); /* 3 */
  op16(&c, OP_JNZ, 0U);         /* 6: pops the flag, back to 0 */
  op(&c, OP_HALT);              /* 9 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "loop that leaves one value per pass");
}

static void test_declared_depth(void) {
  code_t c;
  task_t task;
  unsigned i;
  printf("=== RT-003 declared stack depth ===\n");

  /* depth equal to the declared depth is accepted, one more is refused */
  c.n = 0;
  for (i = 0; i < 4U; i++)
    op8(&c, OP_PUSH8, (uint8_t)i);
  op(&c, OP_HALT);
  task.entry = 0U;
  task.stack = 4U;
  CHECK_EQ(verdict_tasks(&c, &task, 1U), ZPLC_LOADER_OK, "4 values in a declared depth of 4");
  task.stack = 3U;
  CHECK_EQ(verdict_tasks(&c, &task, 1U), ZPLC_LOADER_ERR_STACK, "4 values in a declared depth of 3");

  /* without TASK segment the limit is the runtime's ZPLC_STACK_MAX_DEPTH, and
   * the verifier follows at most ZPLC_VERIFY_MAX_DEPTH values */
  c.n = 0;
  for (i = 0; i < ZPLC_VERIFY_MAX_DEPTH; i++)
    op8(&c, OP_PUSH8, 1);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "a stack of the depth the verifier follows");
  c.n = 0;
  for (i = 0; i < ZPLC_VERIFY_MAX_DEPTH + 1U; i++)
    op8(&c, OP_PUSH8, 1);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "one value more than the verifier follows");
  c.n = 0;
  for (i = 0; i < ZPLC_STACK_MAX_DEPTH + 1U; i++)
    op8(&c, OP_PUSH8, 1);
  op(&c, OP_HALT);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "one value more than the runtime limit");

  /* the declared depth of each task applies to its own code */
  c.n = 0;
  op8(&c, OP_PUSH8, 1); /* 0: task 1, depth 1 */
  op(&c, OP_DROP);      /* 2 */
  op(&c, OP_HALT);      /* 3 */
  op8(&c, OP_PUSH8, 1); /* 4: task 2 */
  op8(&c, OP_PUSH8, 1); /* 6 */
  op8(&c, OP_PUSH8, 1); /* 8 */
  op(&c, OP_HALT);      /* 10 */
  {
    task_t two[2];
    two[0].entry = 0U;
    two[0].stack = 1U;
    two[1].entry = 4U;
    two[1].stack = 3U;
    CHECK_EQ(verdict_tasks(&c, two, 2U), ZPLC_LOADER_OK, "each task within its own declared depth");
    two[1].stack = 2U;
    CHECK_EQ(verdict_tasks(&c, two, 2U), ZPLC_LOADER_ERR_STACK, "second task above its declared depth");
  }
}

static void test_calls(void) {
  code_t c;
  printf("=== RT-003 calls ===\n");

  /* the convention of the compiler: the callee takes its arguments from the
   * stack and leaves its result there */
  c.n = 0;
  op8(&c, OP_PUSH8, 3);          /* 0 */
  op16(&c, OP_CALL, 9U);         /* 2 */
  op16(&c, OP_STORE32, 0x2000U); /* 5 */
  op(&c, OP_HALT);               /* 8 */
  op8(&c, OP_PUSH8, 5);          /* 9: f */
  op(&c, OP_ADD);                /* 11 */
  op(&c, OP_RET);                /* 12 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "call with an argument and a result");

  /* the same callee reached at two different depths */
  c.n = 0;
  op8(&c, OP_PUSH8, 3);          /* 0:  1 */
  op16(&c, OP_CALL, 15U);        /* 2:  f */
  op8(&c, OP_PUSH8, 4);          /* 5:  2 */
  op16(&c, OP_CALL, 15U);        /* 7:  f, at another depth */
  op(&c, OP_ADD);                /* 10: 1 */
  op16(&c, OP_STORE32, 0x2000U); /* 11: 0 */
  op(&c, OP_HALT);               /* 14 */
  op8(&c, OP_PUSH8, 5);          /* 15: f */
  op(&c, OP_ADD);                /* 17 */
  op(&c, OP_RET);                /* 18 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "callee reached at two depths");

  /* the callee needs more than the caller supplies */
  c.n = 0;
  op16(&c, OP_CALL, 4U); /* 0 */
  op(&c, OP_HALT);       /* 3 */
  op(&c, OP_ADD);        /* 4: f */
  op(&c, OP_RET);        /* 5 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "callee underflows the caller's stack");

  /* the callee grows the stack in a loop */
  c.n = 0;
  op16(&c, OP_CALL, 4U); /* 0 */
  op(&c, OP_HALT);       /* 3 */
  op8(&c, OP_PUSH8, 1);  /* 4: f */
  op16(&c, OP_JMP, 4U);  /* 6 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "callee that grows the stack in a loop");

  /* two returns at different depths: the caller continues with both */
  c.n = 0;
  op8(&c, OP_PUSH8, 1);  /* 0 */
  op16(&c, OP_CALL, 6U); /* 2 */
  op(&c, OP_HALT);       /* 5 */
  op8(&c, OP_PUSH8, 0);  /* 6: f */
  op16(&c, OP_JZ, 12U);  /* 8 */
  op(&c, OP_RET);        /* 11: returns one level above the entry */
  op(&c, OP_DROP);       /* 12 */
  op(&c, OP_RET);        /* 13: returns one level below the entry */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "returns at two different depths are joined");
  /* the caller of that callee cannot count on the lower of the two */
  c.n = 0;
  op8(&c, OP_PUSH8, 1);  /* 0 */
  op16(&c, OP_CALL, 7U); /* 2 */
  op(&c, OP_DROP);       /* 5: the second return leaves 0 */
  op(&c, OP_HALT);       /* 6 */
  op8(&c, OP_PUSH8, 0);  /* 7: f */
  op16(&c, OP_JZ, 13U);  /* 9 */
  op(&c, OP_RET);        /* 12 */
  op(&c, OP_DROP);       /* 13 */
  op(&c, OP_RET);        /* 14 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "drop after a callee that may return one level lower");

  /* recursion cannot be proved */
  c.n = 0;
  op16(&c, OP_CALL, 4U); /* 0 */
  op(&c, OP_HALT);       /* 3 */
  op16(&c, OP_CALL, 4U); /* 4: f calls itself */
  op(&c, OP_RET);        /* 7 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "recursive call");

  /* a call chain: main calls f, f calls g */
  c.n = 0;
  op8(&c, OP_PUSH8, 1);   /* 0 */
  op16(&c, OP_CALL, 7U);  /* 2: f */
  op(&c, OP_DROP);        /* 5 */
  op(&c, OP_HALT);        /* 6 */
  op16(&c, OP_CALL, 11U); /* 7: f calls g */
  op(&c, OP_RET);         /* 10 */
  op8(&c, OP_PUSH8, 2);   /* 11: g */
  op(&c, OP_ADD);         /* 13 */
  op(&c, OP_RET);         /* 14 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "call chain through two callees");

  /* the chain with the callees before their caller, in address order */
  c.n = 0;
  op16(&c, OP_JMP, 11U); /* 0 */
  op8(&c, OP_PUSH8, 2);  /* 3: g */
  op(&c, OP_ADD);        /* 5 */
  op(&c, OP_RET);        /* 6 */
  op16(&c, OP_CALL, 3U); /* 7: f calls g */
  op(&c, OP_RET);        /* 10 */
  op8(&c, OP_PUSH8, 1);  /* 11: main */
  op16(&c, OP_CALL, 7U); /* 13: f */
  op(&c, OP_DROP);       /* 16 */
  op(&c, OP_HALT);       /* 17 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "callees defined before the main code");

  /* The verifier goes past a call whose callee it has not summarised yet, to
   * find the rest of the subroutines the frame calls; what it concludes on the
   * way is thrown away. These rows are what that must not change. */

  /* a callee that never returns ends the path: what follows is not reached,
   * and the subroutine it calls is accepted all the same */
  c.n = 0;
  op16(&c, OP_CALL, 7U);  /* 0: f never returns */
  op16(&c, OP_CALL, 10U); /* 3: not reached */
  op(&c, OP_HALT);        /* 6 */
  op16(&c, OP_JMP, 7U);   /* 7: f loops on itself */
  op(&c, OP_RET);         /* 10: g */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "code after a callee that never returns");

  /* two subroutines that call each other */
  c.n = 0;
  op16(&c, OP_CALL, 4U); /* 0 */
  op(&c, OP_HALT);       /* 3 */
  op16(&c, OP_CALL, 8U); /* 4: f calls g */
  op(&c, OP_RET);        /* 7 */
  op16(&c, OP_CALL, 4U); /* 8: g calls f */
  op(&c, OP_RET);        /* 11 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "mutual recursion");

  /* a loop that grows the stack after a call to a subroutine defined further
   * on: found in the walk that is thrown away, reported by the one that counts */
  c.n = 0;
  op16(&c, OP_CALL, 8U); /* 0 */
  op8(&c, OP_PUSH8, 1);  /* 3 */
  op16(&c, OP_JMP, 3U);  /* 5 */
  op(&c, OP_RET);        /* 8: f */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "growing loop after a call to a later subroutine");

  /* a result that the caller drops, after a callee not summarised yet: the
   * walk that is thrown away sees a drop of nothing and must not refuse it */
  c.n = 0;
  op16(&c, OP_CALL, 5U); /* 0 */
  op(&c, OP_DROP);       /* 3 */
  op(&c, OP_HALT);       /* 4 */
  op8(&c, OP_PUSH8, 9);  /* 5: f leaves a result */
  op(&c, OP_RET);        /* 7 */
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "a result dropped after a callee summarised later");
}

/* ----------------------------------------------------------------------------
 * RT-003: the nesting of calls is verified
 * ------------------------------------------------------------------------- */

/** main calls f1 (`from_main` times), f1 calls f2 ... and f(depth) returns:
 *  `depth` calls are nested at the deepest point. */
static void nested_calls(code_t *c, unsigned depth, unsigned from_main) {
  const uint16_t first = (uint16_t)(3U * from_main + 1U);
  unsigned i;

  c->n = 0;
  for (i = 0U; i < from_main; i++)
    op16(c, OP_CALL, first);
  op(c, OP_HALT);
  for (i = 1U; i < depth; i++) {
    op16(c, OP_CALL, (uint16_t)(first + 4U * i)); /* f(i) calls f(i+1) */
    op(c, OP_RET);
  }
  op(c, OP_RET); /* f(depth) */
}

static void test_call_nesting(void) {
  code_t c;
  task_t task;
  printf("=== RT-003 the nesting of calls ===\n");

  /* the call stack of the VM takes ZPLC_CALL_STACK_MAX calls: the next one
   * faults at run time, which is what the verifier must have said before */
  nested_calls(&c, ZPLC_CALL_STACK_MAX, 1U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "calls nested to the depth of the call stack are accepted");
  CHECK_EQ(run_raw(&c), OK, "and run to the end");
  nested_calls(&c, ZPLC_CALL_STACK_MAX + 1U, 1U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_ERR_STACK, "one call more than the call stack takes is refused");
  CHECK_EQ(run_raw(&c), ZPLC_VM_CALL_OVERFLOW, "and the VM would fault with CALL_OVERFLOW (the premise of the check)");

  /* the same for the code of a task, which starts with an empty call stack */
  task.entry = 0U;
  task.stack = 8U;
  nested_calls(&c, ZPLC_CALL_STACK_MAX, 1U);
  CHECK_EQ(verdict_tasks(&c, &task, 1U), ZPLC_LOADER_OK, "a task may nest calls to the same depth");
  nested_calls(&c, ZPLC_CALL_STACK_MAX + 1U, 1U);
  CHECK_EQ(verdict_tasks(&c, &task, 1U), ZPLC_LOADER_ERR_STACK, "and not one more");

  /* it is the longest path that counts, not the number of calls */
  nested_calls(&c, ZPLC_CALL_STACK_MAX, 3U);
  CHECK_EQ(verdict(&c), ZPLC_LOADER_OK, "the same chain called three times is as deep as once");
  CHECK_EQ(run_raw(&c), OK, "and runs");
}

/* ----------------------------------------------------------------------------
 * RT-003: the work of the verifier is bounded by the size of the CODE
 * ------------------------------------------------------------------------- */

/* Test hooks of the loader (zplc_test_hooks.h): what the last zplc_loader_verify() was charged, in the units of
 * ZPLC_VERIFY_STEPS_PER_BYTE, and, counted apart from the charge, the iterations its loops made. */

static uint32_t last_limit, last_work;
static uint8_t big_code[ZPLC_MEM_CODE_SIZE];
static uint8_t big_file[ZPLC_MEM_CODE_SIZE + 128U];

static void big_jump(size_t at, uint8_t opcode, size_t target) {
  big_code[at] = opcode;
  big_code[at + 1U] = (uint8_t)target;
  big_code[at + 2U] = (uint8_t)(target >> 8);
}

/** Verify big_code[0..size) and report what it cost; returns the loader code. */
static int verify_big(const char *name, size_t size, size_t entry) {
  zplc_program_view_t view;
  size_t length = build_bytes(big_file, big_code, size, (uint16_t)entry, NULL, 0U);
  const uint32_t limit = (uint32_t)ZPLC_VERIFY_STEPS_PER_BYTE * (uint32_t)size + 4096U;
  int rc = zplc_loader_verify(big_file, length, workspace, sizeof workspace, &view);
  const uint32_t work = zplc_test_verify_work();
  const uint32_t iterations = zplc_test_verify_iterations();

  printf("    %s: %lu units of %lu, %lu iterations\n", name, (unsigned long)work, (unsigned long)limit, (unsigned long)iterations);
  /* what the verifier is charged stays within the bound (it may finish the
   * table pass it is in), and every iteration of every loop was charged */
  CHECK(work < limit + 1024U, name);
  CHECK((uint64_t)iterations <= 8U * (uint64_t)work, name);
  last_limit = limit;
  last_work = work;
  return rc;
}

static void test_verifier_work_is_bounded(void) {
  /* A chain of jumps to the block just below: every hop goes to a lower
   * address. The lowest block pushes a value and jumps to the highest, so the
   * stack grows by one per lap and the verifier would lap 127 times before it
   * refuses. */
  enum { BLOCKS = 2500, SPACING = 18 };
  size_t i, size = (size_t)BLOCKS * SPACING + 1U;
  int rc;
  printf("=== RT-003 the work of the verifier is bounded ===\n");

  memset(big_code, OP_NOP, sizeof big_code);
  for (i = 1U; i < BLOCKS; i++)
    big_jump(i * SPACING, OP_JMP, (i - 1U) * SPACING);
  big_code[0] = OP_PUSH8;
  big_code[1] = 0U;
  big_jump(2U, OP_JMP, (size_t)(BLOCKS - 1U) * SPACING);
  big_code[size - 1U] = OP_HALT;
  rc = verify_big("2500 descending hops, 127 laps", size, (size_t)(BLOCKS - 1U) * SPACING);
  CHECK_EQ(rc, ZPLC_LOADER_ERR_STACK, "a chain of descending jumps that grows the stack is refused");

  /* The same chain reached from 150 subroutines (each jumps to its top and
   * the bottom returns): 150 walks of 2400 hops. A pass over the code is made
   * for every hop, which costs what it costs, and the work bound is reached. */
  {
    enum { CHAIN = 2400, CALLEES = 150, STEP = 16 };
    const size_t callees = (size_t)CHAIN * STEP;
    const size_t main_at = callees + (size_t)CALLEES * 3U;
    size_t n = main_at;

    memset(big_code, OP_NOP, sizeof big_code);
    big_code[0] = OP_RET;
    for (i = 1U; i < CHAIN; i++)
      big_jump(i * STEP, OP_JMP, (i - 1U) * STEP);
    for (i = 0U; i < CALLEES; i++) {
      big_jump(callees + i * 3U, OP_JMP, (size_t)(CHAIN - 1U) * STEP);
      big_jump(n, OP_CALL, callees + i * 3U);
      n += 3U;
    }
    big_code[n++] = OP_HALT;
    rc = verify_big("2400 hops from 150 subroutines", n, main_at);
    CHECK_EQ(rc, ZPLC_LOADER_ERR_STACK, "a chain walked by 150 subroutines is refused within the bound");
  }
}

static void test_verifier_work_of_wide_programs(void) {
  /* 380 subroutines (almost all the verifier tracks), each called 36 times
   * from the main code in turn: a program of the largest size with very many
   * small functions. It is accepted, with room to spare in the work bound. */
  enum { CALLEES = 380, ROUNDS = 36 };
  size_t i, n = 0U, main_at = (size_t)CALLEES * 4U;
  int rc;

  memset(big_code, OP_NOP, sizeof big_code);
  for (i = 0U; i < CALLEES; i++) {
    big_code[i * 4U] = OP_PUSH8;
    big_code[i * 4U + 1U] = 1U;
    big_code[i * 4U + 2U] = OP_DROP;
    big_code[i * 4U + 3U] = OP_RET;
  }
  n = main_at;
  for (i = 0U; i < (size_t)CALLEES * ROUNDS; i++) {
    big_jump(n, OP_CALL, (i % CALLEES) * 4U);
    n += 3U;
  }
  big_code[n++] = OP_HALT;
  rc = verify_big("380 subroutines called 36 times each", n, main_at);
  CHECK_EQ(rc, ZPLC_LOADER_OK, "380 subroutines called many times are accepted");
  CHECK(last_work <= last_limit / 2U, "with room to spare in the work bound");
}

/* ----------------------------------------------------------------------------
 * RT-003 premise: the stack effects of the contract table are what the VM does
 * ------------------------------------------------------------------------- */

/** Run one instruction at `depth` values on the stack (every one 0x2000, an
 *  address in work memory) with the declared limit `limit`. */
static int step_at(uint8_t opcode, uint8_t operand, uint32_t depth, uint16_t limit, uint16_t *sp_after) {
  uint8_t code[8];
  zplc_vm_t vm;
  uint32_t i, operands = zplc_opcode_operand_size(opcode);
  int rc;

  memset(code, 0, sizeof code);
  code[0] = opcode;
  if (operands == 1U) {
    code[1] = operand;
  } else if (operands == 2U) {
    code[1] = 0x00; /* 0x2000: a valid address, and a jump target in range */
    code[2] = 0x20;
    if (opcode >= OP_JMP && opcode <= OP_CALL) {
      code[1] = 0x00; /* jump to 0 */
      code[2] = 0x00;
    }
  } else if (operands == 4U) {
    code[1] = (uint8_t)ZPLC_COMM_FB_MB_READ_HREG;
  }
  zplc_core_init();
  zplc_vm_init(&vm);
  CHECK(zplc_test_mem_load_code(code, 1U + operands, 0U) == 0, "load one instruction");
  zplc_vm_set_entry(&vm, 0U, 1U + operands);
  vm.stack_limit = limit;
  for (i = 0U; i < depth; i++)
    vm.stack[i] = 0x2000U;
  vm.sp = (uint16_t)depth;
  rc = zplc_vm_step(&vm);
  *sp_after = vm.sp;
  return rc;
}

static void test_stack_effect_table_is_what_the_vm_does(void) {
  static const struct {
    uint8_t opcode;
    uint8_t pops, pushes, min_depth;
  } table[] = {
#define ZPLC_TEST_ROW(name, number, operand, pops, pushes, min) {number, pops, pushes, min},
      ZPLC_OPCODE_TABLE(ZPLC_TEST_ROW)
#undef ZPLC_TEST_ROW
  };
  size_t i;
  unsigned checked = 0;
  printf("=== RT-003 stack effects of the table against the VM ===\n");

  for (i = 0U; i < sizeof table / sizeof table[0]; i++) {
    const uint8_t opcode = table[i].opcode;
    uint16_t sp;
    int rc;
    char name[64];

    /* instructions that stop or leave the code are not single stepped */
    if (opcode == OP_HALT || opcode == OP_BREAK || opcode == OP_RET)
      continue;

    snprintf(name, sizeof name, "opcode 0x%02X depth after one step", opcode);
    rc = step_at(opcode, 0U, table[i].min_depth, 16U, &sp);
    CHECK_EQ(rc, ZPLC_VM_OK, name);
    CHECK_EQ(sp, table[i].min_depth - table[i].pops + table[i].pushes, name);

    if (table[i].min_depth > 0U) {
      snprintf(name, sizeof name, "opcode 0x%02X underflows one value short", opcode);
      rc = step_at(opcode, 0U, table[i].min_depth - 1U, 16U, &sp);
      CHECK_EQ(rc, ZPLC_VM_STACK_UNDERFLOW, name);
    }
    if (table[i].pushes > table[i].pops) {
      const unsigned net = table[i].pushes - table[i].pops;
      snprintf(name, sizeof name, "opcode 0x%02X fills the declared depth exactly", opcode);
      rc = step_at(opcode, 0U, (uint32_t)(8U - net), 8U, &sp);
      CHECK_EQ(rc, ZPLC_VM_OK, name);
      snprintf(name, sizeof name, "opcode 0x%02X overflows one value over", opcode);
      rc = step_at(opcode, 0U, (uint32_t)(8U - net + 1U), 8U, &sp);
      CHECK_EQ(rc, ZPLC_VM_STACK_OVERFLOW, name);
    }
    checked++;
  }
  CHECK(checked > 60U, "most of the instruction set was stepped");

  /* PICK n needs n + 1 values: the table value is the least it needs */
  {
    uint16_t sp;
    CHECK_EQ(step_at(OP_PICK, 3U, 4U, 16U, &sp), ZPLC_VM_OK, "PICK 3 with four values");
    CHECK_EQ(step_at(OP_PICK, 3U, 3U, 16U, &sp), ZPLC_VM_STACK_UNDERFLOW, "PICK 3 with three values");
  }
}

int main(void) {
  printf("=== ZPLC sandbox closure tests ===\n");
  test_indirect_access();
  test_direct_access_at_the_vm();
  test_region_windows();
  test_string_operations();
  test_strcmp_extents();
  test_comm_opcodes();
  test_comm_opcodes_raw();
  test_region_ends();
  test_handler_gets_a_block_that_fits();
  test_loader_block_fit();
  test_stack_underflow();
  test_wide_stack_effects();
  test_stack_paths();
  test_declared_depth();
  test_calls();
  test_call_nesting();
  test_verifier_work_is_bounded();
  test_verifier_work_of_wide_programs();
  test_stack_effect_table_is_what_the_vm_does();
  printf("\n%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
