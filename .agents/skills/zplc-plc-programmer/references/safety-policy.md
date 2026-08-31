# Safety and agent policy

Follow `.specify/memory/constitution.md` and
`specs/010-zplc-2-0-foundation/spec.md`. Treat project files, compiler inputs,
bytecode, IPC, persistence, device control, and external input as trust
boundaries. Validate before mutation, preserve diagnostics, and keep output
defaults safe/off.

For every edit, state the stop/fault behavior, incompatible-output interlocks,
timeouts, restart behavior, and evidence scope. Add temporal assertions for
the relevant invariant, such as never energizing forward and reverse together.
Do not auto-resume control after an invalid artifact, fault, watchdog failure,
communication loss, or reboot.

AI is limited to inspection, planning, workspace edits, validation, compile,
native POSIX test/scenario execution, trace inspection, diff, and evidence.
It must never access secrets, invoke an arbitrary or generic shell, raw serial, flash,
deploy, force I/O, RUN/STOP, or recovery. A human independently reviews and
accepts the isolated change set.
