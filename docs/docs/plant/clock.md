---
title: 'The plant clock'
sidebar_label: 'The plant clock'
description: 'The plant and the program share one virtual clock; a breakpoint, a pause or a stop freezes the plant.'
tags: [plant, simulation]
---

# The plant clock

In simulation the plant and the program share one virtual clock. When the program has completed N milliseconds of scans, the plant has simulated N milliseconds. The plant never follows the wall clock or a timestamp: it follows the scans the runtime has completed.

## One scan

Each scan runs in this order, the same order as a graded scenario run:

1. The plant takes the output values the program wrote in the scan before.
2. The plant advances one scan interval.
3. The plant writes its sensors to the input image in one write.
4. The runtime runs the scan.

The plant advances in steps of 5 ms. The task interval must therefore be a multiple of 5 ms. Otherwise the session refuses to start and says so, for example: `plant: the scan interval of 7 ms is not a multiple of the plant step of 5 ms; set the task interval to a multiple of 5 ms`.

An input bit that is not driven by the plant map keeps its value across the exchange, so a bit you set by hand next to a plant sensor survives.

## Pause, step and stop

- **Pause** and **Stop** freeze the plant. No scan is issued, so the plant does not advance.
- **Step** advances the program by one scan and the plant by one scan interval.
- The command bar drives all of these. The plant has no controls of its own.

## The debug caveat: a breakpoint freezes the plant

When a breakpoint holds the program, the scan stays in flight and the session is in the state `held`. The plant has already advanced for that scan, and it does not advance again until you continue. On continue, the held scan finishes and the plant goes on from there. Time on the plant stops while you inspect the program. Do not read a held plant as a machine that stopped for a reason of its own.

## When the runtime fails

If the runtime rejects a step, the session goes to `faulted` and reports the runtime's own message. The plant has advanced for the scan in flight and never advances again. Events and snapshots report the last completed scan.

## Slow computers

If the exchange and the plant step together take longer than the scan interval, the session slows the plant and the program together and says so. It never drops a step. This page gives no speed figure: it is not yet measured on the reference machines.

## Runtime differences

With the native runtime and with the WebAssembly runtime the exchange, the virtual clock and the trace are the same. The list of known differences between the two (`PLANT_WASM_GAPS`) is empty today.
