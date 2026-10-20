/**
 * @file FreeRTOSConfig.h
 * @brief FreeRTOS kernel configuration of the ZPLC FreeRTOS port (the POSIX/GCC simulator build).
 *
 * SPDX-License-Identifier: MIT
 *
 * The values a ZPLC port needs of the kernel, and nothing else:
 *
 *   - a 1 kHz tick, so that the millisecond clock of the HAL (zplc_hal_tick) has the resolution of one tick and the
 *     intervals of the tasks are whole ticks;
 *   - preemption, mutexes and software timers (the release of a task is a timer; the scan runs in a task);
 *   - dynamic allocation only, from the heap of the C library (heap_3);
 *   - task notifications, which wake the scheduler task from a timer callback.
 *
 * The simulator is not a real-time system. On the POSIX/GCC port each FreeRTOS task is a pthread, the tick is a
 * signal of a Linux timer, and the host kernel schedules the threads, so a tick can be late by the scheduling latency
 * of the machine. The suites bound what they measure accordingly (docs/docs/runtime/port-interface.md). A board port
 * replaces this file with the configuration of its own kernel port; the HAL and the scheduler adapter use only the
 * public API of the kernel named here.
 */

#ifndef ZPLC_FREERTOS_CONFIG_H
#define ZPLC_FREERTOS_CONFIG_H

#include <assert.h>

#define configUSE_PREEMPTION 1
#define configUSE_TIME_SLICING 1
#define configUSE_PORT_OPTIMISED_TASK_SELECTION 0
#define configUSE_IDLE_HOOK 0
#define configUSE_TICK_HOOK 0
#define configUSE_MALLOC_FAILED_HOOK 0
#define configCHECK_FOR_STACK_OVERFLOW 0

#define configTICK_RATE_HZ ((TickType_t)1000)
#define configTICK_TYPE_WIDTH_IN_BITS TICK_TYPE_WIDTH_32_BITS
#define configMAX_PRIORITIES 7
/* The stack of a task on the simulator is the pthread's own; this only sizes the bookkeeping the kernel keeps. */
#define configMINIMAL_STACK_SIZE ((unsigned short)4096)
#define configMAX_TASK_NAME_LEN 16
#define configIDLE_SHOULD_YIELD 1

#define configSUPPORT_DYNAMIC_ALLOCATION 1
#define configSUPPORT_STATIC_ALLOCATION 0
/* heap_3 wraps malloc(); the figure is for ports that select heap_4. */
#define configTOTAL_HEAP_SIZE ((size_t)(4U * 1024U * 1024U))

#define configUSE_MUTEXES 1
#define configUSE_RECURSIVE_MUTEXES 0
#define configUSE_COUNTING_SEMAPHORES 1
#define configUSE_TASK_NOTIFICATIONS 1
#define configUSE_QUEUE_SETS 0
#define configUSE_TRACE_FACILITY 0
#define configQUEUE_REGISTRY_SIZE 0

#define configUSE_TIMERS 1
#define configTIMER_TASK_PRIORITY (configMAX_PRIORITIES - 1)
#define configTIMER_QUEUE_LENGTH 32
#define configTIMER_TASK_STACK_DEPTH configMINIMAL_STACK_SIZE

#define configUSE_CO_ROUTINES 0
#define configGENERATE_RUN_TIME_STATS 0

/* A failed assertion of the kernel is a fault of the port: stop, do not continue on a corrupt kernel. */
#define configASSERT(x) assert(x)

#define INCLUDE_vTaskPrioritySet 1
#define INCLUDE_uxTaskPriorityGet 1
#define INCLUDE_vTaskDelete 1
#define INCLUDE_vTaskSuspend 1
#define INCLUDE_vTaskDelay 1
#define INCLUDE_vTaskDelayUntil 1
#define INCLUDE_xTaskGetCurrentTaskHandle 1
#define INCLUDE_xTaskGetSchedulerState 1
#define INCLUDE_xTimerPendFunctionCall 0

#endif /* ZPLC_FREERTOS_CONFIG_H */
