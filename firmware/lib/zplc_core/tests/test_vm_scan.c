/**
 * @file test_vm_scan.c
 * @brief What a scan sees and what it costs: time is latched once per scan, and the instruction budget charges
 *        the data an opcode processes (RT-006, RT-D11b, RT-D11c).
 *
 * SPDX-License-Identifier: MIT
 *
 * Time. The tick opcode read the clock on every call, so two reads of one scan could differ and a program could
 * compute a negative or a doubled elapsed time. A scan now latches the time once, when it starts: a breakpoint in
 * the middle lets time pass (the host clock override is changed there) and the rest of the scan still sees the
 * time the scan started at.
 *
 * Cost. The budget counted instructions, so one string opcode that copied 255 bytes cost as much as a NOP and a
 * loop of them ran for as long as a hundred thousand copies. The budget now charges the bytes: one unit for each
 * instruction, and one more for every ZPLC_VM_BYTES_PER_BUDGET_UNIT bytes a string opcode copies or compares.
 */

#include <stdio.h>
#include <string.h>

#include <zplc_core.h>
#include <zplc_hal_posix.h>
#include <zplc_isa.h>
#include <zplc_test_hooks.h>

static int test_count = 0;
static int fail_count = 0;

#define CHECK(cond, msg)                                      \
  do {                                                        \
    test_count++;                                             \
    if (!(cond)) {                                            \
      fprintf(stderr, "FAIL: %s (line %d)\n", msg, __LINE__); \
      fail_count++;                                           \
    } else {                                                  \
      printf("PASS: %s\n", msg);                              \
    }                                                         \
  } while (0)

static size_t emit_u16(uint8_t *code, size_t n, uint8_t opcode, uint16_t operand) {
  code[n++] = opcode;
  code[n++] = (uint8_t)operand;
  code[n++] = (uint8_t)(operand >> 8);
  return n;
}

static uint32_t work32(uint16_t offset) {
  const uint8_t *work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);

  return (uint32_t)work[offset] | ((uint32_t)work[offset + 1U] << 8) | ((uint32_t)work[offset + 2U] << 16) |
         ((uint32_t)work[offset + 3U] << 24);
}

/* ----------------------------------------------------------------------------
 * RT-006: time is latched once per scan
 * ----------------------------------------------------------------------------
 */

/* GET_TICKS; STORE32 WORK[0]; BREAK; GET_TICKS; STORE32 WORK[4]; HALT: two readings of the clock in one scan, with
 * a place where the test can let time pass. */
static void load_time_program(void) {
  uint8_t code[32];
  size_t n = 0U;

  code[n++] = OP_GET_TICKS;
  n = emit_u16(code, n, OP_STORE32, ZPLC_MEM_WORK_BASE);
  code[n++] = OP_BREAK;
  code[n++] = OP_GET_TICKS;
  n = emit_u16(code, n, OP_STORE32, ZPLC_MEM_WORK_BASE + 4U);
  code[n++] = OP_HALT;
  zplc_core_init();
  CHECK(zplc_test_load_raw(code, n) == 0, "the time program is loaded");
}

static void test_time_is_latched_once_per_scan(void) {
  zplc_vm_t *vm;

  printf("\n=== Test: time is latched once per scan (RT-006, RT-D11b) ===\n");
  load_time_program();
  vm = zplc_core_get_default_vm();

  zplc_hal_posix_set_tick_override(100U);
  CHECK(zplc_core_run_cycle() >= 0 && zplc_vm_is_paused(vm) != 0, "the scan runs to its breakpoint");
  CHECK(work32(0U) == 100U, "the first reading is the time the scan started at");

  zplc_hal_posix_set_tick_override(200U); /* time passes while the scan is stopped */
  CHECK(zplc_vm_resume(vm) == 0 && zplc_core_run_cycle() >= 0 && zplc_vm_is_halted(vm) != 0, "the scan is resumed and ends");
  CHECK(work32(4U) == 100U, "the second reading of the same scan is the same time, not the clock");

  zplc_hal_posix_set_tick_override(300U);
  CHECK(zplc_core_run_cycle() >= 0 && zplc_vm_is_paused(vm) != 0, "the next scan runs to its breakpoint");
  CHECK(work32(0U) == 300U, "and latches the time it started at");
  zplc_hal_posix_clear_tick_override();
}

