## The machine

This is a line that lifts boxes through three levels. The emitter puts a box on the infeed belt at the bottom, lift A raises it to the second level, a transfer belt carries it across, lift B raises it to the third level, and the outfeed belt takes it to a bin. In the scenario of this lesson the emitter releases five boxes, one every 10 s from the 10th second. The start button and the emergency stop are at the left end of the line. The stack light has two lamps that your program drives: green when all five boxes have reached the top, red when the line is stopped.

![The three-level lifts scene seen from the front, with labels. From left to right: the infeed belt with the emitter, the start button and the emergency stop at its left end, lift A with a stack light beside it, a transfer belt, lift B, and the outfeed belt on a tall frame that ends at a bin. Each label gives the name and kind of a part and the variable of your program wired to its signals, with an arrow for an input or an output.](images/machine.en.png)

The line has thirteen parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `LiftA`       | Lift                   | A vertical conveyor that carries an item between floors or levels of a line.                                  |
| `Transfer`    | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `LiftB`       | Lift                   | A vertical conveyor that carries an item between floors or levels of a line.                                  |
| `Outfeed`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `TopBin`      | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `EyeFoot`     | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeMid`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeTop`      | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `EStop1`      | Emergency stop         | The red mushroom button that stops the machine; it stays in until someone twists it to release it.            |
| `StackLight1` | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable      | Signal                | Direction & type  | Meaning                                                                                                      |
| ------------- | --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `RunInfeed`   | `Infeed.run`          | PLC output · BOOL | TRUE runs the belt forward.                                                                                  |
| —             | `Source1`             | —                 | Not wired to the PLC.                                                                                        |
| `AAtLow`      | `LiftA.atLevel1`      | PLC input · BOOL  | TRUE when the platform stands at level 1.                                                                    |
| `AAtHigh`     | `LiftA.atLevel2`      | PLC input · BOOL  | TRUE when the platform stands at level 2.                                                                    |
| `AUp`         | `LiftA.up`            | PLC output · BOOL | TRUE moves the platform up.                                                                                  |
| `ADown`       | `LiftA.down`          | PLC output · BOOL | TRUE moves the platform down.                                                                                |
| `ARun`        | `LiftA.run`           | PLC output · BOOL | TRUE runs the platform's belt forward.                                                                       |
| `RunTransfer` | `Transfer.run`        | PLC output · BOOL | TRUE runs the belt forward.                                                                                  |
| `BAtLow`      | `LiftB.atLevel1`      | PLC input · BOOL  | TRUE when the platform stands at level 1.                                                                    |
| `BAtHigh`     | `LiftB.atLevel2`      | PLC input · BOOL  | TRUE when the platform stands at level 2.                                                                    |
| `BUp`         | `LiftB.up`            | PLC output · BOOL | TRUE moves the platform up.                                                                                  |
| `BDown`       | `LiftB.down`          | PLC output · BOOL | TRUE moves the platform down.                                                                                |
| `BRun`        | `LiftB.run`           | PLC output · BOOL | TRUE runs the platform's belt forward.                                                                       |
| `RunOutfeed`  | `Outfeed.run`         | PLC output · BOOL | TRUE runs the belt forward.                                                                                  |
| —             | `TopBin`              | —                 | Not wired to the PLC.                                                                                        |
| `BoxOnA`      | `EyeFoot.detect`      | PLC input · BOOL  | TRUE while an object is in the beam.                                                                         |
| `BoxOnB`      | `EyeMid.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                                                                         |
| `BoxAtTop`    | `EyeTop.detect`       | PLC input · BOOL  | TRUE while an object is in the beam.                                                                         |
| `Start`       | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                                                                          |
| `EStopOk`     | `EStop1.ok`           | PLC input · BOOL  | TRUE while the button is released (its normally closed contact); FALSE when it is pushed or its wire is cut. |
| `Green`       | `StackLight1.green`   | PLC output · BOOL | TRUE lights the green lamp.                                                                                  |
| `Red`         | `StackLight1.red`     | PLC output · BOOL | TRUE lights the red lamp.                                                                                    |

A PLC output drives a part of the machine; a PLC input is what a part reports. The emitter and the bin are not wired to the PLC: the scene lets them work by themselves. The scenario, not your program, pushes and releases the emergency stop.

## A stop does not end when the button is released

An emergency stop button stays pushed in until someone twists it to release it. Its signal, `EStopOk`, is TRUE while the button is released and FALSE when it is pushed or its wire is cut. So a broken wire stops the line in the same way as a press does, and the program reads "stop" as `EStopOk` being FALSE.

Releasing the button only says that the cause of the stop is gone. It does not say that anybody wants the line to run again, and a line that starts moving by itself when the button is twisted back is dangerous for the person who is still working at it. So after a stop the line waits for a deliberate press of `Start`, and the red lamp stays lit until then.

That needs a **memory** of the stop: a BOOL variable of the program, not wired to any part. `EStopOk` comes back to TRUE at the release, so it cannot be that memory; something the program keeps must say "the line was stopped" after the button is released.

```timing
span: 20000
signals:
  - { name: Start, edges: [200, 400, 17500, 17700] }
  - { name: EStop1, edges: [15500, 17000] }
  - { name: Red, edges: [15500, 17500] }
  - { name: RunOutfeed, edges: [200, 15500, 17500] }
