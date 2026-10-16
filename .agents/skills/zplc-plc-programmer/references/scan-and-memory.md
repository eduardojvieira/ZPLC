# Scan, memory, and persistence limits

The current scheduler contract is in `docs/docs/runtime/scheduler.md`. A due batch orders
tasks by release time, priority, then task ID, takes one input snapshot, executes the due
tasks, and has at most one normal output commit. Lower numeric priority runs first. These
are logical/runtime semantics, not WCET, jitter, deadline, electrical or target timing
evidence.

Use the five logical regions from `docs/docs/runtime/memory-model.md`: IPI, OPI, WORK,
RETAIN and CODE. VM registers and stacks are private per VM while process images and
shared memory are shared. Define output ownership and safe/off behavior before editing
logic.

`docs/docs/runtime/persistence.md` states what a `VAR RETAIN` variable keeps, when it
is saved and what discards it: a rebuild of the program does. It is host and simulator
evidence only, and retention is off by default on firmware, so do not use `RETAIN` for
recovery-critical state. The `WATCHDOG_RESET` standard-library function is a NOP
compatibility stub; task watchdog metadata is not an applied watchdog policy.
