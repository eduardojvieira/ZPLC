## Timers in Instruction List

A PLC program never waits: every scan it reads the inputs, works out the outputs and starts again. A **timer** gives a program time without stopping it. It is a function block with a clock inside; on every scan you give it the newest value of its input, and it answers with an output.

There are two timers you will use in almost every program, and they are mirror images.

- **TON**, the **on-delay timer**, delays the rise. When IN turns on, the clock starts, and Q turns on only when IN has stayed on for the whole preset. If IN falls earlier, the clock goes back to zero. When IN falls, Q falls at once.
- **TOF**, the **off-delay timer**, delays the fall. When IN turns on, Q turns on at once. When IN falls, the clock starts, and Q stays on until the preset is over. If IN comes back first, Q never falls.

```timing
span: 5000
signals:
  - { name: IN, edges: [1000, 3000] }
  - { name: TON.Q, edges: [2000, 3000] }
  - { name: TOF.Q, edges: [1000, 4000] }
marks:
  - { from: 1000, to: 2000, label: PT }
  - { from: 3000, to: 4000, label: PT }
caption: The same input fed to a TON and to a TOF with the same preset
```

One question picks the timer: must the output wait before it turns on (TON), or stay on after its input is gone (TOF)?

## CAL runs the timer, LD reads it

A timer is an instance, declared in `VAR` with a name of its own, as `FanRunOn : TOF;`. Its inputs are **IN**, the BOOL it watches, and **PT**, the preset, a TIME written with `T#`, such as `T#300ms` or `T#4s`. Its outputs are **Q**, the BOOL answer, and **ET**, the time counted so far.

In Instruction List each line works on the current result: LD loads a value into it and ST stores it. A function block does not fit on one such line, so **CAL** calls the instance with its inputs, named with `:=`:

```il
        CAL   FanRunOn(IN := Motor, PT := T#4s)
```

After the CAL, `LD FanRunOn.Q` loads Q into the current result and an ST stores it in an output. The lines run from top to bottom, so a line above the CAL reads the Q of the previous scan. In IL a TON and a TOF are called the same way: the declaration decides which one you get.

## Worked example

An air compressor starts when its pressure switch, `PressureLow`, reports low pressure. The switch flickers when air is drawn in short bursts, so the motor must start only when `PressureLow` has stayed on for `T#1s`. Its cooling fan must keep running for `T#4s` after the motor stops.

"Wait before turning on" is a TON on the switch; "stay on after" is a TOF on the motor. Each timer has its own CAL, its own LD and its own ST.

```il
PROGRAM Compressor
VAR_INPUT
    PressureLow : BOOL;
END_VAR
VAR_OUTPUT
    Motor : BOOL;
    Fan : BOOL;
END_VAR
VAR
    StartDelay : TON;
    FanRunOn : TOF;
END_VAR

        CAL   StartDelay(IN := PressureLow, PT := T#1s)
        LD    StartDelay.Q
        ST    Motor
        CAL   FanRunOn(IN := Motor, PT := T#4s)
        LD    FanRunOn.Q
        ST    Fan
END_PROGRAM
```

The first flicker of the switch is too short, and the motor does not start. The second time the switch stays on, the motor starts after the preset, and the fan with it. When the switch falls, the motor stops at once, and the fan runs on for its own preset. The second CAL comes after the ST of Motor, so the fan timer sees the motor of this scan.

```timing
span: 12000
signals:
  - { name: PressureLow, edges: [500, 800, 2000, 6000] }
  - { name: Motor, edges: [3000, 6000] }
  - { name: Fan, edges: [3000, 10000] }
marks:
  - { from: 2000, to: 3000, label: 'T#1s' }
  - { from: 6000, to: 10000, label: 'T#4s' }
caption: The flicker never starts the motor; the fan runs on after the motor stops
```

## Common mistakes

- Declaring the timer and never calling it. Without a CAL the clock never moves and Q stays FALSE.
- Putting the LD of Q above the CAL. The output then comes from the previous scan, one scan late.
- Leaving PT out of the CAL. The preset is then zero, and the timer delays nothing.
- Writing the wrong unit: `T#300s` is five minutes, not a third of a second.
- Calling one instance twice in a scan with different inputs. Each delay needs its own instance.

## Check yourself

```quiz
question: A program declares Delay as a TOF and has CAL Delay(IN := Door, PT := T#2s), then LD Delay.Q and ST Lamp. Door turns on for one second and turns off. What does Lamp do?
options:
  - { text: 'It turns on at once and goes off two seconds after Door falls', correct: true, feedback: 'Yes. A TOF passes the rise at once and delays the fall by its preset.' }
  - { text: 'It never turns on, because Door was on for less than the preset', feedback: 'That is what a TON would do. The declaration says TOF.' }
  - { text: 'It goes off as soon as Door falls', feedback: 'Then there would be no timer at all. A TOF keeps Q on for the preset after IN falls.' }
```

```quiz
question: A program calls a TON with CAL Filter(IN := Sensor), without PT. What does the Q of Filter do when Sensor turns on?
options:
  - { text: 'It turns on at once', correct: true, feedback: 'Right. Without PT the preset is zero, so the delay is over as soon as it starts.' }
  - { text: 'It never turns on', feedback: 'The clock reaches a preset of zero at once, so Q does turn on.' }
  - { text: 'It turns on after one second', feedback: 'A timer has no preset of its own; the only time it counts is the one given to PT.' }
```

## What you will do in the practice

The starting program declares two timers, HoldTimer (TOF) and FilterTimer (TON), but loads each input and stores it straight in its output. You will make Light stay on after Button is released, and make Confirmed ignore the short Sensor blip that starts at {{t:100}} ms but believe Sensor when it stays on from {{t:500}} ms. Then press {{ui:learn.check}}.