static void test_a_scheduler_can_give_the_time_of_the_scan(void) {
  zplc_vm_t *vm;

  printf("\n=== Test: the scheduler gives the time of the next scan, once ===\n");
  load_time_program();
  vm = zplc_core_get_default_vm();

  zplc_hal_posix_set_tick_override(400U);
  zplc_vm_set_scan_time(vm, 777U);
  CHECK(zplc_core_run_cycle() >= 0 && work32(0U) == 777U, "the scan sees the time it was given, not the clock");
  CHECK(zplc_vm_resume(vm) == 0 && zplc_core_run_cycle() >= 0 && work32(4U) == 777U, "and its rest sees it too");
  zplc_hal_posix_set_tick_override(500U);
  CHECK(zplc_core_run_cycle() >= 0 && work32(0U) == 500U, "the next scan latches the clock again");
  zplc_hal_posix_clear_tick_override();
}

static void test_outside_a_scan_the_clock_is_read(void) {
  zplc_vm_t *vm;
  uint8_t code[4];

  printf("\n=== Test: a debugger stepping outside a scan reads the clock ===\n");
  zplc_core_init();
  code[0] = OP_GET_TICKS;
  code[1] = OP_GET_TICKS;
  code[2] = OP_HALT;
  CHECK(zplc_test_load_raw(code, 3U) == 0, "a program of two readings is loaded");
  vm = zplc_core_get_default_vm();
  zplc_hal_posix_set_tick_override(600U);
  CHECK(zplc_vm_step(vm) == ZPLC_VM_OK && zplc_vm_get_stack(vm, 0U) == 600U, "a step reads the clock");
  zplc_hal_posix_set_tick_override(650U);
  CHECK(zplc_vm_step(vm) == ZPLC_VM_OK && zplc_vm_get_stack(vm, 1U) == 650U, "the next step reads it again");
  zplc_hal_posix_clear_tick_override();
}

/* ----------------------------------------------------------------------------
 * RT-006: the budget charges the data an opcode processes
 * ----------------------------------------------------------------------------
 */

#define SRC 0x0100U /* WORK offsets of two STRING[255]s and a counter */
#define DST 0x0300U
#define COUNTER 0x0000U

static void set_string(uint16_t offset, uint16_t length) {
  uint8_t *work = zplc_mem_get_region(ZPLC_MEM_WORK_BASE);
  uint16_t i;

  work[offset] = (uint8_t)length;
  work[offset + 1U] = (uint8_t)(length >> 8);
  work[offset + 2U] = 255U;
  work[offset + 3U] = 0U;
  for (i = 0U; i < length; i++) {
    work[offset + 4U + i] = (uint8_t)('a' + (i % 26U));
  }
  work[offset + 4U + length] = 0U;
}

/* loop: COUNTER := COUNTER + 1; <string opcode over SRC and DST>; JMP loop. Returns the counter after the budget
 * ended the scan, and the units a lap costs through *lap_units. */
static uint32_t run_string_loop(uint8_t opcode, uint16_t length, uint32_t *lap_units, int *result) {
  uint8_t code[48];
  size_t n = 0U;
  size_t lap_instructions;

  zplc_core_init();
  n = emit_u16(code, n, OP_LOAD16, ZPLC_MEM_WORK_BASE + COUNTER);
  code[n++] = OP_PUSH8;
  code[n++] = 1U;
  code[n++] = OP_ADD;
  n = emit_u16(code, n, OP_STORE16, ZPLC_MEM_WORK_BASE + COUNTER);
  n = emit_u16(code, n, OP_PUSH16, ZPLC_MEM_WORK_BASE + SRC);
  n = emit_u16(code, n, OP_PUSH16, ZPLC_MEM_WORK_BASE + DST);
  code[n++] = opcode;
  if (opcode == OP_STRCMP) {
    code[n++] = OP_DROP; /* the result of the comparison */
  }
  n = emit_u16(code, n, OP_JMP, 0U);
  lap_instructions = opcode == OP_STRCMP ? 9U : 8U;
  if (zplc_test_load_raw(code, n) != 0) {
    return 0U;
  }
  set_string(SRC, length);
  set_string(DST, length);
  *result = zplc_core_run_cycle();
  *lap_units = (uint32_t)lap_instructions + (uint32_t)length / ZPLC_VM_BYTES_PER_BUDGET_UNIT;
  return work32(COUNTER) & 0xFFFFU;
}

