---
slug: /guides/force-values
id: force-values
title: Force a value
sidebar_label: Force values
description: 'Hold an input or a variable at a value while a program runs, see what a force does and what clears it.'
tags: [how-to, debugging, force, simulation]
---

# Force a value

A force holds a variable at a value you choose, whatever the program assigns to it. Use it in the simulator to test a branch of the logic without writing a scenario, and to see how the program reacts to an input that is hard to produce.

:::danger Forcing is a human action
In the simulator a force is harmless. On a controller that is connected to a plant, a force can start a motor. It needs a person with the authority to do it and a site procedure for it.

AI assistants and the MCP server never force a value, on a simulator or on a device (AGENTS.md rule 7). A force always starts from a person's click or a person's command at the console. See [AI, privacy and human review](../ide/ai-privacy.md).
:::

## In the simulator

1. Build the project, choose **Simulate**, press **Connect**, then **Run**.
2. Open the **Watch** tab, press **+** and type the variable name.
3. Tick **Force** in the variable's row. The panel status says `1 active force`.
4. Double-click the **Value** cell, type the value and press Enter. The program reads the forced value from the next cycle on.
5. Untick **Force** to give the variable back to the program.

![The Watch table with one forced variable and the 1 active force status](/img/screens/guide-force.png)

The **Live I/O** panel at the top of the Watch tab lists every input the running program declares. Each has a switch (**Set TRUE** and **Set FALSE**) or a number box with **Set**. **Force** there holds the input at its present value, and **Set** then changes the forced value. In the simulator, an input you forced keeps its last forced value after you release the force, until you set it again.

## What a force does

| Event | Forces |
| --- | --- |
| The program assigns the variable | The forced value wins |
| A Modbus, MQTT or cloud message writes the variable | The forced value stays |
| Pause, step and resume | Kept |
| Stop | Cleared, and the output image is zeroed |
| A fault of the runtime | Cleared, as with Stop |
| Load of a new program | Cleared: a load is a cold start |
| A scenario test | Refused while a force is active: release it first |

A force carries the types of up to 32 bits. [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop) has the full table and its tests, including what a forced output does at the first commit after a resume.

## On a controller

On a connected board, a person forces from the Watch table. A person at the device console has the same operations in the shell:

```bash
zplc dbg force list
zplc dbg force set <addr> <hexbytes>
zplc dbg force clear <addr>
zplc dbg force clear_all
```

`zplc dbg force set` holds an address at the bytes you give, in hexadecimal, and overrides the program's own assignments. `zplc stop` clears the force table. Never leave a force on a controller that nobody is watching.

A force always belongs to a session. A force typed at the console opens the session of the console's link, or joins the one the ZPLC application holds on it, and it ends with that session:

- when the session is closed or taken over;
- after the idle time (`CONFIG_ZPLC_PROTO_SESSION_IDLE_S`, 30 s by default; another force command counts as activity);
- at once when the link is lost.

On a USB CDC ACM console (the Raspberry Pi Pico) the device sees the link go when DTR falls, which happens when the computer closes the port or the cable is pulled. A console that reports no line (the ESP32-S3 USB-Serial/JTAG port, a plain UART) is released by the idle time. While another link holds the session, the force is refused. A released force gives each byte the value the program last gave it, or the value it had before the force if the program never wrote it, so the outputs follow the program.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| A force holds a value against the program and against an outside write | C and Zephyr tests, and a journey in the real application | Host and `native_sim` |
| Forces are kept by pause and step, and cleared by stop and by a fault | Tests of the scheduler | Host, `native_sim` and QEMU |
| A console force ends with its session: close, takeover, idle time, a falling line; the output follows the program | Engine and core tests; the device-link test of the real image (DTR cannot be lowered there) | Host and `native_sim` |
| DTR on the Pico's USB port ends the session | Not run on a board | None |
| An input of a program can be set or forced by its own name | Journey 37 in the real application | Host |
| The effect of a force on a physical pin | Not tested | None |

## See also

- [ZPLC workbench](../ide/features.md#live-io): the live I/O faceplate and the debugging boundary.
- [The ZPLC shell](../operations/shell.md): every debugging command.
- [Safety and limitations](../safety-and-limitations.md).
