## Conditions that must come together, and conditions that are enough alone

Machines are full of rules like these: "the welder works only if the key is turned and the guard is closed", or "the crossing light turns on if a pedestrian pressed the north button or the south button". The first rule needs **both** conditions. The second needs **at least one**. In logic, the first is called **AND** and the second **OR**. In Ladder you draw them with nothing more than the position of the contacts.

## Series: AND

Contacts placed one after another on the same line are **in series**. Power must pass through every one of them to reach the coil, so the coil turns on only when **all** the contacts conduct.

A useful picture is a string of garden-hose valves. Water reaches the end only if every valve is open. Close one and the flow stops.

## Parallel: OR

When a rung splits into two paths that join again before the coil, the contacts on different paths are **in parallel**. Power only needs one path to reach the coil, so the coil turns on when **any** path conducts.

A picture for this one is two doors into the same room. You can enter by either, and it is enough that one of them is open.

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

## Worked example

An air compressor fills a tank. It runs while its RunSwitch is on and the pressure switch HighPressure has not tripped: both conditions, so the two contacts go in series, and HighPressure gets a normally closed contact because the compressor must run while it is FALSE. An alarm lamp lights when the pressure is too high or when the oil level switch OilOK says the oil is low: either is enough, so the two contacts go in parallel. OilOK is TRUE while there is enough oil, so the alarm path asks the opposite question with a normally closed contact.

```ld-figure
src: reading/compressor.ld.json
caption: Rung 1 is a series (AND), rung 2 is a parallel (OR), each with a normally closed contact
```

Rung 1 puts RunSwitch and HighPressure in series before the coil Compressor. Rung 2 puts HighPressure and OilOK on two paths that join before the coil AlarmLamp. The same variable, HighPressure, appears in both rungs with opposite contacts.

```ld-try
src: reading/compressor.ld.json
inputs:
  - { name: RunSwitch, kind: switch }
  - { name: HighPressure, kind: switch }
  - { name: OilOK, kind: switch }
outputs: [Compressor, AlarmLamp]
caption: Try every combination of the three switches
```

Press Run and walk through the truth tables. At first OilOK is FALSE, so the alarm lamp is on: switch OilOK on and it goes off. Switch RunSwitch on: the compressor runs. Switch HighPressure on: the compressor stops and the alarm lamp lights. Then switch HighPressure off and OilOK off: the compressor runs again, and the lamp lights for the oil.

## Common mistakes

- Putting two contacts in series when you meant "either". The result looks reasonable in one test and fails in the others, so always check every row of the table.
- Drawing the two paths but not joining them before the coil. A path that does not join is not a parallel branch.
- Mixing up the contact type. A normally closed contact in a series passes power when its variable is FALSE, so read the contact, not only the name.

> [!WARNING]
> A horn or a lamp that reacts to conditions helps people notice a problem, but it is not a safety function. Protection against overheating or an open door must be built into the machine's own hardware, and it never depends on this program.

## Check yourself

```quiz
question: A coil must turn on only when a key is turned and a guard is closed. How do you draw the two contacts?
options:
  - { text: 'In series on the same line', correct: true, feedback: 'Yes. Power passes only if both contacts conduct, which is AND.' }
  - { text: 'In parallel on two paths', feedback: 'In parallel, either contact alone is enough, which is OR.' }
  - { text: 'In two different rungs', feedback: 'Two rungs would drive the coil separately, which does not combine the conditions.' }
```

```quiz
question: With a parallel of A and B driving a coil, A is FALSE and B is TRUE. What does the coil do?
options:
  - { text: 'It turns on, because one path conducts', correct: true, feedback: 'Yes. For OR it is enough that one path conducts.' }
  - { text: 'It stays off, because A is FALSE', feedback: 'That would be the case in a series. In a parallel, B alone gives power a path to the coil.' }
  - { text: 'It turns on only when A turns TRUE as well', feedback: 'That is AND. A parallel is OR: one TRUE path is enough.' }
```

## What you will do in the practice

The starting program has a run lamp that needs two conditions together, already drawn, and a horn rung that reads only the door, so the horn stays silent when the machine overheats. You will make the horn sound when the door is open, when the machine overheats, or both. Then you will press {{ui:learn.check}}, and ZPLC will run the combinations of the truth table, one at each step.
