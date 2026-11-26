## Why check a board first

A hardware lesson needs three things to be right before any program can be: the board is the one you chose in ZPLC, it can drive an output, and it can read an input. If one of them is wrong, every later lesson fails for a reason that has nothing to do with your program. This lesson checks all three once, with the smallest program that shows them.

Every physical step of this lesson is done by you: you wire, flash, deploy, press {{ui:toolbar.run.label}} and power the board. Neither ZPLC nor an AI assistant ever does any of these. ZPLC shows you the steps, waits for you to do each one, and its check only reads what the board reports.

## What the check proves

The lesson uses three parts. The wiring card of the lesson in Studio shows where each one goes on your board.

| Part           | Channel                     | What it proves                                               |
| -------------- | --------------------------- | ------------------------------------------------------------ |
| LED with 330 Ω | DO0                         | The board drives an output: the program can turn on a light. |
| On-board LED   | DO4, Raspberry Pi Pico only | The Pico's own LED follows the same output as DO0.           |
| Push button    | DI0                         | The board reads an input: the program sees the press.        |

The program blinks the LED by itself, half a second on and half a second off, so you can see the output work before you touch anything. You will make it also light the LED while the push button is held, so that the same LED shows the input working too.

## The steps, in order

1. **Wire.** Unplug the USB cable first. Wire the parts of the wiring card for your board, then check the wiring a second time.
2. **Flash.** Write the prebuilt ZPLC firmware to the board with the steps of the firmware card, after you check the SHA-256 of the file.
3. **Connect.** Connect ZPLC to the board over its serial port. The board reports which board its firmware was built for and the identity of its I/O description, and ZPLC refuses to deploy when they differ from the board you chose. That comparison is the identity check.
4. **Deploy.** Deploy the program. Deploying loads it on the board and leaves it stopped: keep it stopped. If it is already running, stop it from the toolbar.
5. **Arm the check.** Press {{ui:learn.hardware.check.run}}. The check gets ready to record and asks you to start the program.
6. **Run.** Press {{ui:toolbar.run.label}} in the toolbar. The first scan of the run is the start of the check, as in the simulation.
7. **Follow the steps.** The check shows one step at a time: "press and hold Test button (DI0) now", then "release Test button (DI0) now". Let the LED blink once before you press, hold the button for a count of two, then release it. The recording ends by itself after the last step, and its result is labelled a hardware run.

> [!WARNING]
> Wire only with the USB cable unplugged. A wire that slips while the board has power can short a pin, and a board damaged that way gives wrong answers in every later lesson.

## Worked example

A technician commissions a new pump panel. Its Ready lamp must light while the local selector is ON, but never while the pump reports a fault. Before writing the full program, the technician tests both inputs and the lamp with a program of one line:

```st
PROGRAM PanelTest
VAR_INPUT Local : BOOL; Fault : BOOL; END_VAR
VAR_OUTPUT ReadyLamp : BOOL; END_VAR
ReadyLamp := Local AND NOT Fault;
END_PROGRAM
```

`NOT Fault` is TRUE while there is no fault, and `AND` is TRUE only when both sides are TRUE, so the lamp lights with the selector and goes dark while a fault is reported. Turning each input on and off, one at a time, proves each wire on its own:

```timing
span: 3000
signals:
  - { name: Local, edges: [500, 2500] }
  - { name: Fault, edges: [1200, 1800] }
  - { name: ReadyLamp, edges: [500, 1200, 1800, 2500] }
caption: ReadyLamp is ON while Local is ON and Fault is OFF
```

If the lamp never lights, the technician looks at the output and its wiring first. If the lamp lights with Local but a fault does not turn it off, the lamp is fine and the wire of Fault is the suspect. One small program, one signal at a time: that is how the check of your board works too.

## Common mistakes

- Wiring the LED backwards. An LED lets current through in one direction only, so a reversed LED never lights, even when the output is ON.
- Leaving out the resistor. Without it the LED draws too much current and can damage itself or the pin.
- Connecting the push button to the input but not to GND, so pressing it changes nothing.
- Choosing one board in ZPLC and connecting another. The identity check refuses the deploy, and the fix is to choose the right board or flash the firmware built for it.
- Changing the line of OnBoardLed. It copies Led so that the Pico's own LED shows the same thing; leave it as it is.

## Check yourself

```quiz
question: The LED blinks, but holding the push button changes nothing. What do you check first?
options:
  - { text: 'The wiring of the push button to DI0 and to GND', correct: true, feedback: 'Yes. The blink shows that the board runs the program and drives the output, so the input side is the suspect.' }
  - { text: 'The firmware: flash it again', feedback: 'The firmware runs: without it the LED would not blink at all.' }
  - { text: 'The resistor of the LED', feedback: 'The LED already lights, so its resistor and its wiring work.' }
```

```quiz
question: ZPLC refuses to deploy and says that the board differs from the one you chose. What does that mean?
options:
  - { text: 'The firmware on the board was built for another board than the one you chose', correct: true, feedback: 'Right. Choose the board you really have, or flash the firmware built for the board you chose.' }
  - { text: 'The USB cable is broken', feedback: 'With a broken cable ZPLC could not talk to the board at all, so it could not compare the boards.' }
  - { text: 'The program has an error', feedback: 'An error in the program stops the build, before any deploy is tried.' }
```

## What you will do in the practice

The starting program blinks Led and ignores Button. You will change the line of Led so that the LED is also lit while Button is pressed, keep OnBoardLed as it is, and save the file. Then you will do the physical steps yourself: deploy the program and keep it stopped, press {{ui:learn.hardware.check.run}}, press {{ui:toolbar.run.label}}, and follow the steps the check shows.
