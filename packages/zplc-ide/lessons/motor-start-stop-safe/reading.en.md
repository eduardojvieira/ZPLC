## One way to start, many ways to stop

Most motors of a machine are started and stopped by a person at a panel. The operator presses Start, lets go, and the motor keeps running; later the operator presses Stop and it stops. Between the two, other things can stop it too: an emergency stop, or the overload relay, which trips when the motor draws too much current for too long, for example because something jams it.

A start-stop program answers three questions, and this page takes them one at a time:

- How does the motor keep running after Start is released?
- Which signal wins when a start and a stop arrive together?
- What must happen when a stop ends while Start is still held?

## The seal-in holds the motor on

A push button is TRUE only while a finger holds it. If the output copied the start push button, the motor would stop as soon as the operator lets go. So the output must hold itself on: it is ON when the start push button is pressed, or when it was already ON, and as long as no stop is TRUE. An output written this way appears in its own condition, and that is what keeps it on after the finger is gone. This form is a **seal-in**.

## The stop always wins

When a start and a stop are TRUE in the same scan, the stop must win. In a seal-in every stop is joined with AND NOT, so a pressed stop push button, an emergency stop or a tripped overload makes the whole condition FALSE, whatever the start push button is doing. Written with IF statements, the same rule means testing the stops first: the first condition that is TRUE runs its branch, and the others are not even looked at.

A program in which the start wins would keep a jammed motor running as long as someone holds the start push button. A stop must never lose to a start.

## A machine must not start by itself

Suppose the operator holds the start push button, or the push button sticks, while the emergency stop is pressed. When the emergency stop is released, the start push button is still TRUE, and a plain seal-in turns the motor on again on the next scan, with nobody asking for it. The same happens when the program starts with the start push button already held.

A machine that starts by itself surprises the person in front of it. The rule is: **after any stop, and when the program starts, a start needs a new press.** The start push button must be seen released before a press counts.

## Worked example

A workshop has a dust extraction fan with two push buttons, `FanStart` and `FanStop`, and a switch on its filter door, `FilterDoorOpen`, that is TRUE while the door is open. Opening the door must stop the fan. The classic seal-in does the first two jobs of this page in one line:

```st
PROGRAM Extractor
VAR_INPUT FanStart : BOOL; FanStop : BOOL; FilterDoorOpen : BOOL; END_VAR
VAR_OUTPUT Fan : BOOL; END_VAR
VAR FanOn : BOOL; END_VAR
FanOn := (FanStart OR FanOn) AND NOT FanStop AND NOT FilterDoorOpen;
Fan := FanOn;
END_PROGRAM
```

Read the assignment from the left. `FanStart OR FanOn` stays TRUE after the push button is released, because FanOn holds itself. Each `AND NOT` breaks the hold as soon as its stop is TRUE, and it wins when a start arrives in the same scan.

Now follow the diagram, where the operator holds `FanStart` while someone presses `FanStop`. The fan stops, but as soon as `FanStop` is released, `FanStart` is still TRUE and the seal-in turns the fan on again by itself.

```timing
span: 5000
signals:
  - { name: FanStart, edges: [500, 800, 2000, 3200, 3800, 4100] }
  - { name: FanStop, edges: [2400, 2700] }
  - { name: Fan, edges: [500, 2400, 2700] }
caption: The plain seal-in restarts the fan when the stop ends while FanStart is still held
```

That is the one thing a seal-in alone cannot do: it does not know whether the start push button was released since the last stop. A program that follows the rule of a new press needs a second BOOL memory that remembers exactly that, cleared by every stop and at start-up, so that a press counts only once the push button has been let go. The practice asks for this rule.

## Common mistakes

- Driving the output straight from Start. The motor runs only while the push button is held.
- Testing Start before the stops. A start then wins over a stop that arrives in the same scan.
- Forgetting one of the stops. Every signal that must stop the motor appears in the stop condition, the overload as much as the push button.
- Letting a held Start restart the motor when a stop ends, or when the program starts. A start needs a new press after every stop.
- Setting the output in one branch and never clearing it. The output is written from the memory on every scan, so it follows every change.

> [!WARNING]
> A program that drops a motor on its stop inputs is good practice, but it is not what protects people. On a real machine a stop push button and an emergency stop are wired normally closed, so that a broken wire reads as a stop, and the emergency stop cuts the power of the motor in hardware, whatever the program does.

## Check yourself

```quiz
question: The motor runs. The operator keeps holding Start while someone presses EStop, then EStop is released and Start is still held. What should Forward do?
options:
  - { text: 'Stay OFF until Start is released and pressed again', correct: true, feedback: 'Yes. After a stop, a start needs a new press, so a held Start must not restart the motor.' }
  - { text: 'Turn ON as soon as EStop is released', feedback: 'That is the motor starting by itself, with nobody asking for it. A start counts only after Start was seen released.' }
  - { text: 'Stay ON all the time, because Start is held', feedback: 'EStop is a stop, and a stop always wins over a start.' }
```

```quiz
question: A program writes IF FanStart THEN FanOn := TRUE; ELSIF FanStop THEN FanOn := FALSE; END_IF; and in one scan FanStart and FanStop are both TRUE. What is FanOn at the end of the scan?
options:
  - { text: 'TRUE, because the first branch that is TRUE runs and the other is not looked at', correct: true, feedback: 'Right. Here FanStart wins, which is the wrong way round: test the stops first.' }
  - { text: 'FALSE, because FanStop is written last', feedback: 'In an IF ... ELSIF only the first TRUE branch runs. FanStop is never looked at in this scan.' }
  - { text: 'It keeps the value of the previous scan', feedback: 'FanStart is TRUE, so the first branch runs and writes FanOn.' }
```

## What you will do in the practice

The starting program declares the inputs Start, Stop, EStop and Overload and the outputs Forward and Reverse, and copies Start to Forward. You will make Forward stay ON after a press of Start, go OFF on EStop at {{t:40}} ms, on Overload at {{t:90}} ms and on Stop at {{t:140}} ms, and come back only after a new press, never while Start is still held, not even at {{t:0}} ms, when the program starts with Start held. Reverse stays FALSE. Declare the memories you need in `VAR`, then press {{ui:learn.check}}.
