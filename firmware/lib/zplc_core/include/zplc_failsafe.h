/**
 * @file zplc_failsafe.h
 * @brief Fail-safe decisions that do not depend on a platform: the reset cause, the record of a fault that
 *        survives a reset, the watchdog policy of a profile and the timeout the task set needs (RT-019, RT-020,
 *        RT-021, RT-022).
 *
 * SPDX-License-Identifier: MIT
 *
 * What the platform does (reading the reset-cause register, keeping a record in RAM that a reset does not clear,
 * rebooting, driving the pins and feeding the hardware watchdog) lives in the adapter: for the firmware,
 * src/hal/zephyr/zplc_failsafe_zephyr.c. What it means lives here, so that a host test can state it:
 *
 *   - a reset has one cause out of seven, and when a processor reports several bits the order in which they are
 *     read is fixed (a pin reset flag is set by almost every reset, so it comes last);
 *   - a fault the firmware handled leaves a record, with a checksum, that the next boot finds, reports and
 *     consumes; a record that is not whole, or is not ours, is nothing;
 *   - the runtime never enters RUN because of a reset, whatever its cause (decision D-13, option A);
 *   - a profile says what its hardware watchdog does in STOP, while paused and in a latched fault.
 */

#ifndef ZPLC_FAILSAFE_H
#define ZPLC_FAILSAFE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ============================================================================
 * Reset cause (RT-021)
 * ============================================================================
 */

/** @brief Why the processor was reset. */
typedef enum {
  ZPLC_RESET_UNKNOWN = 0, /**< the part does not report a cause, or reports none that is understood */
  ZPLC_RESET_POWER_ON,    /**< power was applied */
  ZPLC_RESET_BROWN_OUT,   /**< the supply dropped below the brown-out threshold */
  ZPLC_RESET_PIN,         /**< the reset pin was driven */
  ZPLC_RESET_SOFTWARE,    /**< software asked for the reset (a reboot command) */
  ZPLC_RESET_WATCHDOG,    /**< the hardware watchdog expired */
  ZPLC_RESET_FAULT        /**< the firmware handled a processor fault, a stack overflow or a kernel panic */
} zplc_reset_cause_t;

/** @brief The name the status reports: power_on, brown_out, pin, software, watchdog, fault or unknown. */
const char *zplc_reset_cause_name(zplc_reset_cause_t cause);

/** @brief What a processor can report, in neutral bits; the adapter translates its register to these. */
#define ZPLC_RESET_BIT_POWER_ON (1UL << 0)
#define ZPLC_RESET_BIT_BROWN_OUT (1UL << 1)
#define ZPLC_RESET_BIT_PIN (1UL << 2)
#define ZPLC_RESET_BIT_SOFTWARE (1UL << 3)
#define ZPLC_RESET_BIT_WATCHDOG (1UL << 4)
#define ZPLC_RESET_BIT_LOCKUP (1UL << 5) /**< the core locked up: a fault no handler could take */

/**
 * @brief The neutral bits of the RP2040 WATCHDOG REASON register (0x40058008): TIMER (bit 0) or FORCE (bit 1) is
 *        ZPLC_RESET_BIT_WATCHDOG. Zephyr's hwinfo reports a watchdog reset on the RP2350 only (HIL-010.24).
 */
uint32_t zplc_reset_bits_from_rp2040_watchdog_reason(uint32_t reason);

/* ============================================================================
 * The record of a fault (RT-019)
 * ============================================================================
 */

/** @brief What kind of fault a record holds. */
typedef enum {
  ZPLC_FAULT_NONE = 0,
  ZPLC_FAULT_PROCESSOR = 1, /**< a processor fault, stack overflow or kernel panic: the firmware rebooted */
  ZPLC_FAULT_SCHEDULER = 2  /**< the scheduler latched a fault (a deadline, the VM): the watchdog resets */
} zplc_fault_kind_t;

