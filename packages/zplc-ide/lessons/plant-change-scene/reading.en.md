## The machine

This is the station of the practice: two packing lines, A and B, merge into one outfeed belt that carries one box at a time to the end of the line. The picture and the tables show the station complete, with every part the scenario of the practice uses. The scene file in your project is the one you will change, and the Check says where it differs.

![The merge-two-lines scene seen from above at an angle. Three belt conveyors form a T: FeedA runs from the left to the junction, FeedB comes from the near side into the side of the junction, and Outfeed runs on to the right and ends at Remover1, a grey bin. Cyan corner marks show the place of EmitterA at the left end of FeedA and of EmitterB at the near end of FeedB. Each part has a label with its name, its kind, and the program variable and signal it is tied to, with an arrow for the direction.](images/machine.en.png)

The station has thirteen parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FeedA`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `FeedB`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Outfeed`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `EmitterA`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EmitterB`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `BladeA`      | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `BladeB`      | Stop blade             | A plate that rises across the belt to hold items back until they are let through.                             |
| `EyeA`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeB`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeZone`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Remover1`    | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `DoneLight`   | Indicator light        | A pilot lamp on the operator panel that shows one state.                                                      |

| Variable | Signal                | Direction & type  | Meaning                                                 |
| -------- | --------------------- | ----------------- | ------------------------------------------------------- |
| `RunA`   | `FeedA.run`           | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunB`   | `FeedB.run`           | PLC output · BOOL | TRUE runs the belt forward.                             |
| `RunOut` | `Outfeed.run`         | PLC output · BOOL | TRUE runs the belt forward.                             |
| `EmitA`  | `EmitterA.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `EmitB`  | `EmitterB.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line.       |
| `HoldA`  | `BladeA.extend`       | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `HoldB`  | `BladeB.extend`       | PLC output · BOOL | TRUE raises the blade across the belt; FALSE lowers it. |
| `WaitA`  | `EyeA.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `WaitB`  | `EyeB.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| `Zone`   | `EyeZone.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                    |
| —        | `Remover1`            | —                 | Not wired to the PLC.                                   |
| `Start`  | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                     |
| `Done`   | `DoneLight.lit`       | PLC output · BOOL | TRUE switches the lamp on.                              |

`Remover1` is not wired to the PLC: it clears every box that reaches the end of `Outfeed` on its own. Your program reads four inputs and drives eight outputs.

## A scene and its plant map

The machine is described by two files in your project, and the program knows neither of them.

- The **scene**, `scene.json`, lists the parts: for each one its name, its place on the floor, its rotation and its settings. A signal of a part is the name of the part, a dot and the signal of the kind of part, such as `FeedA.run`.
- The **plant map**, `plant-map.json`, ties each signal to a point of the program, written `Program.Variable`, such as `MergeLines.RunA`. ZPLC never guesses a variable from the name of a signal: a signal that is not in the map does not reach the program.

The scenario of a lesson names both files. When you press {{ui:learn.check}}, ZPLC reads the saved files of your project, runs your saved program on that scene with that map, and grades what happened. So the same program on another scene can give another result, and the program is not always the file to change.

## Change a scene in the editor

The editor changes the scene file and the plant map without writing them by hand. It needs the plant to be stopped.

1. Open the plant with {{ui:command.view.showPlant}} in the command palette. In {{ui:plant.panel.scene}}, choose {{ui:plant.panel.projectScene}}, then press {{ui:plant.panel.editScene}}.
2. The list of parts shows every part of the scene. Select one to see {{ui:plantEditor.formHeading}}: its name, its position X and Z, its rotation, and one field for each setting of its kind, with its unit. A field is applied when you press Enter or leave the field. A value outside the range of its setting is refused, with the message at the field.
3. To place a part, positions follow a grid of 0.25 m and rotations go in steps of 15 degrees. A part dropped within 0.15 m of a snap point of another part attaches to it.
4. The {{ui:plantEditor.signalsHeading}} table lists every signal that the parts offer, with its type, its direction and the program point it is bound to. To bind a signal, type the point in the field of its row and press the Bind button of that row.
5. Press {{ui:plantEditor.done}} to close the editor. The plant is rebuilt from the edited scene. Then press {{ui:plant.panel.saveToProject}}: it writes `scene.json` and `plant-map.json` at the root of the project, the two files the Check reads.

Every edit can be undone with Undo and redone with Redo. The settings of every kind of part, with their ranges, are in the parts reference of the documentation.

