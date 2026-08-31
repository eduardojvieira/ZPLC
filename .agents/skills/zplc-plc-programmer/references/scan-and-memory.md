# Scan, memory, and persistence limits

The current scheduler contract is in `docs/docs/runtime/scheduler.md`. A due
batch takes one input snapshot, orders tasks by release time, priority, then
task ID, executes due tasks, and has at most one normal output commit. Lower
numeric priority runs first. These are logical/runtime semantics, not WCET,
jitter, deadline, electrical, or target timing evidence.

Use the five logical regions from `docs/docs/runtime/memory-model.md`: IPI,
OPI, WORK, RETAIN, and CODE. VM registers and stacks are private per VM while
process images and shared memory are shared. Define output ownership and
safe/off behavior before editing logic.

`docs/docs/runtime/persistence.md` states that source `RETAIN` declarations
are rejected. Do not use RETAIN for recovery-critical source state. The
`WATCHDOG_RESET` standard-library function is a NOP compatibility stub; task
watchdog metadata is not an applied watchdog policy.
