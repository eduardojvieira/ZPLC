---
slug: /guides/force-values
id: force-values
title: Force a value
sidebar_label: Force values
description: "Hold an input or a variable at a value while a program runs, see what a force does and what clears it."
tags: [how-to, debugging, force, simulation]
---

# Force a value

A force holds a variable at a value that you choose, whatever the program assigns
to it. Use it in the simulator to test a branch of the logic without a scenario,
and to see what the program does when an input has a value that is hard to make.

:::warning A force on a machine
In the simulator a force is harmless. On a controller that is connected to a plant
a force can start a motor: it needs a person with the authority to do it and a site
procedure for it. AI assistants and the MCP server cannot force a value
([AI, privacy and human review](../ide/ai-privacy.md)).
:::

## In the simulator

1. Build the project, choose **Simulate**, press **Connect** and then **Run**.
2. Open the **Watch** tab and add the variable: press **+** and enter its name.
3. Tick **Force** in the row of the variable. The status of the panel says
   `1 active force`.
4. Double-click the **Value** cell of the row, type the value and press Enter. The
   program reads the forced value from the next scan on.
5. Untick **Force** to release the variable.

In the **Simulation inputs** panel at the top of the Watch tab, every input that the
running program declares has a switch (**Set TRUE** and **Set FALSE**) or a number
box with **Set**. **Force** there holds the input at its present value, and **Set**
then changes the forced value. In the simulator an input that you forced keeps its
last forced value when you release the force, until you set it again.

## What a force does

| Action | Forces |
| --- | --- |
| The program assigns the variable | The forced value wins |
| A Modbus, MQTT or cloud message writes the variable | The forced value stays |
| Pause, step and resume | Kept |
| Stop | Cleared, and the output image is zeroed |
| A fault of the runtime | Cleared, as with Stop |
| Load of a new program | Cleared: a load is a cold start |

A force carries the types of up to 32 bits. Releasing it hands the variable back to
the program. [Pause, resume, step and stop](../runtime/scheduler.md#pause-resume-step-and-stop)
has the full table, with the tests behind it, including what a forced output does
at the first commit after a resume.

## On a controller

Forces on a connected board are made from the Watch table by a person, and the
device shell has the same operations for a person at the console:

```bash
zplc dbg force list
zplc dbg force set <addr> <hexbytes>
zplc dbg force clear <addr>
zplc dbg force clear_all
```

`zplc dbg force set` holds an address at the bytes you give, in hexadecimal, and
overrides the program's own assignments. `zplc stop` clears the force table. Do not
leave a force on a controller that nobody is watching.

## What is verified, and what is not

| Part | Verified | Level |
| --- | --- | --- |
| A force holds a value against the program and against an outside write | C and Zephyr tests, and a journey in the real application | Host and `native_sim` |
| Forces are kept by pause and step, and cleared by stop and by a fault | Tests of the scheduler | Host and `native_sim`, QEMU |
| An input of a program can be set or forced by its own name | Journey 37 in the real application | Host |
| The effect of a force on a physical pin | Not tested | None |

## See also

- [Studio workbench](../ide/features.md#simulation-inputs): the simulation inputs and the debugging boundary.
- [The ZPLC shell](../operations/shell.md): every debugging command.
- [Safety and limitations](../safety-and-limitations.md).
