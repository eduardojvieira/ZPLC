## Conditions that must come together, and conditions that are enough alone

Machines are full of rules like these: "the welder works only if the key is turned and the guard is closed", or "the crossing light turns on if a pedestrian pressed the north button or the south button". The first rule needs **both** conditions. The second needs **at least one**. In logic, the first is called **AND** and the second **OR**. In Ladder you draw them with nothing more than the position of the contacts.

## Series: AND

Contacts placed one after another on the same line are **in series**. Power must pass through every one of them to reach the coil, so the coil turns on only when **all** the contacts conduct.

A useful picture is a string of garden-hose valves. Water reaches the end only if every valve is open. Close one and the flow stops.

## Parallel: OR

When a rung splits into two paths that join again before the coil, the contacts on different paths are **in parallel**. Power only needs one path to reach the coil, so the coil turns on when **any** path conducts.

A picture for this one is two doors into the same room. You can enter by either, and it is enough that one of them is open.

Here are both ideas in one small program.

```ld-figure
src: reading/welder-and-crossing.ld.json
caption: Rung 1 is a series (AND), rung 2 is a parallel (OR)
```

Rung 1 puts KeyTurned and GuardClosed in series. Rung 2 puts NorthButton and SouthButton on two paths that join before the coil WalkRequest.

```ld-try
src: reading/welder-and-crossing.ld.json
inputs:
  - { name: KeyTurned, kind: switch }
  - { name: GuardClosed, kind: switch }
  - { name: NorthButton, kind: push }
  - { name: SouthButton, kind: push }
outputs: [Welder, WalkRequest]
caption: Try every combination of the switches and of the two buttons
```

Press Run. Switch on KeyTurned alone: the welder stays off. Switch on GuardClosed as well: it turns on. Then press NorthButton alone, SouthButton alone, and both: the walk request is on every time that at least one button is pressed.

## Truth tables

A **truth table** lists every combination of the inputs and the result for each one. With two inputs there are four combinations, because each input can be FALSE or TRUE. Here is AND, which is a series.

| A     | B     | A AND B |
| :---- | :---- | :------ |
| FALSE | FALSE | FALSE   |
| FALSE | TRUE  | FALSE   |
| TRUE  | FALSE | FALSE   |
| TRUE  | TRUE  | TRUE    |

And here is OR, which is a parallel.

| A     | B     | A OR B |
| :---- | :---- | :----- |
| FALSE | FALSE | FALSE  |
| FALSE | TRUE  | TRUE   |
| TRUE  | FALSE | TRUE   |
| TRUE  | TRUE  | TRUE   |

Look at the pattern. AND has a single TRUE, at the bottom: both inputs must be TRUE. OR has a single FALSE, at the top: both inputs must be FALSE. A good test of your program is to run it through every row of its truth table, and this is exactly what the scenario of the practice does.

## Mixing both

Series and parallel can be combined in the same rung. Power then needs to pass through a chain of groups, and each group may offer several paths. For example, "the motor runs if the guard is closed and either the manual button or the automatic signal is on" puts GuardClosed in series with a group made of two parallel paths. When you read a rung, read it from left to right and ask at each point: does power need this one, or is any of these enough?

## Common mistakes

- Putting two contacts in series when you meant "either". The result looks reasonable in one test and fails in the others, so always check every row of the table.
- Drawing the two paths but not joining them before the coil. A path that does not join is not a parallel branch.
- Mixing up the contact type. A normally closed contact in a series passes power when its variable is FALSE, so read the contact, not only the name.

> [!NOTE]
> The words AND and OR come from logic, and the same ideas appear in every programming language. Later in this course you will write the same logic as text, and the rungs will look familiar.

> [!WARNING]
> A horn or a lamp that reacts to conditions helps people notice a problem, but it is not a safety function. Protection against overheating or an open door must be built into the machine's own hardware, and it never depends on this program. ZPLC makes no safety claim.

## Check yourself

```quiz
question: A coil must turn on only when a key is turned and a guard is closed. How do you draw the two contacts?
options:
  - { text: 'In series on the same line', correct: true, feedback: Yes. Power passes only if both contacts conduct, which is AND. }
  - { text: 'In parallel on two paths', feedback: In parallel, either contact alone is enough, which is OR. }
  - { text: 'In two different rungs', feedback: Two rungs would drive the coil separately, which does not combine the conditions. }
```

```quiz
question: With a parallel of A and B driving a coil, A is FALSE and B is TRUE. What does the coil do?
options:
  - { text: 'It turns on, because one path conducts', correct: true, feedback: Yes. For OR it is enough that one path conducts. }
  - { text: 'It stays off, because A is FALSE', feedback: That would be the case in a series. In a parallel, B alone gives power a path to the coil. }
```

## What you will do in the practice

In the practice a program has a run lamp that needs two conditions together, already drawn, and a horn rung that reads only the door. You will add the second path for the overheat signal so that either condition sounds the horn. Then you will press Check, and ZPLC will run the combinations of the truth table, one at each step.
