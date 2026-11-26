## Writing a program in Structured Text

Structured Text is a PLC language written as lines of text, much like a short recipe. A program has two parts: the **declarations**, which name every variable and give its type, and the **statements**, which run from top to bottom on every scan.

A few pieces are enough for a whole blinker:

- `:=` gives a variable a new value, and `;` ends the statement: `Lamp := TRUE;`.
- `NOT`, `AND` and `OR` combine BOOL values. `NOT A` is TRUE when A is FALSE, `A AND B` when both are TRUE, `A OR B` when at least one is.
- `IF condition THEN ... END_IF;` runs the statements inside only on the scans where the condition is TRUE.

A program never waits, so it cannot say "wait half a second". It measures time with a timer instead.

## A timer that counts while its input is on

**TON** is a timer that the language provides. You declare an **instance** of it in `VAR`, with a name of its own such as `Clock : TON;`, and you **call** the instance once on every scan with two inputs:

- **IN**, a BOOL: the timer counts while IN is TRUE, and goes back to zero as soon as IN is FALSE.
- **PT**, the preset, a TIME such as `T#300ms`.

After the call, `Clock.Q` is TRUE once IN has stayed TRUE for the whole preset. It then stays TRUE for as long as IN stays TRUE, so to count the next period the program calls the timer once with IN FALSE: the clock goes back to zero and Q falls.

## Timer and memory: the blink pattern

A blinker needs one more thing, a BOOL **memory** in `VAR` that holds the state of the lamp from one scan to the next. On every scan:

1. Call the timer.
2. If its Q is TRUE, invert the memory with `NOT` and restart the timer.
3. Set the output from the memory.

To blink only while an input is on, that input does two jobs: it is the IN of the timer, so the timer counts only while the input is on, and it is part of the output with `AND`, so the output goes off on the scan in which the input drops.

## Worked example

An automatic gate has a warning beacon that must flash while the gate is moving, changing state every `T#400ms`, and must be dark at once when the gate stops. The input is `Moving`, the output is `Beacon`.

```st
PROGRAM GateBeacon
VAR_INPUT Moving : BOOL; END_VAR
VAR_OUTPUT Beacon : BOOL; END_VAR
VAR Flash : TON; BeaconOn : BOOL := FALSE; END_VAR
Flash(IN := Moving, PT := T#400ms);
IF Flash.Q THEN BeaconOn := NOT BeaconOn; Flash(IN := FALSE, PT := T#400ms); END_IF;
Beacon := BeaconOn AND Moving;
END_PROGRAM
```

The first statement counts only while the gate moves. Each time the preset is over, the `IF` flips `BeaconOn` and calls `Flash` once with IN FALSE to start a new count. The last statement shows the memory, but only while `Moving` is TRUE, so the beacon is dark on the very scan the gate stops, whatever state `BeaconOn` was left in.

```timing
span: 2000
signals:
  - { name: Moving, edges: [200, 1700] }
  - { name: Beacon, edges: [600, 1000, 1400, 1700] }
marks:
  - { from: 200, to: 600, label: 'T#400ms' }
  - { from: 600, to: 1000, label: 'T#400ms' }
caption: The beacon changes every preset while the gate moves and goes dark when it stops
```

The first change comes one preset after the gate starts, not one preset after the program started, because the timer counts only while `Moving` is TRUE. On a real scan the restart takes one scan, so each period is a scan longer than the preset.

## Common mistakes

- Running the timer with IN := TRUE. The lamp then blinks from the moment the program starts, whatever the input says.
- Leaving the input out of the output. The timer stops when the input drops, but the memory keeps its last value, so the lamp can stay ON.
- Forgetting to restart the timer inside the IF. Q stays TRUE, so the memory flips on every scan and the lamp blinks far too fast.
- Writing a preset that is not the one asked: `T#250ms` changes the lamp too often for a scenario that expects `T#300ms`.
- Calling the timer only inside an IF. An instance that is not called does not count.

## Check yourself

```quiz
question: A blinker ends with Lamp := LampOn; instead of Lamp := LampOn AND Enable;. Enable drops while LampOn is TRUE. What does Lamp do?
options:
  - { text: 'It stays ON, because nothing changes LampOn any more', correct: true, feedback: 'Yes. The timer stops counting, LampOn keeps its last value, and Lamp copies it.' }
  - { text: 'It goes OFF at once', feedback: 'Nothing in that program turns Lamp off when Enable drops. That is the job of AND Enable.' }
  - { text: 'It keeps blinking', feedback: 'The timer counts only while Enable is TRUE, so LampOn no longer changes.' }
```

```quiz
question: Why does the IF call the timer once with IN := FALSE after inverting the memory?
options:
  - { text: 'To bring its clock back to zero, so it counts the next period', correct: true, feedback: 'Right. Without the restart Q stays TRUE and the memory flips on every scan.' }
  - { text: 'To switch the lamp off', feedback: 'The lamp follows the memory, not the timer.' }
  - { text: 'Because a timer must be called twice in every scan', feedback: 'A timer is called once per scan; the second call is only for the restart.' }
```

## What you will do in the practice

The starting program declares the timer Clock and the memory LampOn and holds Lamp OFF. You will write the statements that make Lamp change state every {{t:300}} ms while Enable is ON and keep Lamp OFF while Enable is OFF. Enable turns ON at {{t:100}} ms and OFF at {{t:1150}} ms. Then press {{ui:learn.check}}.