#define ZPLC_FAULT_RECORD_MAGIC 0x5A504C46UL /* "ZPLF" */
#define ZPLC_FAULT_RECORD_VERSION 1U

/** @brief The record that survives a reset: in RAM the reset does not clear. 24 bytes. */
typedef struct zplc_fault_record {
  uint32_t magic;
  uint16_t version;
  uint8_t kind;     /**< zplc_fault_kind_t */
  uint8_t reason;   /**< a processor fault: the kernel's fatal-error reason; a scheduler fault: zplc_sched_fault_reason_t */
  uint16_t task_id; /**< the task a scheduler fault belongs to */
  uint16_t reserved;
  uint32_t pc;       /**< the program counter of the faulting instruction, when the processor gave it */
  uint32_t sequence; /**< records written since the RAM was last initialised */
  uint32_t crc;      /**< CRC-32 of the bytes above */
} zplc_fault_record_t;

/**
 * @brief Fill a record. The checksum is computed; nothing else is touched.
 */
void zplc_fault_record_make(zplc_fault_record_t *record, zplc_fault_kind_t kind, uint8_t reason, uint16_t task_id, uint32_t pc,
                            uint32_t sequence);

/** @brief 1 when the record is whole, is ours and names a kind; 0 for RAM that holds anything else. */
int zplc_fault_record_valid(const zplc_fault_record_t *record);

/** @brief The name of the reason of a record: a scheduler reason by name, a kernel reason by number. */
void zplc_fault_record_reason_text(const zplc_fault_record_t *record, char *out, size_t size);

/**
 * @brief The cause of a reset, from what the processor reported and the record the previous run left.
 *
 * A valid processor-fault record is a fault reset: the firmware rebooted the part itself. Otherwise the neutral
 * bits are read in this order: watchdog, power-on, brown-out, lockup (a fault), software, pin. The watchdog
 * comes first because a part whose power-on flag outlives a later reset (the RP2040) would hide it, and its
 * watchdog flag is cleared by any power-on; power-on comes before the rest because it sets most of the others as
 * well; the pin comes last because a software or watchdog reset drives the reset line and sets it. A scheduler-fault record does
 * not change the cause: the part was reset by
 * its watchdog, and the record is reported next to it.
 */
zplc_reset_cause_t zplc_reset_cause_decide(uint32_t bits, const zplc_fault_record_t *record);

/* ============================================================================
 * Start policy (RT-022, decision D-13 option A)
 * ============================================================================
 */

/**
 * @brief Whether the runtime may enter RUN on its own after a reset of this cause.
 *
 * Never: whatever the cause, the stored program is restored into STOP with the outputs at their safe values and
 * RUN waits for a person's command. This is a function so that the rule has one place, a test that runs it over
 * every cause, and the point where option B (a clean power-on of a device a person enabled beforehand) would
 * be written if the owner chooses it.
 */
int zplc_reset_may_run(zplc_reset_cause_t cause);

/* ============================================================================
 * Hardware watchdog policy of a profile (RT-020)
 * ============================================================================
 */

/** @brief What the profile's watchdog does while the runtime is in a state. */
typedef enum {
  ZPLC_WDT_DISARM = 0,    /**< stop the watchdog (the hardware can) */
  ZPLC_WDT_FEED = 1,      /**< keep it fed from the control path, so that the wait does not reset the board */
  ZPLC_WDT_LET_EXPIRE = 2 /**< leave it armed and unfed: it resets the board (a latched fault) */
} zplc_wdt_action_t;

/** @brief The runtime states a policy covers. */
typedef enum {
  ZPLC_WDT_STATE_STOP = 0,   /**< stopped, with or without a program */
  ZPLC_WDT_STATE_PAUSED = 1, /**< paused, at a breakpoint or stepping */
  ZPLC_WDT_STATE_FAULT = 2   /**< a fault is latched */
} zplc_wdt_state_t;