caption: The scenario runs the line, pushes the emergency stop (EStop1 is high while it is pushed), releases it, and presses Start; Red stays lit from the push until Start
```

The diagram is what a correct program does in the scenario, from a run of the solution on the plant of this lesson. The outfeed belt follows the line: it runs after the first press of `Start`, falls in the scan of the push, stays off after the release, and runs again after the second press. Every time is the scenario's time, give or take one scan.

The machine does not stop at once. In that run lift A, which carried the first box and had been rising for about half a second, still rose about 0.1 m after its up output fell, and then stood still until the restart. The box was not dropped: the run delivered all five boxes to the bin and dropped none. The scenario does not measure this coasting; it checks the outputs.

## Worked example

A small air compressor has a motor `Motor`, a pressure switch `Demand` that is TRUE while the tank asks for air, and two temperature switches. `TooHot` is TRUE while the motor is too hot. `CoolEnough` becomes TRUE once the motor has cooled. When the motor is too hot it must stop, and it must stay off after `TooHot` goes back to FALSE, until the motor has cooled enough. Without a memory it would start again as soon as `TooHot` goes back to FALSE.

```st
PROGRAM Compressor
VAR_INPUT Demand : BOOL; TooHot : BOOL; CoolEnough : BOOL; END_VAR
VAR_OUTPUT Motor : BOOL; END_VAR
VAR Cooling : BOOL; END_VAR
IF TooHot THEN Cooling := TRUE; END_IF;
IF CoolEnough THEN Cooling := FALSE; END_IF;
Motor := Demand AND NOT Cooling;
END_PROGRAM
```

Read it from the top. The first IF sets the memory `Cooling` when the motor is too hot. The second IF clears it when the motor has cooled enough. The last line lets the motor run only on demand and only while the memory is FALSE. In a native run, `Motor` is TRUE after `Demand` turns on, falls when `TooHot` turns on, stays FALSE after `TooHot` turns off again, and is TRUE again when `CoolEnough` turns on.

This compressor may start again by itself: the end of its pause is a sensor, not a person. The two conditions of this program also never meet in the same scan, because a motor cannot be too hot and cool at once. The line of the practice is different: its stop does not end the way the pause of the compressor does, and the conditions that act on it can be TRUE in the same scan. What the machine must do then, you decide from what it needs.

## Common mistakes

- Reading `EStopOk` as "pressed". It is TRUE while the button is released, so a program that stops the line when `EStopOk` is TRUE stops it while nobody pushes anything.
- Letting the line run again at the release. The scenario checks at 17.3 s, 0.3 s after the release, that Red is still lit and the outfeed belt is off.
- Stopping only some outputs. At 16 s the scenario checks nine outputs: the three belts, and the up, down and run signals of both lifts.
- Lighting Red from the button. At 17.3 s the button is released, yet Red must still be lit.
- Forgetting to declare the memory. Every variable the program uses is declared, and a memory of the program goes in `VAR`.

> [!NOTE]
> On a real machine an emergency stop is wired so that it cuts the power of the drives even when the program does not work. The stop of this lesson is only what the program does with the `EStopOk` signal.

## Check yourself

```quiz
question: At 17.3 s the emergency stop has been released for 0.3 s and Start has not been pressed again. What must the line do?
options:
  - { text: 'Stay stopped, with Red lit', correct: true, feedback: 'Yes. Releasing the button only says that the cause is gone; a new press of Start asks for the restart.' }
  - { text: 'Run again, because EStopOk is TRUE', feedback: 'A TRUE EStopOk says that the button is released, not that anybody asked for the line to run.' }
  - { text: 'Run the outfeed belt only, with Red lit', feedback: 'The scenario checks at 17.3 s that the outfeed belt is off; a stopped line is stopped everywhere.' }
```

```quiz
question: In the compressor of the worked example, TooHot has gone back to FALSE, CoolEnough is still FALSE and Demand is TRUE. Does the motor run?
options:
  - { text: 'No, because Cooling is still TRUE', correct: true, feedback: 'Right. TooHot set the memory, and only CoolEnough clears it.' }
  - { text: 'Yes, because TooHot is FALSE', feedback: 'A FALSE TooHot does not clear the memory. It stays TRUE until CoolEnough turns on.' }
  - { text: 'It runs for one scan and then stops', feedback: 'Nothing clears the memory in this state, so the motor stays off scan after scan.' }
```

```quiz
question: What does EStopOk read when the wire of the emergency stop button is cut?
options:
  - { text: 'FALSE, as when the button is pushed', correct: true, feedback: 'Yes. The contact is normally closed, so a cut wire opens it and the line stops as it does for a press.' }
  - { text: 'TRUE, because nobody pushed the button', feedback: 'A TRUE would hide the cut wire. The contact is normally closed: when the circuit opens, the input reads FALSE.' }
  - { text: 'It keeps the last value it had', feedback: 'The input follows the circuit, so a cut wire reads FALSE at once.' }
```

## What you will do in the practice

The starting program declares the inputs and outputs of the line, runs the sequences of both lifts, and has no stop. You will change it so that the line stops when the emergency stop is pushed, which the scenario does at {{t:15500}} ms, stays stopped when it is released at {{t:17000}} ms, and runs again only after the press of Start at {{t:17500}} ms. Then press {{ui:learn.check}}.
