## The machine

This is a small production line: raw parts, called blanks, arrive on a belt and two machining centres turn them into products. The two machines are not equally fast. Machine A cuts a lid in a cycle of 3 s, machine B a base in a cycle of 6 s, so a line that sent every blank to the same machine would leave the other one idle. A diverter arm over the belt decides which machine gets each blank.

![The balanced production line scene seen from above and from the front. A long infeed belt runs from left to right, with the emitter at its left end and a diverter arm and sensors along it, and it leads into the first machining centre. A shorter branch belt below it leads into the second machining centre. Each machine has an output belt that ends in its own bin. The start button stands near the emitter and a stack light near the first machine. Each part has a label with its name, its kind and the signals wired to it.](images/machine.en.png)

The line has fifteen parts. The tables say what each one is in a real plant and what its signal means to your program. The PLC variable is the name the program uses: the plant map of the lesson binds each signal of the scene to it.

| Part          | Kind                   | What it is in a real plant                                                                                    |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Infeed`      | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `BranchB`     | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `Source1`     | Item emitter           | Stands for whatever feeds the line: the machine before it, an operator, or a magazine that releases one item. |
| `Gate`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `Arm1`        | Diverter arm           | A swinging arm over the belt that steers items off to a side line.                                            |
| `EyeA`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `EyeB`        | Diffuse optical sensor | A photoelectric sensor that sends out light and sees it bounce back off an object in front of it.             |
| `MachineA`    | Machining centre       | An enclosed machine tool that cuts a raw part into a finished one, with doors that close during the cycle.    |
| `MachineB`    | Machining centre       | An enclosed machine tool that cuts a raw part into a finished one, with doors that close during the cycle.    |
| `OutA`        | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `OutB`        | Belt conveyor          | A motor-driven belt that carries goods along a line, the base of most packing and sorting lines.              |
| `LidBin`      | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `BaseBin`     | Item remover           | Stands for whatever takes items away at the end of the line: the next machine, a bin, or an operator.         |
| `StartButton` | Push button            | A button on the operator panel that is pressed only while a finger holds it.                                  |
| `Beacon`      | Stack light            | A tower of coloured lamps that shows from afar what the machine is doing.                                     |

| Variable    | Signal                | Direction & type  | Meaning                                                                  |
| ----------- | --------------------- | ----------------- | ------------------------------------------------------------------------ |
| `RunInfeed` | `Infeed.run`          | PLC output · BOOL | TRUE runs the belt forward.                                              |
| `RunBranch` | `BranchB.run`         | PLC output · BOOL | TRUE runs the belt forward.                                              |
| —           | `Source1`             | —                 | Not wired to the PLC.                                                    |
| `Gate`      | `Gate.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                                     |
| `Divert`    | `Arm1.divert`         | PLC output · BOOL | TRUE swings the arm across the belt; FALSE brings it back to rest.       |
| `EyeA`      | `EyeA.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                                     |
| `EyeB`      | `EyeB.detect`         | PLC input · BOOL  | TRUE while an object is in the beam.                                     |
| `ReadyA`    | `MachineA.ready`      | PLC input · BOOL  | TRUE when exactly one raw part rests in the chamber: a cycle can start.  |
| `DoneA`     | `MachineA.done`       | PLC input · BOOL  | TRUE from the end of a cycle until the finished part leaves the chamber. |
| `FeedA`     | `MachineA.feed`       | PLC output · BOOL | TRUE runs the machine's own belt, into the chamber and out of it.        |
| `StartA`    | `MachineA.start`      | PLC output · BOOL | A rising edge while ready is TRUE closes the doors and starts a cycle.   |
| `ReadyB`    | `MachineB.ready`      | PLC input · BOOL  | TRUE when exactly one raw part rests in the chamber: a cycle can start.  |
| `DoneB`     | `MachineB.done`       | PLC input · BOOL  | TRUE from the end of a cycle until the finished part leaves the chamber. |
| `FeedB`     | `MachineB.feed`       | PLC output · BOOL | TRUE runs the machine's own belt, into the chamber and out of it.        |
| `StartB`    | `MachineB.start`      | PLC output · BOOL | A rising edge while ready is TRUE closes the doors and starts a cycle.   |
| `RunOutA`   | `OutA.run`            | PLC output · BOOL | TRUE runs the belt forward.                                              |
| `RunOutB`   | `OutB.run`            | PLC output · BOOL | TRUE runs the belt forward.                                              |
| —           | `LidBin`              | —                 | Not wired to the PLC.                                                    |
| —           | `BaseBin`             | —                 | Not wired to the PLC.                                                    |
| `Start`     | `StartButton.pressed` | PLC input · BOOL  | TRUE while the button is held down.                                      |
| `Green`     | `Beacon.green`        | PLC output · BOOL | TRUE lights the green lamp.                                              |

A PLC output drives a part of the machine; a PLC input is what a part reports. Your program sees only these variables: it never sees a blank, only what the sensors and the machines say about it.

Source1 releases a blank every 6 s, eight in all. When the arm is at rest, a blank stays on the infeed belt and reaches machine A; when the arm is across the belt, the blank is steered onto the branch belt and reaches machine B. The line must also be running: each belt moves only while its output is TRUE.

A machining centre works by a short exchange with the program. A blank enters on the machine's own belt, which has to stop for the blank to lie at rest in the chamber. Ready is TRUE when exactly one blank lies at rest there. A rising edge of Start while Ready is TRUE closes the doors and starts a cycle. At the end of the cycle the blank has become a product, and Done is TRUE until the product leaves the chamber. A Start while Ready is FALSE is refused and counted in the fact `misfires`.

The diagram is a run of the finished line: the first five blanks pass Gate, and the arm is across the belt for the second and the fourth. The odd ones reach EyeA, in front of machine A, and the even ones reach EyeB, in front of machine B.

```timing
span: 36000
signals:
  - { name: Gate, edges: [7240, 7640, 13240, 13640, 19240, 19640, 25240, 25640, 31240, 31640] }
  - { name: Divert, edges: [13240, 18240, 25240, 30240] }
  - { name: EyeA, edges: [10840, 11240, 22840, 23240, 34840, 35240] }
  - { name: EyeB, edges: [18740, 19140, 30740, 31140] }
