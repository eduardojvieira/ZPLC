## One IF, several ways out

An `IF` runs its statements only on the scans where its condition is TRUE. When a program has to pick one case out of several, one `IF` can hold all of them:

```st
IF First THEN
    ...
ELSIF Second THEN
    ...
ELSE
    ...
END_IF;
```

The program tests the conditions from the top and runs only the statements of the first branch whose condition is TRUE. It then jumps to `END_IF`, and the conditions below it are not looked at. `ELSE`, if it is there, runs when no condition was TRUE. `ELSIF` and `ELSE` are both optional, and a single `IF` may hold as many `ELSIF` branches as it needs.

So the order of the branches matters when two conditions can be TRUE on the same scan: the upper one wins.

## A variable is written only where a statement writes it

A statement writes a variable only on the scans in which it runs. When a scan runs no statement that writes a variable, the variable keeps the value it had at the end of the scan before. An output is no exception: it holds its last value until a statement gives it another.

For an `IF`, this means that an output written in only one branch is written only on the scans in which that branch runs. On all the other scans it keeps whatever it held. Sometimes that is what the machine needs, and sometimes it is a trap.

## Worked example

A greenhouse has two temperature switches: `TooCold` is TRUE while the air is below the lower limit, and `TooHot` is TRUE while it is above the upper limit. Between the two limits both are FALSE. The heater must come on when the air is too cold and go off when it is too hot. Between the limits it must do whatever it was doing, so that it does not switch on and off at every small change around one limit.

```st
PROGRAM Heater
VAR_INPUT TooCold : BOOL; TooHot : BOOL; END_VAR
VAR_OUTPUT HeaterOn : BOOL; END_VAR
IF TooCold THEN
    HeaterOn := TRUE;
ELSIF TooHot THEN
    HeaterOn := FALSE;
END_IF;
END_PROGRAM
```

There is no branch for the air between the limits, and that is on purpose. On those scans no statement writes `HeaterOn`, so it keeps its value. ZPLC ran this program against a scenario: the air is between the limits at the start, too cold from {{t:200}} ms to {{t:400}} ms, between the limits from {{t:400}} ms to {{t:600}} ms, and too hot from {{t:600}} ms to {{t:800}} ms. `HeaterOn` was OFF at the start, came ON on the scan in which `TooCold` came ON, stayed ON after `TooCold` went OFF, and went OFF at {{t:600}} ms, when `TooHot` came ON.

```timing
span: 1000
signals:
  - { name: TooCold, edges: [200, 400] }
  - { name: TooHot, edges: [600, 800] }
  - { name: HeaterOn, edges: [200, 600] }
caption: The heater keeps its value while both switches are OFF
```

A second run shows the order of the branches. When both switches were TRUE on the same scan, with the heater OFF, `HeaterOn` came ON, because the branch for `TooCold` comes first. When only `TooHot` was TRUE it went OFF again.

## Common mistakes

- Expecting two branches to run on the same scan. Only the first branch whose condition is TRUE runs.
- Putting the more general condition first. If the upper branch also holds in the cases of the lower ones, the lower ones never run.
- Expecting an output to be OFF because its branch did not run. A branch that does not run writes nothing.

## Check yourself

```quiz
question: In the heater of the worked example, the air goes from too cold to between the limits. What does HeaterOn do?
options:
  - { text: 'It stays ON', correct: true, feedback: 'Yes. No branch runs between the limits, so no statement writes HeaterOn and it keeps its value. In the run it stayed ON from {{t:200}} ms until TooHot came ON at {{t:600}} ms.' }
  - { text: 'It goes OFF, because TooCold is now FALSE', feedback: 'TooCold being FALSE only means that the first branch does not run. Nothing writes HeaterOn on that scan, so it keeps ON.' }
  - { text: 'It is undefined until the next limit is crossed', feedback: 'It is not undefined: it holds the value it had on the scan before.' }
```

```quiz
question: TooCold and TooHot are both TRUE on the same scan. Which branch of the heater runs?
options:
  - { text: 'Only the first, so HeaterOn is TRUE', correct: true, feedback: 'Right. The conditions are tested from the top and the program leaves the IF after the first TRUE one. The run showed HeaterOn ON in this case.' }
  - { text: 'Both, one after the other', feedback: 'Only one branch of an IF runs on a scan.' }
  - { text: 'Only the second, so HeaterOn is FALSE', feedback: 'The upper branch is tested first and ends the IF.' }
```

## What you will do in the practice

A tank has two level switches, and three lamps show its state. The starting program already holds an `IF` with two `ELSIF` branches, and it turns one lamp ON in each branch. You will make the program show exactly one lamp at every moment of the scenario, then press {{ui:learn.check}}. The water moves between the marks and past them eight times in {{t:900}} ms.
