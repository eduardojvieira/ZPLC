# Deployment and Runtime Sessions

Build firmware, flash firmware, deploy a PLC program, and run/debug are four
separate operations. They are never initiated by AI or MCP.

## Quick path

1. Compile, test, and simulate the intended program.
2. Select the exact board profile and connect the matching runtime.
3. Inspect handshake, ABI, board/profile, payload hash, size, and task count.
4. A person confirms deploy; inspect the stopped state before any RUN action.

## Operations

| Operation | Meaning | Authority |
| --- | --- | --- |
| Build runtime firmware | Produces Zephyr firmware artifacts. | Human workflow. |
| Flash runtime firmware | Writes firmware/boot chain to a device. | Human workflow; profile procedure required. |
| Deploy PLC program | Transfers a verified `.zplc` artifact to a compatible runtime. | Human confirmation with artifact evidence. |
| Run / debug | Observes or changes operational state. | Human workflow and site procedure. |

## Evidence boundary

The native POSIX adapter is a host simulation. Serial connection and a
cross-build board profile do not turn it into HIL. Current catalogued profiles
have zero HIL evidence references; use their exact Zephyr procedure and record
an HIL run before claiming target behavior.

## On a failed connection or deploy

Do not retry blindly. Re-inspect the selected board/profile and runtime ABI,
then use [Recovery Boundaries](../operations/recovery.md). The program deploy
flow is not firmware recovery and does not replace the board-specific runner
