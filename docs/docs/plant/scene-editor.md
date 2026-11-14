---
title: 'The scene editor'
sidebar_label: 'The scene editor'
description: 'Build or change a plant scene in ZPLC: add parts, place them, read the signals, bind them to your program, undo, save and run.'
tags: [plant, scenes, editor]
---

# The scene editor

The scene editor is how you build a scene of your own, or change one that ships with ZPLC, without writing the scene file by hand. This page follows the editor as it is in ZPLC today. Everything you can do with the pointer you can also do with the keyboard.

## Open the editor

1. Open the plant with **Show the plant** in the command palette.
2. In **Scene**, choose **Empty floor** to start from nothing, a shipped scene, or a scene saved in your project.
3. Press **Edit scene** in the **Plant tools** toolbar.

The editor needs the plant to be stopped. While the plant runs, **Edit scene** is off and the editor says so. While you edit, the toolbar offers **Undo**, **Redo** and **Done editing**.

## Add a part

1. Type in **Filter parts** to keep only the parts whose name contains the text.
2. Choose the part in **Part to add**. The list is grouped by family: items, sources, conveyors, flow, sensors, panel, process, manipulators and stations. A one-line description of the chosen part is read out under the list.
3. Press **Add part**. The part appears at the origin of the floor, on the grid or attached to a snap point that is near it, and it is selected.

Every part has a default name such as `Belt1`. The name is the first half of its signals, so `Belt1` gives `Belt1.run`. In the list of parts, each row has a button to select the part, **Duplicate** and **Delete**. A duplicate lands 0.25 m away from the original.

## Place and configure a part

With a part selected, **Part settings** shows its fields:

- **Name**, **Position X (m)**, **Position Z (m)** and **Rotation (degrees)**.
- One field for each setting of the part, with its unit, such as the length or the speed of a belt. A number must stay in the range that the [parts reference](./parts.md) gives for that setting.

A field is applied when you press Enter or leave the field, so typing never applies half a number. A value outside its range is refused and the message is shown at the field.

Positions follow a grid of 0.25 m, and a part that is dropped within 0.15 m of a snap point of another part attaches to it. Rotations go in steps of 15 degrees. The same rules apply whether you type the position or drag the part.

To drag, press the pointer on the floor near a part, move it and release it; Escape cancels the drag. A drag is one undo step.

## Read the signals and the problems

The **Signals** table lists every signal that the parts of the scene offer, with its type, its direction (Sensor: from the plant to the program; Command: from the program to the plant) and the program point it is bound to. See [numeric signals](./numeric-signals.md) for `INT` and `REAL`.

A problem is shown at the part that causes it, in the list of parts or at the field: a duplicate name or a setting out of range. A refused value is not applied, so the scene keeps its last good value.

## Bind the signals to your program

A signal is bound to a variable of your program only when you say so. ZPLC never guesses a variable from its name.

1. In the row of the signal, type the program point in **Program point for** the signal, written `Program.Variable`, such as `BeltToSensor.Run`.
2. Press **Bind** (or Enter). **Unbind** removes the binding.
3. For an `INT` or `REAL` signal, give the raw range of the program variable and the scaled range of the plant value. When the part declares its own scaled range, it is shown and cannot be typed.

The bindings are the plant map of the scene. See the [scene file format](./scene-format.md) for the file.

The editor has a module that writes the variable declarations of a scene in ST, IL, LD, FBD or SFC, and the **Create declarations** control that calls it. That control is not mounted in the editor yet: until it is, copy the names and the types from the **Signals** table into the variable table of your program.

## Undo, redo, save and run

- **Undo** and **Redo** step through your edits, one step for each edit or drag. They are off while the plant runs.
- **Done editing** closes the editor and rebuilds the plant from the edited scene.
- **Save to project** (in the toolbar after **Done editing**, when a project folder is open and the scene is not already a saved scene) asks for a name and saves the scene and its plant map as `scenes/<name>.scene.json` in your project, where it is listed in **Scene**. The project's own scene (the `scene.json` at the root of the project, as a scene lesson ships it) is saved in place: **Save to project** asks for no name and writes `scene.json` and `plant-map.json` at the root, the files a lesson Check grades, and creates no `scenes/` folder. A scene that has been edited also takes part in **Save all**.
- To run, use **Run** in the command bar. It starts the program and the plant together. If the signals are not bound, the plant is shown but no program drives it.

## Use the keyboard

Every control of the editor is a labelled field or a button that you reach with Tab. You can build a whole scene without the 3D view:

1. Tab to **Filter parts**, then to **Part to add**, and press **Add part**.
2. In **Part settings**, type the position, the rotation and the settings.
3. In **Signals**, type the program points and bind them.

The 3D view also takes the keyboard: with the view focused, the arrow keys orbit, plus and minus zoom, and W, A, S and D pan.

## What is not claimed

The editor changes the scene file; it does not check that your program is correct, and a scene that passes its checks is not evidence about a real machine. This page gives no frame rate and no latency: they are not yet measured on the reference machines.

## See also

- [The shipped scenes](./scenes.md)
- [Plant parts reference](./parts.md)
- [Scene file format](./scene-format.md)
- [Plant I/O mode](./io-mode.md)
