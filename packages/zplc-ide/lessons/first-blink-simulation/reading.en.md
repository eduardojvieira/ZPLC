## What a PLC does

A **PLC**, a programmable logic controller, is the small computer that runs a machine. Wires bring it **inputs**, such as a push button or a sensor, and it drives **outputs**, such as a lamp, a valve or a motor. Its program decides, from the inputs, what the outputs must be.

A PLC runs its program in a loop called the **scan cycle**. In each scan it reads every input, runs the program from the first statement to the last, and writes every output. Then it starts again, a few milliseconds later, for as long as it runs. A program never waits for something to happen: it looks again on the next scan.

In this lesson there is no PLC on your desk. ZPLC runs the program in its **simulator**, a PLC that lives inside the application, so you can run a program and watch its outputs with no hardware at all.

## Time in a program

Many programs need time: a lamp that flashes, a pump that runs for a while. Structured Text, the language of this lesson, writes a length of time as a value of type `TIME`, which starts with `T#`:

- `T#750ms` is three quarters of a second, seven hundred and fifty milliseconds.
- `T#2s` is two seconds, the same as `T#2000ms`.
- `T#1m30s` is a minute and a half.

A variable of type `TIME` holds such a value, and its declaration can give it a first value with `:=`, as in `Pause : TIME := T#2s;`. Changing that one value changes every place in the program that uses the variable.

## How a blinker works

A lamp blinks when the program turns it on, waits, turns it off, waits, and so on. The program cannot pause, so it counts instead, with a **timer**: a part of the program that measures how long its input, IN, has been TRUE and says when a preset time is over. The program of this lesson uses one timer and one memory variable:

1. The timer counts up to the half period.
2. When the half period is over, the program flips the memory: ON becomes OFF, OFF becomes ON.
3. It restarts the timer, which counts the next half period.
4. The lamp copies the memory.

The lamp spends one half period off and the next one on, so a full blink, off and on, lasts twice the half period. The diagram shows a lamp with a half period of one second. Time runs to the right; a line is up while its signal is ON.

```timing
span: 5000
signals:
  - { name: Lamp, edges: [1000, 2000, 3000, 4000] }
marks:
  - { from: 0, to: 1000, label: HalfPeriod }
  - { from: 1000, to: 2000, label: HalfPeriod }
caption: Each half period the lamp changes state, so one blink lasts two half periods
```

## Worked example

A barrier at the exit of a car park has a warning beacon that must flash slowly: one second off, one second on. The program has the same shape as the one of your practice:

```st
PROGRAM ExitBeacon
VAR_OUTPUT Beacon : BOOL; END_VAR
VAR Clock : TON; BeaconOn : BOOL := FALSE; HalfPeriod : TIME := T#1s; END_VAR
Clock(IN := TRUE, PT := HalfPeriod);
IF Clock.Q THEN BeaconOn := NOT BeaconOn; Clock(IN := FALSE, PT := HalfPeriod); END_IF;
Beacon := BeaconOn;
END_PROGRAM
```

Read it from the top. The first statement runs the timer `Clock` with `HalfPeriod` as its preset. When the preset is over, `Clock.Q` turns TRUE, and the `IF` flips `BeaconOn` and restarts the timer. The last statement copies the memory to the output. The operator later asks for a faster beacon, a quarter of a second off and a quarter on: the only change is the declaration, `HalfPeriod : TIME := T#250ms;`.

## Common mistakes

- Giving the time of a full blink instead of half of it. `HalfPeriod` is how long the lamp stays in one state, so a blink that lasts two seconds needs `T#1s`.
- Writing a number without its unit. `T#750` is not a time; write `T#750ms`.
- Mixing up units: `T#750s` is twelve and a half minutes, not three quarters of a second.
- Looking for {{ui:learn.check}} before saving. Check grades the saved file, so it is unavailable while the file has unsaved changes, and Learn asks you to save them first.

> [!NOTE]
> A blink at the wrong speed is still a blink. The scenario of the lesson looks at the lamp at given moments, so it can tell a lamp that blinks at the right speed from one that only blinks.

## Check yourself

```quiz
question: HalfPeriod is T#2s. How long does one full blink last, off and then on?
options:
  - { text: 'Four seconds', correct: true, feedback: 'Yes. The lamp stays off for one half period and on for the next one, so a blink lasts two half periods.' }
  - { text: 'Two seconds', feedback: 'Two seconds is how long the lamp stays in one state. A full blink has two of those.' }
  - { text: 'One second', feedback: 'A full blink is longer than one half period, never shorter.' }
```

```quiz
question: You change the value of HalfPeriod and have not saved the file yet. What can you do with Check?
options:
  - { text: 'Nothing yet: Check is unavailable until you save the file', correct: true, feedback: 'Right. Check grades the saved file, so Learn asks you to save your changes first.' }
  - { text: 'Press it, and it grades the program as you see it in the editor', feedback: 'Check never grades unsaved text: it waits until the file is saved.' }
  - { text: 'Press it, and it grades the last saved version', feedback: 'Check does not grade an old version behind your back: it stays unavailable until you save.' }
```

## What you will do in the practice

The starting program already blinks Lamp, but its half period is two seconds, so the lamp is still OFF when the scenario looks at it at {{t:750}} ms. You will change that one value so that Lamp is off for half a second and on for half a second, save the file, press {{ui:toolbar.run.label}} (F5) and watch Lamp in the {{ui:panel.watch}} tab, then press {{ui:learn.check}}.
