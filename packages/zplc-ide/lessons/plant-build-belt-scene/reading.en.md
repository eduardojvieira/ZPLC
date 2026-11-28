## The machine

This is the smallest station of a packing line: a box is put on a belt, the belt carries it to the far end, and a sensor there tells the program that the box has arrived. You have met it in the lesson "Move a box to a sensor", where the scene came ready. In this lesson the scene starts as an empty floor, and you build the station in the scene editor.

![The belt-to-sensor scene seen from the front, with the title "Belt to sensor". A belt conveyor on legs runs from left to right. On its left part, four cyan corner marks show where the emitter puts a box on the belt. Behind the belt stands the start button on a small pedestal. At the right a sensor on a post sends a thin dotted red line across the belt. Four labels give each part its name, its kind and its signal, and a line at the bottom says that an arrow towards the variable is a PLC input and an arrow towards the signal is a PLC output.](images/machine.en.png)

The station has four parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt1`       | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Emitter1`    | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `EyeFar`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |

| Variable | Signal                | Direction & type  | Meaning                                           |
| -------- | --------------------- | ----------------- | ------------------------------------------------- |
| `Run`    | `Belt1.run`           | PLC output · BOOL | TRUE runs the belt forward.                       |
| `Emit`   | `Emitter1.emit`       | PLC output · BOOL | Each rising edge releases one item onto the line. |
| `EyeFar` | `EyeFar.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.              |
| `Start`  | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.               |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only the four variables: it never sees the box itself, only what the sensor says about it.

## A scene is parts, names and bindings

The scene is a list of parts. Each part has a name, a position on the floor, a rotation and settings of its own, such as the length of a belt. The name is the first half of the signals of the part: a part named `Belt1` offers `Belt1.run`.

A signal reaches your program only when you bind it. In the editor you type the program point, written `Program.Variable`, and press Bind; ZPLC never guesses a variable from a name. The bindings are saved in the plant map, next to the scene. Check reads both files at the root of the project: `scene.json` and `plant-map.json`.

The scenario of the lesson looks up two parts by name: it presses `StartButton`, and it reads how many boxes `EyeFar` has seen. If `EyeFar` is missing or misspelled, Check says that the scenario names a part the scene does not have, names it, and lists the parts the scene does have. Use the names of the machine section for all four parts.

## Build it in the scene editor

1. Open the plant with {{ui:command.view.plant}} in the command palette. In {{ui:plant.panel.scene}}, the scene of the lesson is listed as {{ui:plant.panel.projectScene}}. Keep it selected: it is the scene that Check reads.
2. Press {{ui:plant.panel.editScene}}. The editor needs the plant to be stopped.
3. In {{ui:plantEditor.filterLabel}} and {{ui:plantEditor.addLabel}}, choose a part, then press {{ui:plantEditor.add}}. The part appears at the origin of the floor and is selected.
4. In {{ui:plantEditor.formHeading}}, type the name, the position X and Z in metres, the rotation in degrees and the settings of the part. A field is applied when you press Enter or leave the field. Positions follow a grid of 0.25 m, rotations go in steps of 15 degrees, and a part dropped within 0.15 m of a snap point of another part, such as the end of a belt, attaches to it.
5. In {{ui:plantEditor.signalsHeading}}, type the program point of each signal that is not bound yet and press Bind.
6. Press {{ui:plantEditor.done}}, then {{ui:plant.panel.saveToProject}}. For the scene of the lesson it asks for no name and writes `scene.json` and `plant-map.json` at the root of the project.

If you choose {{ui:plant.panel.emptyFloor}} in {{ui:plant.panel.scene}} instead, {{ui:plant.panel.saveToProject}} asks for a name and saves the scene as `scenes/<name>.scene.json`, which Check does not read.

## How a diffuse sensor sees a box

The beam of a diffuse optical sensor starts at the position of the part and runs along the own +x axis of the part for as many metres as its range setting says. A belt also runs along +x. Rotation turns the beam about the vertical axis: with rotation 0 the sensor looks along the belt, and a rotation of 90 degrees turns it from +x towards -z. In the machine image the beam is the thin dotted red line.

Three things must be true for the sensor to see a box. The beam must cross the path of the box. It must be long enough to reach the box. And the box must be in it: the sensor is TRUE only while the box is in the beam, and FALSE again as soon as the box has passed.

## Worked example

A post room has a long inbound belt that carries boxes to a sorting table. Its scene has a belt `Feed`, 5 m long, which runs along +x with its middle at X 0, Z 0; an emitter `Source` that releases a box at the start of the belt; and a diffuse sensor `Gate` that tells the program that a box passes 1.5 m beyond the middle of the belt. The sensor stands on the +z side of the belt, 0.5 m from its middle line, and its range is the default, 0.5 m.

Build it in the editor: add the belt and type 5 as its length; add the emitter and drop it near the start of the belt, where it attaches to the snap point there; add the sensor and type X 1.5, Z 0.5 and rotation 90. The signals table then lists `Feed.run`, `Source.emit` and `Gate.detect`, and you bind each one to a variable of the program.

To see what the sensor does, a run of this scene kept the belt running all the time and released one box at 0.2 s:

```timing
span: 10000
signals:
  - { name: Source, edges: [200, 400] }
  - { name: Gate, edges: [7970, 8770] }
