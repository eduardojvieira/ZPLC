# ZPLC Engineering Constitution

This constitution is normative for changes in this repository.

**Governance version**: 1.0
**Ratified**: 2026-08-21

1. Keep the runtime core ANSI C99 and route hardware access through the HAL. Do
   not bypass the HAL from the VM, desktop tooling, or language frontend.
2. Make behavioral changes testable. Use proportional TDD: add or strengthen a
   focused regression before changing risky behavior, then run the relevant
   host, target, or HIL checks.
3. Treat bytecode loading, persistence, IPC, filesystem access, device control,
   and external input as trust boundaries. Validate before mutation and retain
   diagnostic evidence.
4. Outputs default to a documented safe/off state. A reboot, timeout, fault,
   watchdog failure, communication loss, or invalid artifact must not cause an
   unsafe automatic resume.
5. Keep build firmware, flash firmware, deploy PLC program, and run/debug as
   separate operations with separate evidence. Every physical operation requires
   explicit human authorization.
6. Electron is deny-by-default: sandboxed renderer, narrow preload API,
   validated IPC sender and schema, and no generic shell or filesystem access.
7. Capability and evidence claims are tiered. Host, QEMU, target build, HIL,
   and manual evidence are different levels; a lower level never proves a
   higher one.
8. Keep English and Spanish public documentation in parity. Do not add a
   dependency without a concrete need and architectural justification.
9. AI and MCP may inspect, plan, compile, test, and simulate within approved
   workspace boundaries. They must not flash, deploy to hardware, force I/O,
   change RUN/STOP, access raw serial, or invoke a shell.
