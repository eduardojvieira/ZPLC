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

## The 3D view and its camera

The view opens with the whole scene in the panel, at any panel size. It keeps the viewing direction of the first camera of the scene, and chooses the target and the distance from the size of the scene and the shape of the panel. While you have not moved the camera, resizing the panel fits the scene again. Dragging, the arrow keys, plus and minus, and W, A, S and D move the camera yourself, and from then on a resize leaves it where it is. The **Camera** list chooses another saved camera, and that one keeps the framing its author gave it. **Fit scene** (also in the command palette, as "Fit scene") shows the whole scene again from the direction you are looking from. It only moves the camera: it does not touch the plant or the program.

## What the 3D view draws

- **States, with a cue other than colour.** A photoelectric sensor draws its beam: a fine dashed line while nothing is in it, a fine solid line with its output lamp lit while it detects. A running belt shows arrow marks that travel with the band, and a stopped belt shows none; with reduced motion the marks stay still. The head of a pressed push button sinks into its collar.
- **Names.** Point at a part to see its name and the names of its signals, with a box around it. Moving the keyboard focus to the control of a part under the view (a push button, a fault list) does the same.
- **Colours.** An item the lesson calls red is red and one it calls blue is blue, in the light and the dark modes. An item with no colour is cardboard. A base and a lid have colours of their own, and each part keeps its own colour. High contrast draws flat colours with outlines.
- **Quality.** **Low** draws plain colours, with no texture, no environment light and no shadow, to keep the frame rate on integrated graphics. **Medium** and **High** draw textured materials (base colour, normal, roughness and metalness maps), light from an environment the application generates, soft shadows and a filmic tone curve; High raises the detail of the shadows and the textures. Every texture ships inside the application: nothing is downloaded.

So far the belt, the photoelectric sensor, the push button and the emitter are drawn as detailed models: the band of a belt wraps a steel drum at each end, a sensor beside a belt sits on a bracket bolted to the belt frame, the push button is a control box on a pedestal, and four corner marks show where the emitter makes items appear. The other parts keep a single box or shape under the same light. At **Medium** and **High** the floor is a satin floor that ends at a horizon.

## What is measured

Frame rate, link latency and supported boards are claims that need recorded evidence. They are not yet measured on the reference machines, so this documentation gives no figure for them.

## Pages in this section

- [The plant clock](./clock.md): one clock, and what a breakpoint does to the plant.
- [Scene file format](./scene-format.md): the fields, the limits and `schemaVersion`.
- [The shipped scenes](./scenes.md): what each scene teaches and what its scenario checks.
- [The scene editor](./scene-editor.md): build or change a scene, bind its signals to your program and save it.
- [Plant parts reference](./parts.md): every part, its settings and its signals.
- [Numeric signals](./numeric-signals.md): how an INT or REAL value travels between a part and the program.
- [Manipulators and gripping](./manipulators.md): the axes, the grip rules and the layer palletizer.
- [Sorting and diverting](./sorting.md): item properties, the sorting sensors, the diverting parts and how a remover grades.
- [Stations](./stations.md): the crate, the lift, the stacker crane with its rack, the machining centre and the completion parts.
- [Plant I/O mode](./io-mode.md): feeding a board from the plant, who may start it and what evidence exists.
