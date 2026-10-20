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

## What Studio is connected to

The status bar under the toolbar always says what Studio is attached to, with words, an icon and a colour. The colour is never the only signal.

| Indicator | Icon and colour | Meaning |
| --- | --- | --- |
| Not connected | Unplugged, grey | Nothing is running. |
| Simulation · native runtime | Monitor, blue | The program runs in the native simulator on this computer. |
| Simulation · browser runtime | Globe, blue | The program runs in the browser runtime, which is degraded; the bar lists what it lacks. |
| Connecting to hardware | Spinner, amber | Studio is opening the link to a device. |
| Real hardware · board · link | Chip, amber | Studio is attached to a real device. The board is the one the device reported, and the link is the framed link or the older text shell. |
| Hardware fault · board | Warning triangle, red | The attached device reports a fault. |

An amber banner stays under the indicator while forces are active, and a red alert replaces it when a force cannot be confirmed (reconnect and verify before operating).

## The deploy dialog

Deploying to a device always goes through one dialog, whether you start it from the toolbar, the menu, the command palette or the keyboard. Nothing sends a program to a device without it, and no assistant or MCP tool can start it.

The dialog compares the project with the device, row by row:

| Row | What is compared |
| --- | --- |
| Board and board profile | The board the project builds for and the board the device reports. |
| Firmware version | The firmware the device reports. The project does not pin one. |
| ABI version | The bytecode version and the contract draft of the program and of the device. |
| Program | The name and the SHA-256 of the program. The device does not report which program it holds, so that cell reads "Not reported by the device". |
| Size | The program size and the largest program the device accepts, when it says so. |
| Tasks | The number of tasks of the program and the number the device supports. |

Every row has a verdict in words and an icon: Matches, Does not match, Not reported or Not compared. A row that does not match is highlighted and a sentence under the table says what is wrong and what to do. A device that does not match cannot be confirmed: the dialog is then called "Deploy blocked", nothing is sent, and its only button is Close.

The dialog also states what the outputs do. The firmware keeps every output at its safe value while the old program stops, the new one is written and the PLC stays stopped: off, unless the project declares another value for that output, which the dialog then lists. Host and simulator tests check this; Studio does not measure the pins of a board, and only a hardware-in-the-loop record does.

The action button is named by its effect: **Stop PLC and deploy** when the PLC is running or paused, and **Deploy** when it is stopped. Focus starts on Cancel, so pressing Enter or Space does not confirm by accident, and Escape cancels. The PLC stays stopped after a deploy; Run is a separate action.

## Alert dialogs

Every destructive or physical action is confirmed in an alert dialog. Its action button names the action, Cancel has the initial focus, Escape cancels, and neither a click outside the dialog nor a stray key dismisses it.

- Deleting a file or a folder, discarding unsaved changes, and closing a project or a window with unsaved changes.
- On a real device only: Stop, Reset, forcing a variable, changing a forced value, releasing a force and releasing all forces. A simulation is not asked, because nothing physical is at stake.

Run, pause and step are not confirmed: they are your own explicit action. Studio never flashes a board, so there is no flash dialog.

## Evidence boundary

The native POSIX adapter is a host simulation. Serial connection and a
cross-build board profile do not turn it into HIL. Current catalogued profiles
have zero HIL evidence references; use their exact Zephyr procedure and record
an HIL run before claiming target behavior. See
[Hardware support](../reference/capabilities-evidence.md) and
[Safety and limitations](../safety-and-limitations.md).

No firmware build from Studio on macOS or Windows is recorded yet.

## On a failed connection or deploy

Do not retry blindly. Re-inspect the selected board/profile and runtime ABI,
then use [Recovery Boundaries](../operations/recovery.md). The program deploy
flow is not firmware recovery and does not replace the board-specific runner
procedure.