caption: One box released at 0.2 s turns Gate on at 7.97 s and off again at 8.77 s while the belt keeps running
```

Gate is TRUE only for the 0.8 s in which the box is in the beam, even though the belt never stopped. Three other settings of the same sensor never saw the box in a run of 10 s:

- Rotation 0: the beam runs along the belt, beside it, and never meets the box.
- Rotation 270: the beam runs away from the belt.
- Rotation 90 with range 0.3 m instead of 0.5 m: the beam ends before it reaches the box.

The numbers belong to this machine: a sensor 1.5 m beyond the middle of a belt means nothing on a shorter belt. The station of the practice has its own belt, and you work out where its sensor goes and which way it looks from the machine section.

## Common mistakes

- Placing the sensor and leaving its rotation at 0. The beam runs along the belt, the sensor never turns on, and the program never stops the belt.
- Leaving a signal unbound. A belt whose `run` is unbound never moves, an emitter whose `emit` is unbound never puts a box on it, and a sensor whose `detect` is unbound is invisible to the program.
- Misspelling `EyeFar` or `StartButton`. The scenario looks them up by name and finds nothing.
- Saving a scene other than the scene of the project. Check reads `scene.json` at the root of the project, not the files of `scenes/`.
- Editing while the plant runs. {{ui:plant.panel.editScene}} is off until the plant is stopped.

## Check yourself

```quiz
question: 'A diffuse sensor stands beside a belt with rotation 0. Where does its beam run?'
options:
  - { text: 'Across the belt, to the middle of it', feedback: 'The beam runs across the belt only after the rotation turns it towards the belt.' }
  - { text: 'Along the belt, beside it, so it never meets a box', correct: true, feedback: 'Yes. With rotation 0 the beam runs along +x, the direction of the belt, and the sensor stands beside the belt, not in front of it.' }
  - { text: 'Straight up, over the belt', feedback: 'The beam is horizontal. Rotation turns it about the vertical axis; it never points upwards.' }
```

```quiz
question: 'You build the scene with {{ui:plant.panel.emptyFloor}} chosen in the list of scenes and press {{ui:plant.panel.saveToProject}}. Why does Check still say that the scenario names a part the scene does not have?'
options:
  - { text: 'Because the editor saves only parts that are already bound', feedback: 'The editor saves every part you placed. The problem is where the file went.' }
  - { text: 'Because the plant has to run once before Check can read the scene', feedback: 'Check reads the saved files; the plant does not have to run.' }
  - { text: 'Because the save went to scenes/<name>.scene.json, and Check reads scene.json at the root', correct: true, feedback: 'Right. Only the scene of the lesson is saved in place at the root.' }
```

```quiz
question: 'In the worked example the belt runs all the time and Gate turns on at 7.97 s. When does it turn off?'
options:
  - { text: 'Never, because a sensor keeps the value of its last detection', feedback: 'The sensor reports the beam as it is now. It does not remember.' }
  - { text: 'At 8.77 s, when the box has left the beam', correct: true, feedback: 'Yes. Gate is TRUE only while the box is in the beam, and the belt carries the box on.' }
  - { text: 'When the program stops the belt', feedback: 'The belt never stopped in this run, and Gate still turned off.' }
```

## What you will do in the practice

The starting program declares the inputs Start and EyeFar and the outputs Run and Emit, and drives nothing; the starting scene is an empty floor. You will build the scene of the station and write its program: a press of the start button, which the scenario gives at {{t:200}} ms, puts one box on the belt and runs it, and the belt stops when EyeFar sees the box. Then press {{ui:learn.check}}.