## Worked example

The belt-to-sensor station of the first plant lesson has a belt called `Belt1`, an emitter, a sensor at the far end and a start button. Its program is finished: a press of the start button puts a box on the belt, and the belt stops when the sensor sees the box. The plant owner now fits a slower belt, and nobody wants to touch the program.

In the editor the change is one field. Select `Belt1`, type `0.25` in `speedMps (m/s)` instead of `0.5`, press Enter, press {{ui:plantEditor.done}} and then {{ui:plant.panel.saveToProject}}. The scene changed, the plant map did not, and the program did not. This table comes from running the finished program on the saved scene with the scenario of that lesson, which presses the start button at {{t:200}} ms and asks that the sensor sees the box within 8 seconds:

| Belt speed | The belt stops at                   | Check  |
| ---------- | ----------------------------------- | ------ |
| 0.5 m/s    | about 3.25 s                        | passes |
| 0.25 m/s   | about 5.93 s                        | passes |
| 0.2 m/s    | about 7.3 s                         | passes |
| 0.125 m/s  | not before the end of the 8 seconds | fails  |

At 0.125 m/s the box has not reached the sensor when the 8 seconds end, so two of the assertions fail. The program is the same in all four rows. The scene alone decided the result.

Now the owner also renames the belt `Belt1` to `Conv1` in the editor, and saves the scene. Check no longer grades the run. It reports a problem in `plant-map.json`: `"Belt1.run" is not a command signal of the scene`. The map still names the signal of a part that has changed its name. Binding the signal `Conv1.run` to the same point as before, `BeltToSensor.Run`, and saving again makes the Check pass.

This machine only changes a setting and a name of parts that already exist. The practice asks for a change that this example does not show: you work out what it is, and where it goes, from the scene, from the program and from what the Check says.

## Common mistakes

- Editing the program when the scene is what has to change. A program that gives the right outputs cannot make a missing or wrong part work.
- Typing a value and not pressing Enter or leaving the field. A field is applied only then, so the scene keeps its last value.
- Trying to edit while the plant runs. {{ui:plant.panel.editScene}} is off while the plant runs: stop it first.
- Renaming a part and not updating the plant map. The map is written with the names of signals, so the old name binds to nothing and the Check refuses the run.
- Trusting a part because it is in the list. A part that exists is not always a part that works: compare its place, its rotation and its settings with those of the parts around it, and read what the Check reports.
- Leaving the editor without saving. {{ui:plantEditor.done}} rebuilds the plant on screen, but the Check reads the files, so press {{ui:plant.panel.saveToProject}} too.

> [!NOTE]
> A scene that passes its scenario says only that the program behaved correctly on that scene in the simulator. It is not evidence about a real machine, its timing or its safety.

## Check yourself

```quiz
question: In the worked example the belt is slowed to 0.125 m/s and the program is not changed. What does the Check report?
options:
  - { text: 'The scenario fails, because the box has not reached the sensor when the 8 seconds end', correct: true, feedback: 'Yes. Nothing in the program changed: the scene alone changed what the sensor sees and when.' }
  - { text: 'The scenario passes, because the program is the same', feedback: 'The program is the same, but the Check grades the program on the scene, and on this scene the box arrives too late.' }
  - { text: 'The Check reports an error in the plant map', feedback: 'The map still names signals that exist: only a setting of Belt1 changed, not a name.' }
```

```quiz
question: After the belt is renamed `Conv1` and the scene is saved, why does the Check report a problem in `plant-map.json`?
options:
  - { text: 'Because the map still binds `Belt1.run`, a signal that the scene no longer has', correct: true, feedback: 'Right. The signals of a part start with its name, so a renamed part has new signals that must be bound.' }
  - { text: 'Because the program no longer compiles', feedback: 'The program did not change and still compiles. The problem is in the map.' }
  - { text: 'Because the scene file is not valid JSON', feedback: 'The editor writes a valid scene. The message names a signal of the map that the scene lacks.' }
```

## What you will do in the practice

The scene in your project is the merge station of the picture, with its plant map, and its program in `src/MergeLines.st` is finished: it already drives every output of the station and lets the two lines through one at a time. The scenario presses the start button at {{t:200}} ms and checks that boxes from both feeders leave the outfeed, that Done is on at {{t:25000}} ms, and that no box is dropped or collides. As the project stands, line B gets no boxes. Change the scene and its plant map, not the program, save them and press {{ui:learn.check}}.
