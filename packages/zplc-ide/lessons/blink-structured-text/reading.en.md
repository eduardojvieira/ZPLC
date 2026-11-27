## Writing a program in Structured Text

Structured Text is a PLC language written as lines of text, much like a short recipe. A program has two parts: the **declarations**, which name every variable and give its type, and the **statements**, which run from top to bottom on every scan.

A few pieces are enough for a whole blinker:

- `:=` gives a variable a new value, and `;` ends the statement: `Lamp := TRUE;`.
- `NOT`, `AND` and `OR` combine BOOL values. `NOT A` is TRUE when A is FALSE, `A AND B` when both are TRUE, `A OR B` when at least one is.
- `IF condition THEN ... END_IF;` runs the statements inside only on the scans where the condition is TRUE.

A program never waits, so it cannot say "wait half a second". It measures time with a timer instead.

## A timer that counts while its input is on

**TON** is a timer that the language provides. You declare an **instance** of it in `VAR`, with a name of its own such as `Delay : TON;`, and you **call** the instance once on every scan with two inputs:

- **IN**, a BOOL: the timer counts while IN is TRUE, and goes back to zero as soon as IN is FALSE.
- **PT**, the preset, a TIME such as `T#2s`.

After the call, `Delay.Q` is TRUE once IN has stayed TRUE for the whole preset. It then stays TRUE for as long as IN stays TRUE, so to count the next period the program calls the timer once with IN FALSE: the clock goes back to zero and Q falls.

## Timer and memory: the blink pattern

A blinker needs one more thing, a BOOL **memory** in `VAR` that holds the state of the lamp from one scan to the next. On every scan:

1. Call the timer.
2. If its Q is TRUE, invert the memory with `NOT` and restart the timer.
3. Set the output from the memory.

To blink only while an input is on, two things must hold: the timer must not count while the input is off, and the output must be dark on the very scan the input drops, although the memory still holds its last value. How the input gives both is the decision of the practice.

## Worked example

An automatic gate has a warning beacon that must give a short flash while the gate is moving: dark for `T#800ms`, then lit for `T#200ms`, again and again, and dark as soon as the gate stops. The dark time and the lit time differ, so this beacon uses two timers instead of one timer and a memory: one timer counts the dark time, the other counts the lit time.

```st
PROGRAM GateBeacon
VAR_INPUT Moving : BOOL; END_VAR
VAR_OUTPUT Beacon : BOOL; END_VAR
VAR OffTime : TON; OnTime : TON; END_VAR
OffTime(IN := Moving AND NOT OnTime.Q, PT := T#800ms);
OnTime(IN := OffTime.Q, PT := T#200ms);
Beacon := OffTime.Q;
END_PROGRAM
```

Read it from the top. `OffTime` counts while the gate moves, and its Q lights the beacon once the dark time is over. While the beacon is lit, `OnTime` counts the lit time. When `OnTime.Q` turns TRUE, the next scan calls `OffTime` with IN FALSE, which brings it back to zero: the beacon goes dark and the dark time starts again. `OnTime.Q` in the first statement is the value of the previous scan, because `OnTime` is called after it. Each restart takes one scan, so with a scan of {{t:10}} ms the beacon is lit for {{t:210}} ms and dark for {{t:810}} ms, as the diagram shows.

```timing
span: 2800
signals:
  - { name: Moving, edges: [200, 2600] }
  - { name: Beacon, edges: [1000, 1210, 2020, 2230] }
marks:
  - { from: 200, to: 1000, label: 'T#800ms' }
  - { from: 1000, to: 1200, label: 'T#200ms' }
caption: The beacon is dark for the first preset and lit for the second, for as long as the gate moves
```

When the gate stops, the IN of `OffTime` turns FALSE, its Q falls on that same scan, and the beacon is dark at once. A blinker made of one timer and a memory, like the one of the practice, cannot rely on that: when its timer stops, the memory keeps its last value, and a lamp written from the memory alone could stay lit.

## Common mistakes

- Forgetting the initial value of the memory. The lamp shows the memory from the first scan, so the memory must start with the value the lamp must have before the first change.
- Expecting the stopped timer to darken the lamp. The timer stops when the input drops, but the memory keeps its last value, so the lamp can stay ON.
- Forgetting to restart the timer inside the IF. Q stays TRUE, so the memory flips on every scan and the lamp blinks far too fast.
- Giving the time of a full blink as the preset. The preset is the time of one state, on or off; a full blink lasts two presets.
- Calling the timer only inside an IF. An instance that is not called does not count.

## Check yourself

```quiz
question: In the gate beacon of the worked example, the gate stops while the beacon is lit. What does Beacon do?
options:
  - { text: 'It goes dark on that same scan', correct: true, feedback: 'Yes. Moving turns FALSE, OffTime is called with IN FALSE, its Q falls at once, and Beacon copies it.' }
  - { text: 'It stays lit until OnTime has counted its preset', feedback: 'OnTime only decides when OffTime restarts. Beacon copies OffTime.Q, which falls as soon as its IN does.' }
  - { text: 'It stays lit, because a memory holds it', feedback: 'This beacon has no memory: it is made of two timers, and Beacon copies one of them.' }
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