typedef struct {
  uint8_t stop;  /**< ZPLC_WDT_DISARM or ZPLC_WDT_FEED */
  uint8_t pause; /**< ZPLC_WDT_DISARM or ZPLC_WDT_FEED */
  uint8_t fault; /**< ZPLC_WDT_DISARM or ZPLC_WDT_LET_EXPIRE */
} zplc_wdt_policy_t;

/**
 * @brief The design default of RT-020: disarm in STOP, keep a pause or a breakpoint fed so that a long one does
 *        not reset the board, and in a latched fault stay armed and unfed so that the board resets into STOP
 *        with the cause recorded. A profile states another policy when its hardware needs one (a watchdog that
 *        cannot be stopped feeds in STOP).
 */
zplc_wdt_policy_t zplc_wdt_policy_default(void);

/** @brief What to do with the watchdog in @p state under @p policy. Out-of-range values are the safe choice. */
zplc_wdt_action_t zplc_wdt_action(const zplc_wdt_policy_t *policy, zplc_wdt_state_t state);

/**
 * @brief The timeout the hardware watchdog is armed with for a task set.
 *
 * It has to be longer than two intervals of the slowest task (a scan that is one interval late is not yet a
 * reset), and is never shorter than the profile's timeout, the one its reset timing was recorded at.
 *
 * @param profile_ms          the profile's timeout
 * @param hardware_max_ms     the longest timeout the part can be given
 * @param longest_interval_us the interval of the slowest task
 * @return the timeout in milliseconds, or 0 when the task set does not fit the hardware: the program is refused
 */
uint32_t zplc_wdt_timeout_for(uint32_t profile_ms, uint32_t hardware_max_ms, uint32_t longest_interval_us);

/**
 * @brief The hold value of one stage of an Espressif main-system watchdog for @p timeout_ms: its tick is 500 us
 *        (80 MHz APB divided by 40000), so two ticks to the millisecond.
 * @return the ticks, or 0 for no timeout or one the 32-bit register cannot hold
 */
uint32_t zplc_wdt_mwdt_ticks_for(uint32_t timeout_ms);

/* ============================================================================
 * The adapter: what a platform provides
 * ============================================================================
 *
 * The firmware implements these in src/hal/zephyr/zplc_failsafe_zephyr.c: the reset-cause register through
 * hwinfo, a record in no-init RAM, the fatal-error handler of the kernel and the reboot. A host build has no
 * reset cause to read and does not provide them.
 */

/** @brief What the previous run and the reset left, read once at boot. */
typedef struct {
  zplc_reset_cause_t cause;
  uint32_t raw_bits;       /**< what the part reported, in the platform's own bits */
  uint32_t supported_bits; /**< what the part can report; 0 when it cannot say */
  uint8_t reported;        /**< the part answered when asked for a cause */
  uint8_t has_fault;       /**< a valid record was found: fault is the fault of the previous run */
  zplc_fault_record_t fault;
} zplc_reset_report_t;

/**
 * @brief Read the reset cause and find the record of the previous run's fault. Once per boot, before the
 *        scheduler starts. The record is consumed: a second boot does not see it again.
 */
void zplc_failsafe_boot(void);

/** @brief What zplc_failsafe_boot() found; all zero (cause unknown) before it ran. */
const zplc_reset_report_t *zplc_failsafe_report(void);

/**
 * @brief The scheduler latched a fault: keep it in the RAM a reset does not clear, so that a watchdog reset that
 *        follows does not erase it (RT-020).
 */
void zplc_failsafe_note_scheduler_fault(uint8_t reason, uint16_t task_id);

/**
 * @brief The body of the fatal-error handler (RT-019): drive the outputs to their safe state, keep the reason so
 *        that it survives the reset, and reboot. The handler of the kernel calls it; a test calls it with a
 *        reboot it intercepts.
 *
 * It takes no lock and allocates nothing: it runs in a fault.
 */
void zplc_failsafe_fatal(unsigned int reason, uint32_t pc);

#ifdef __cplusplus
}
#endif

#endif /* ZPLC_FAILSAFE_H */
