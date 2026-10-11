# Native POSIX scenarios and evidence

Scenario parsing and execution are defined in
`packages/zplc-ide/src/test-engine/index.ts`. Schema version 1 accepts exact
temporal kinds `AT`, `WITHIN`, `FOR`, `EVENTUALLY`, `ALWAYS`, `NEVER`, `UNTIL`,
`RISING`, and `FALLING`. Events write BOOL IPI signals; conditions read BOOL
OPI signals. Align all event and assertion times to `tickMs`.

The Tool API in `packages/zplc-ide/src/cli/toolApi.ts` runs scenarios on
`native-posix` in `logical-cyclic-task-set-scan` mode. It accepts a workspace
of 1 to 16 cyclic tasks that run one program each, with intervals from 1 to
3 600 000 ms; the step of a scenario is the greatest common divisor of the intervals.
Any other task set is rejected. Use
`test <workspace>` for all scenarios or `scenario-run <workspace> <scenario-id>`
for one through an authorized typed ZPLC adapter; these are operation names,
not instructions to invoke a shell. Inspect the trace artifact and assertion
outcomes.

Native POSIX is deterministic host-side logical evidence only. It does not
prove target scheduling, HIL, physical I/O, WCET, jitter, electrical safety,
or the behavior of a board profile.
