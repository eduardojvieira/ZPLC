---
title: 'The plant'
sidebar_label: 'The plant'
description: 'What the plant is and what it is not: a model of a machine that the program runs against, with one clock shared with the program.'
tags: [plant, simulation]
---

# The plant

A plant is a model of a small machine: belts, boxes, sensors, buttons and lights. Your program reads the sensors and buttons as inputs and writes the belts and lights as outputs. A plant lets you check a program against a machine before there is one.

## What the plant is

- **A document of the editor area.** The Plant command opens it beside the program, so you can see both at once. The interface calls it "Plant".
- **A model with one truth.** The plant core is a headless model. The live run, the graded run and the scenario tests all use that same core and the same signal map. Nothing is graded from pixels.
- **A model with a shared clock.** The plant and the program advance together. See [The plant clock](./clock.md).
- **Made of parts.** A scene lists parts from a fixed catalogue. See the [parts reference](./parts.md), the [scene file format](./scene-format.md) and the [shipped scenes](./scenes.md).

## What the plant is not

- **The 3D view is a view.** It draws what the plant core computed. It decides nothing, and a lesson can be completed and graded without it.
- **Not a controller.** The plant has no Run, Pause, Step or Reset of its own. The command bar is the only transport, and it drives the plant and the program together.
- **Not hardware evidence.** The plant is a model. A result in the plant does not say how a real machine, board or link behaves.

## What is measured

Frame rate, link latency and supported boards are claims that need recorded evidence. They are not yet measured on the reference machines, so this documentation gives no figure for them.

## Pages in this section

- [The plant clock](./clock.md): one clock, and what a breakpoint does to the plant.
- [Scene file format](./scene-format.md): the fields, the limits and `schemaVersion`.
- [The shipped scenes](./scenes.md): what each scene teaches and what its scenario checks.
- [Plant parts reference](./parts.md): every part, its settings and its signals.
- [Numeric signals](./numeric-signals.md): how an INT or REAL value travels between a part and the program.
- [Manipulators and gripping](./manipulators.md): the axes, the grip rules and the layer palletizer.