static void test_string_opcodes_are_charged_by_their_bytes(void) {
  uint32_t lap = 0U;
  uint32_t laps;
  int result = 0;
  uint32_t instructions_only;

  printf("\n=== Test: the budget charges the bytes a string opcode processes (RT-006, RT-D11c) ===\n");

  laps = run_string_loop(OP_STRCPY, 200U, &lap, &result);
  CHECK(result == -ZPLC_VM_WATCHDOG, "a loop of STRCPY ends in the budget fault");
  CHECK(lap == 8U + 50U, "a lap of the loop is seven instructions and a 200 byte copy of 51 units");
  /* The fault is at the first instruction that reaches the budget: laps of `lap` units until it, and the counter
   * is bumped at the start of each lap. */
  CHECK(laps >= ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / lap && laps <= ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / lap + 2U,
        "the scan ended after the laps the units allow, not after the laps the instruction count allows");
  instructions_only = ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / 8U;
  CHECK(laps * 3U < instructions_only, "which is a fraction of what counting instructions allowed");

  laps = run_string_loop(OP_STRCAT, 0U, &lap, &result);
  CHECK(result == -ZPLC_VM_WATCHDOG, "a loop of STRCAT of nothing ends in the budget fault");
  CHECK(laps >= ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / lap - 1U && laps <= ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / lap + 2U,
        "an empty string costs the instruction alone");

  laps = run_string_loop(OP_STRCMP, 240U, &lap, &result);
  CHECK(result == -ZPLC_VM_WATCHDOG, "a loop of STRCMP of equal strings ends in the budget fault");
  CHECK(laps >= ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / lap && laps <= ZPLC_VM_CYCLE_INSTRUCTION_BUDGET / lap + 2U,
        "a comparison is charged by the characters it compared");
}

static void test_a_scan_that_pauses_keeps_its_spent_units(void) {
  uint8_t code[32];
  size_t n = 0U;
  zplc_vm_t *vm;
  uint32_t spent;

  printf("\n=== Test: the units a paused scan spent stay counted ===\n");
  zplc_core_init();
  n = emit_u16(code, n, OP_PUSH16, ZPLC_MEM_WORK_BASE + SRC);
  n = emit_u16(code, n, OP_PUSH16, ZPLC_MEM_WORK_BASE + DST);
  code[n++] = OP_STRCPY;
  code[n++] = OP_BREAK;
  code[n++] = OP_HALT;
  CHECK(zplc_test_load_raw(code, n) == 0, "a program that copies 100 bytes and stops is loaded");
  set_string(SRC, 100U);
  set_string(DST, 100U);
  vm = zplc_core_get_default_vm();
  CHECK(zplc_core_run_cycle() >= 0 && zplc_vm_is_paused(vm) != 0, "it stops at its breakpoint");
  spent = vm->scan_instructions;
  CHECK(spent == 2U + 1U + 100U / ZPLC_VM_BYTES_PER_BUDGET_UNIT, "two pushes and a copy of 26 units were spent");
}

int main(void) {
  printf("==== test_vm_scan ====\n");
  test_time_is_latched_once_per_scan();
  test_a_scheduler_can_give_the_time_of_the_scan();
  test_outside_a_scan_the_clock_is_read();
  test_string_opcodes_are_charged_by_their_bytes();
  test_a_scan_that_pauses_keeps_its_spent_units();
  printf("\n%d checks, %d failed\n", test_count, fail_count);
  return fail_count == 0 ? 0 : 1;
}
