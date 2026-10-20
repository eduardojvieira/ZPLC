/**
 * @file zplc_freertos_suite_main.c
 * @brief Runs a port conformance suite inside a FreeRTOS task.
 *
 * SPDX-License-Identifier: MIT
 *
 * The C suites of firmware/lib/zplc_core/tests each have a main(). On this port that main is renamed
 * (main=zplc_suite_main, as tools/wasm-core/suites.ts and firmware/tests/core_suites rename it for the other
 * ports) and called from a task, after the kernel has started: so the clock the suite reads is the tick of the
 * kernel, its sleeps block a task, and its locks are kernel semaphores. The process exits with the suite's result.
 */

#include <FreeRTOS.h>
#include <task.h>

#include <stdio.h>
#include <stdlib.h>

/* The suites take no argument, except test_opcode_coverage, which takes (argc, argv) and ignores them. */
extern int zplc_suite_main(int argc, char **argv);

/* The simulator gives a task the stack of a pthread (8 MiB by default): this only sizes the kernel's bookkeeping. */
#define ZPLC_SUITE_STACK_WORDS ((configSTACK_DEPTH_TYPE)8192)

static void suite_task(void *arg)
{
    char name[] = "zplc-suite";
    char *argv[] = {name, NULL};
    int code;

    (void)arg;
    (void)printf("ZPLC FreeRTOS port: FreeRTOS-Kernel %s, tick %u Hz, running in task \"%s\"\n", tskKERNEL_VERSION_NUMBER,
                 (unsigned)configTICK_RATE_HZ, pcTaskGetName(NULL));
    code = zplc_suite_main(1, argv);
    (void)fflush(stdout);
    (void)fflush(stderr);
    exit(code);
}

int main(void)
{
    if (xTaskCreate(suite_task, "suite", ZPLC_SUITE_STACK_WORDS, NULL, tskIDLE_PRIORITY + 2U, NULL) != pdPASS) {
        (void)fprintf(stderr, "FreeRTOS: the suite task could not be created\n");
        return 2;
    }
    vTaskStartScheduler();
    (void)fprintf(stderr, "FreeRTOS: the scheduler returned\n");
    return 2;
}
