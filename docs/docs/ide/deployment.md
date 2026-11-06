# Deployment and Runtime Sessions

Use this page to put a program on a device safely, and to read what the ZPLC application tells you about the device it is attached to. Building the firmware, flashing it, deploying a program and running or debugging are four separate operations. A person starts each one. No assistant or MCP tool initiates any of them.

## The short path

1. Compile, test and simulate the program you mean to deploy.
2. Pick the exact board profile and connect the runtime that matches it.
3. Open the deploy dialog and read the comparison: board, firmware, ABI, program hash, size and task count.
4. Confirm the deploy yourself. The PLC stays stopped afterwards, so check its state before you press Run.

## The four operations

| Operation              | What it does                                                   | Who starts it                                 |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Build runtime firmware | Produces the Zephyr firmware images.                           | A person.                                     |
| Flash runtime firmware | Writes the firmware and boot chain to a device.                | A person, with the procedure of the profile.  |
| Deploy PLC program     | Sends a verified `.zplc` artifact to a compatible runtime.     | A person, who confirms with the artifact data. |
| Run / debug            | Observes the device or changes its operating state.            | A person, with the site procedure.            |

## What ZPLC is attached to

The status bar under the toolbar always says what ZPLC is attached to, with words, an icon and a colour. The colour is never the only signal.

| Indicator                     | Icon and colour       | Meaning                                                                                                                              |
| ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Not connected                 | Unplugged, grey       | Nothing is running.                                                                                                                  |
| Simulation · native runtime   | Monitor, blue         | The program runs in the native simulator on this computer.                                                                           |
| Simulation · software runtime | Globe, blue           | The program runs in the software runtime (WebAssembly), which is degraded. The bar lists what it lacks.                              |
| Connecting to hardware        | Spinner, amber        | ZPLC is opening the link to a device.                                                                                                |
| Real hardware · board · link  | Chip, amber           | ZPLC is attached to a real device. The board is the one the device reported, and the link is the framed link or the older text shell. |
| Hardware fault · board        | Warning triangle, red | The attached device reports a fault.                                                                                                 |

An amber banner stays under the indicator while forces are active. A red alert replaces it when a force cannot be confirmed: reconnect and verify before you operate.

## The deploy dialog

Every deploy goes through one dialog, whether you start it from the toolbar, the menu, the command palette or the keyboard. Nothing sends a program to a device without it.

The dialog compares the project with the device, row by row:

| Row                     | What is compared                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Board and board profile | The board the project builds for and the board the device reports.                                                                            |
| Firmware version        | The firmware the device reports. The project does not pin one.                                                                                |
| ABI version             | The bytecode version and the contract draft of the program and of the device.                                                                 |
| Program                 | The name and the SHA-256 of the program. The device does not report which program it holds, so that cell reads "Not reported by the device". |
| Size                    | The program size and the largest program the device accepts, when it says so.                                                                 |
| Tasks                   | The number of tasks of the program and the number the device supports.                                                                        |

Each row has a verdict in words and an icon: Matches, Does not match, Not reported or Not compared. A row that does not match is highlighted, and a sentence under the table says what is wrong and what to do. A device that does not match cannot be confirmed. The dialog is then called "Deploy blocked", nothing is sent, and its only button is Close.

The dialog also states what the outputs do. The firmware keeps every output at its safe value while the old program stops, the new one is written and the PLC stays stopped. The safe value is off, unless the project declares another value for that output, which the dialog then lists. Host and simulator tests check this. ZPLC does not measure the pins of a board, and only a hardware-in-the-loop record does.

The action button is named by its effect: **Stop PLC and deploy** when the PLC is running or paused, and **Deploy** when it is stopped. Focus starts on Cancel, so Enter or Space does not confirm by accident, and Escape cancels. Run is a separate action after the deploy.

## Alert dialogs

Every destructive or physical action is confirmed in an alert dialog. Its action button names the action, Cancel has the initial focus, Escape cancels, and neither a click outside the dialog nor a stray key dismisses it. The dialog appears for:

- deleting a file or a folder, discarding unsaved changes, and closing a project or a window with unsaved changes;
- on a real device only: Stop, Reset, forcing a variable, changing a forced value, releasing a force and releasing all forces. A simulation is not asked, because nothing physical is at stake.

Run, pause and step are not confirmed, because they are your own explicit action. ZPLC never flashes a board, so there is no flash dialog.

## Evidence boundary

The native POSIX adapter is a host simulation. A serial connection and a cross-build board profile do not turn it into hardware-in-the-loop evidence. The catalogued profiles have zero HIL evidence references today. Use the exact Zephyr procedure of the board, and record an HIL run before you claim behaviour on the target. See [Hardware support](../reference/capabilities-evidence.md) and [Safety and limitations](../safety-and-limitations.md).

No firmware build of ZPLC on macOS or Windows is recorded yet.

## When a connection or a deploy fails

Do not retry blindly. Inspect the selected board profile and the runtime ABI again, then follow [Recovery boundaries](../operations/recovery.md). A program deploy is not firmware recovery and does not replace the runner procedure of the board.
