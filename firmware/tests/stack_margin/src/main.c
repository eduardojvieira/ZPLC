/*
 * How much of the stacks of the scan the scan uses (WS-42).
 *
 * The coordinator that runs the tasks of the scheduler and the work queue that saves RETAIN run on two work queue
 * threads with a stack of their own (CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE, CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE).
 * Link-time optimization merges the frames of what it inlines into the caller, so what a scan takes of the stack is
 * a property of the build: this suite runs a program with several tasks for many scans, with a pause at a breakpoint
 * and a resume in between, and reads from each stack what is still unused. The result is printed, and the suite
 * fails when less than a quarter of a stack is left.
 *
 * It is a measurement on the Cortex-M3 of QEMU, with the GPIO emulator under the scan. It does not include what a
 * board's drivers add (a flash write under the RETAIN save, the GPIO driver of the part) nor interrupts nested on
 * the stack of the thread, which only a board shows.
 */
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include <zplc_hal.h>
#include <zplc_isa.h>
#include <zplc_scheduler.h>

#define SCANS_MS 400U

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t length) {
  for (size_t i = 0U; i < length; i++) {
    crc ^= data[i];
    for (unsigned bit = 0U; bit < 8U; bit++) {
      crc = (crc & 1U) != 0U ? (crc >> 1) ^ 0xEDB88320U : crc >> 1;
    }
  }
  return crc;
}

static void put_u16(uint8_t *d, uint16_t v) {
  d[0] = (uint8_t)v;
  d[1] = (uint8_t)(v >> 8);
}

static void put_u32(uint8_t *d, uint32_t v) {
  put_u16(d, (uint16_t)v);
  put_u16(d + 2U, (uint16_t)(v >> 16));
}

/* Three cyclic tasks of 5, 7 and 11 ms: each stores a byte in the output image and halts. */
static size_t build_program(uint8_t *out) {
  const size_t code_size = 3U * 6U;
  const size_t task_bytes = 3U * ZPLC_TASK_DEF_SIZE;
  const size_t header = ZPLC_FILE_HEADER_SIZE + 2U * ZPLC_SEGMENT_ENTRY_SIZE;
  const size_t total = header + code_size + task_bytes;
  const uint32_t intervals_us[3] = {5000U, 7000U, 11000U};
  uint8_t *code = out + header;
  uint8_t *tasks = code + code_size;
  uint32_t crc;

  memset(out, 0, total);
  memcpy(out, "ZPLC", 4U);
  put_u16(out + 4U, ZPLC_VERSION_MAJOR);
  put_u16(out + 6U, ZPLC_VERSION_MINOR);
  put_u32(out + 28U, ZPLC_DRAFT_COUNTER);
  put_u32(out + 16U, (uint32_t)code_size);
  put_u32(out + 20U, (uint32_t)task_bytes);
  put_u16(out + 26U, 2U);
  put_u16(out + 32U, ZPLC_SEG_CODE);
  put_u32(out + 36U, (uint32_t)code_size);
  put_u16(out + 40U, ZPLC_SEG_TASK);
  put_u32(out + 44U, (uint32_t)task_bytes);
  for (unsigned i = 0U; i < 3U; i++) {
    uint8_t *c = code + i * 6U;
    uint8_t *t = tasks + i * ZPLC_TASK_DEF_SIZE;

    c[0] = OP_PUSH8;
    c[1] = (uint8_t)(0x10U + i);
    c[2] = OP_STORE8;
    put_u16(c + 3U, (uint16_t)(ZPLC_MEM_OPI_BASE + i));
    c[5] = OP_HALT;
    put_u16(t, (uint16_t)i);
    t[2] = ZPLC_TASK_CYCLIC;
    t[3] = (uint8_t)i;
    put_u32(t + 4U, intervals_us[i]);
    put_u16(t + 8U, (uint16_t)(i * 6U));
    put_u16(t + 10U, 64U);
  }
  crc = crc32_update(0xFFFFFFFFU, out, 12U);
  crc = crc32_update(crc, out + 16U, total - 16U) ^ 0xFFFFFFFFU;
  put_u32(out + 12U, crc);
  return total;
}

struct stack_probe {
  int priority;
  size_t size;
  size_t unused;
  int found;
};

static void inspect(const struct k_thread *thread, void *user) {
  struct stack_probe *probe = user;
  size_t unused = 0U;

  if (k_thread_priority_get((k_tid_t)thread) != probe->priority || thread->stack_info.size < probe->size) {
    return;
  }
  if (k_thread_stack_space_get(thread, &unused) == 0) {
    probe->size = thread->stack_info.size;
    probe->unused = unused;
    probe->found = 1;
  }
}

static struct stack_probe measure(int priority, size_t configured) {
  struct stack_probe probe = {.priority = priority, .size = configured, .unused = 0U, .found = 0};

  k_thread_foreach_unlocked(inspect, &probe);
  return probe;
}

ZTEST(stack_margin, test_the_scan_leaves_a_quarter_of_its_stacks_free) {
  static uint8_t program[256];
  const size_t size = build_program(program);
  struct stack_probe fast;
  struct stack_probe normal;
  zplc_sched_stats_t stats;

  zassert_equal(zplc_hal_init(), ZPLC_HAL_OK, "HAL");
  zassert_ok(zplc_sched_init(), "scheduler");
  zassert_true(zplc_sched_load(program, size) > 0, "the program loads");
  zassert_ok(zplc_sched_start(), "start");
  k_msleep(SCANS_MS / 2U);
  zassert_ok(zplc_sched_stop(), "stop");
  k_msleep(10);
  zassert_ok(zplc_sched_start(), "start again");
  k_msleep(SCANS_MS / 2U);
  zassert_ok(zplc_sched_get_stats(&stats), "stats");
  zassert_true(stats.total_cycles > 40U, "the scan ran many times (%u)", (unsigned)stats.total_cycles);

  fast = measure(CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY, CONFIG_ZPLC_SCHED_HIGH_PRIO_STACK_SIZE);
  normal = measure(CONFIG_ZPLC_SCHED_WORKQ_PRIORITY, CONFIG_ZPLC_SCHED_WORKQ_STACK_SIZE);
  zassert_true(fast.found, "the coordinator thread is found");
  zassert_true(normal.found, "the work queue thread is found");
  printk("STACK coordinator: %u of %u bytes used, %u free\n", (unsigned)(fast.size - fast.unused), (unsigned)fast.size,
         (unsigned)fast.unused);
  printk("STACK normal work queue: %u of %u bytes used, %u free\n", (unsigned)(normal.size - normal.unused), (unsigned)normal.size,
         (unsigned)normal.unused);
  zassert_true(fast.unused >= fast.size / 4U, "the coordinator stack has %u of %u bytes free", (unsigned)fast.unused, (unsigned)fast.size);
  zassert_true(normal.unused >= normal.size / 4U, "the work queue stack has %u of %u bytes free", (unsigned)normal.unused,
               (unsigned)normal.size);
}

ZTEST_SUITE(stack_margin, NULL, NULL, NULL, NULL, NULL);
