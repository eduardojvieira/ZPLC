/**
 * @file zplc_config_check.h
 * @brief Build-time checks of the configuration (RT-029).
 *
 * SPDX-License-Identifier: MIT
 *
 * Every size, depth and priority the build can set has a range, and the values that depend on each other are
 * checked against each other, so that an invalid combination stops the build with a name that says what is wrong.
 * The checks are plain C99 (a typedef of an array whose length is -1 when the condition is false), they include
 * no Zephyr header and are evaluated by every host build and by every Zephyr build, because zplc_core.c includes
 * this file.
 *
 * The ranges of the Kconfig symbols are in firmware/zephyr/Kconfig; the limits below are what the core's own types
 * can hold, which a Kconfig range may narrow and never widen. test_config_check in firmware/lib/zplc_core/tests
 * builds each rule with a value that breaks it and expects the build to fail with the rule's name.
 */

#ifndef ZPLC_CONFIG_CHECK_H
#define ZPLC_CONFIG_CHECK_H

#include "zplc_isa.h"
#include "zplc_loader.h"
#include "zplc_scheduler.h"

/* The name of a failed rule is the name of the typedef the compiler complains about. */
#define ZPLC_CONFIG_RULE(name, condition) typedef char zplc_config_rule_##name[(condition) ? 1 : -1]

/* ---------------------------------------------------------------------------
 * Memory regions
 * ---------------------------------------------------------------------------
 */

/* A program counter, a jump target and a task entry point are 16 bits wide: the code region has to end inside the
 * 64 KB address space. */
ZPLC_CONFIG_RULE(code_region_ends_inside_the_16_bit_address_space,
                 (unsigned long)ZPLC_MEM_CODE_BASE + (unsigned long)ZPLC_MEM_CODE_SIZE <= 0x10000UL);

/* An artifact is at most as large as the code region (RT-028), so the region has to hold the container header and
 * a short program. */
ZPLC_CONFIG_RULE(code_region_holds_a_container_header_and_a_program,
                 (unsigned long)ZPLC_MEM_CODE_SIZE >= (unsigned long)ZPLC_FILE_HEADER_SIZE + 32UL);

ZPLC_CONFIG_RULE(work_region_has_at_least_16_bytes, (unsigned long)ZPLC_MEM_WORK_SIZE >= 16UL);

ZPLC_CONFIG_RULE(retain_region_has_at_least_16_bytes, (unsigned long)ZPLC_MEM_RETAIN_SIZE >= 16UL);

/* ---------------------------------------------------------------------------
 * Virtual machine
 * ---------------------------------------------------------------------------
 */

/* The stack pointer is a uint16_t. */
ZPLC_CONFIG_RULE(evaluation_stack_depth_is_between_4_and_65535, ZPLC_STACK_MAX_DEPTH >= 4 && ZPLC_STACK_MAX_DEPTH <= 65535);

/* The call depth is a uint8_t. */
ZPLC_CONFIG_RULE(call_stack_depth_is_between_1_and_255, ZPLC_CALL_STACK_MAX >= 1 && ZPLC_CALL_STACK_MAX <= 255);

/* The breakpoint count is a uint8_t. */
ZPLC_CONFIG_RULE(breakpoint_count_is_between_1_and_255, ZPLC_MAX_BREAKPOINTS >= 1 && ZPLC_MAX_BREAKPOINTS <= 255);

/* The tag count is a uint16_t. */
ZPLC_CONFIG_RULE(tag_count_is_between_1_and_65535, ZPLC_MAX_TAGS >= 1 && ZPLC_MAX_TAGS <= 65535);

/* The verifier of the loader finds at most ZPLC_LOADER_MAX_TASKS tasks in an artifact; a scheduler with more task
 * slots than that would never use them. */
ZPLC_CONFIG_RULE(task_slots_do_not_exceed_what_the_loader_admits,
                 ZPLC_MAX_TASKS >= 1 && (unsigned long)ZPLC_MAX_TASKS <= (unsigned long)ZPLC_LOADER_MAX_TASKS);

/* ---------------------------------------------------------------------------
 * Scheduler threads (Zephyr; the symbols exist only there)
 * ---------------------------------------------------------------------------
 *
 * A Zephyr priority is a number and a lower number runs first. The scan coordinator is the high-priority work
 * queue when there is one and the normal queue otherwise (RT-013).
 */

#ifdef CONFIG_ZPLC_SCHEDULER

#ifdef CONFIG_ZPLC_SCHED_HIGH_PRIO_WORKQ
ZPLC_CONFIG_RULE(high_priority_queue_outranks_the_normal_queue, CONFIG_ZPLC_SCHED_HIGH_PRIO_PRIORITY < CONFIG_ZPLC_SCHED_WORKQ_PRIORITY);
#endif

/* Every thread of the application that talks to the outside (MQTT, Modbus server and clients, the function-block
 * workers) is created at CONFIG_ZPLC_COMM_THREAD_PRIORITY, a preemptible priority. The scan must outrank it. */
#ifdef CONFIG_ZPLC_COMM_THREAD_PRIORITY
ZPLC_CONFIG_RULE(scan_coordinator_outranks_every_communication_thread, ZPLC_SCAN_COORDINATOR_PRIORITY < CONFIG_ZPLC_COMM_THREAD_PRIORITY);
#endif

/* The shell and the log processing thread run at the lowest application priority unless the build overrides them. */
#ifdef CONFIG_SHELL_THREAD_PRIORITY_OVERRIDE
ZPLC_CONFIG_RULE(scan_coordinator_outranks_the_shell_thread, ZPLC_SCAN_COORDINATOR_PRIORITY < CONFIG_SHELL_THREAD_PRIORITY);
#endif

#ifdef CONFIG_LOG_PROCESS_THREAD_CUSTOM_PRIORITY
ZPLC_CONFIG_RULE(scan_coordinator_outranks_the_log_thread, ZPLC_SCAN_COORDINATOR_PRIORITY < CONFIG_LOG_PROCESS_THREAD_PRIORITY);
#endif

#endif /* CONFIG_ZPLC_SCHEDULER */

#endif /* ZPLC_CONFIG_CHECK_H */