caption: Blanks 1, 3 and 5 reach machine A; blanks 2 and 4 are steered to machine B
```

## One control, written once

The control of a machining centre is the same for both machines: they differ only in the speed of their cycle, and the machine takes care of that itself. Copying the control for the second machine and changing every name by hand works on the first day. After that, every fix has to be made twice, and the two copies slowly stop being the same.

A **function block** writes the control once. A program uses it by declaring an **instance**: a variable whose type is the block. Every instance keeps its own copy of the variables of the block, so what one machine remembers, such as which phase it is in or how long it has been waiting, never reaches the other. The block does nothing by itself. The program calls an instance with the inputs it needs, and then reads its outputs.

## Worked example

A workshop has two stamping presses. Each one stamps a part for 2 s after a part arrives, and counts the parts it has stamped. The control is the same for both, so it is written once, as a block with one input, `Part`, and two outputs, `Press` and `Count`:

```st
FUNCTION_BLOCK Stamper
VAR_INPUT Part : BOOL; END_VAR
VAR_OUTPUT Press : BOOL; Count : INT; END_VAR
VAR Busy : BOOL; Hold : TON; END_VAR
IF Part THEN Busy := TRUE; END_IF;
Hold(IN := Busy, PT := T#2s);
IF Hold.Q THEN Busy := FALSE; Count := Count + 1; END_IF;
Press := Busy;
END_FUNCTION_BLOCK

PROGRAM Stamping
VAR_INPUT PartL : BOOL; PartR : BOOL; END_VAR
VAR_OUTPUT PressL : BOOL; PressR : BOOL; END_VAR
VAR Left : Stamper; Right : Stamper; END_VAR
Left(Part := PartL);
Right(Part := PartR);
PressL := Left.Press;
PressR := Right.Press;
END_PROGRAM
```

Read the program first. `Left` and `Right` are two instances of `Stamper`. Each scan, the program calls each one with its own part sensor and then copies the output of each to its own press. Now read the block: `Busy` and `Hold` are declared inside it, so each instance has its own.

That is why the two presses do not disturb each other. In a run of this program, a part reaches the left press at 1 s and its press runs until 3 s. A part reaches the right press at 2 s, while the left one is still running, and its press runs from 2 s to 4 s. A second part at the left press, at 5 s, runs from 5 s to 7 s. The counts are kept apart too: at 7 s the left press has stamped two parts and the right one, so the total is three.

```timing
span: 8000
signals:
  - { name: PartL, edges: [1000, 1200, 5000, 5200] }
  - { name: PressL, edges: [1000, 3000, 5000, 7000] }
  - { name: PartR, edges: [2000, 2200] }
  - { name: PressR, edges: [2000, 4000] }
caption: Two instances of one block run at the same time, each with its own memory and its own timer
```

This block has one input, one timer and no handshake. A machining centre has a handshake with several phases, and what the block of the practice keeps inside and what it takes in and out is for you to decide from what each machine does.

## Common mistakes

- Copying the control for the second machine and renaming its variables by hand. A fix then has to be made in both copies, and one of them is forgotten.
- Reading the output of an instance before calling it. The value you read is the one of the previous scan. In the example, if the two lines that copy the outputs come before the two calls, `PressL` rises one scan late, at 1.01 s instead of 1.00 s.
- Starting a cycle while Ready is FALSE. The machine refuses the Start and counts a misfire. In a run of this line where the program started both machines without waiting for Ready, each machine counted one misfire and made no product.
- Expecting the line to balance itself. Without the arm, a run of this line sends all eight blanks to machine A, which makes four lids, and the other four blanks reach the lid bin as they came.

> [!NOTE]
> The scenario cannot see how the program is organised: it sees the outputs. A line with two copies of the control and a line with a block can pass the same check. The block is for the person who has to read and change the program next.

## Check yourself

```quiz
question: In the stamping example, the left press has been running for one second when a part reaches the right press. What does the right press do?
options:
  - { text: 'It starts its own 2 s run at once, without disturbing the left one', correct: true, feedback: 'Yes. Each instance keeps its own Busy and its own timer, so the two runs overlap.' }
  - { text: 'It waits until the left press has finished', feedback: 'Nothing in the block makes one instance wait for another; they share no variable.' }
  - { text: 'It restarts the timer of the left press', feedback: 'The timer Hold belongs to one instance. The right instance has a timer of its own.' }
```

```quiz
question: A machining centre receives a rising edge of Start while its Ready is FALSE. What happens?
options:
  - { text: 'The Start is refused and counted in misfires', correct: true, feedback: 'Right. The machine starts a cycle only when exactly one blank lies at rest in it.' }
  - { text: 'The machine starts the cycle anyway', feedback: 'A cycle needs a blank at rest in the chamber, which is what Ready says.' }
  - { text: 'The machine keeps the Start and begins when Ready turns TRUE', feedback: 'The machine remembers nothing: a Start that comes at the wrong moment is lost.' }
```

## What you will do in the practice

The starting program already runs the whole line, and it sends every second blank to machine B. It controls only machine A, with statements written in the program itself, so machine B never gets a blank into its chamber and no base is made. You will give machine B the same control without writing it a second time, and light Green when both machines have finished four cycles. The scenario presses Start at {{t:200}} ms and looks at the lamp at {{t:80000}} ms. Then press {{ui:learn.check}}.
