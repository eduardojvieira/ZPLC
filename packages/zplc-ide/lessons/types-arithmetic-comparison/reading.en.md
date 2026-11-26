## Numbers and yes-or-no answers

So far most signals in your programs were ON or OFF. A machine also counts and measures: how many boxes went into a crate, how full a tank is, how many places are left in a car park. A program keeps such a number in a variable, and every variable has a **type** that says what it may hold.

| Type | What it holds           | Range                     | Example            |
| ---- | ----------------------- | ------------------------- | ------------------ |
| BOOL | a yes or a no           | FALSE or TRUE             | `Full : BOOL;`     |
| INT  | a whole number, 16 bits | −32768 to 32767           | `Cars : INT := 0;` |
| DINT | a whole number, 32 bits | about −2.1 to 2.1 billion | `Pieces : DINT;`   |

The type is written after the name when you declare the variable, and the value after `:=` is the value it starts with. A BOOL cannot hold 5, and an INT cannot hold a number above 32767.

## Arithmetic writes a new value

An **assignment** computes the expression on the right of `:=` and stores the result in the variable on the left. The operators for whole numbers are `+`, `-`, `*`, `/` and `MOD`.

```st
Level := Level + 2;
```

This line reads the value Level has now, adds 2 and stores the sum back in Level. Remember that the program runs from top to bottom on every scan: a line like this, alone, adds 2 on every scan, a hundred times a second if the controller runs a hundred scans a second. To add once per press, put it under a condition that is TRUE for one scan only, the rising edge of the input: the input is TRUE now and was FALSE on the previous scan.

Division of whole numbers gives a whole number and drops the remainder: `17 / 5` is 3. `MOD` gives that remainder: `17 MOD 5` is 2.

## A comparison answers with a BOOL

A **comparison** asks a question about numbers and answers TRUE or FALSE. Its result is a BOOL, so you can store it straight in a BOOL output.

| Operator      | Question                      | 7 compared with 10 |
| ------------- | ----------------------------- | ------------------ |
| `=`           | equal?                        | FALSE              |
| `<>`          | different?                    | TRUE               |
| `<` and `>`   | less, more?                   | TRUE, FALSE        |
| `<=` and `>=` | less or equal, more or equal? | TRUE, FALSE        |

`=` compares and `:=` stores; they are not the same sign. Three comparisons can split the number line into bands, so that exactly one of them is TRUE for every value: `Cars < 3`, `Cars = 3` and `Cars > 3` cover every number once.

## Worked example

A small yard has three parking places. A sensor at the gate gives `CarIn` while a car drives in, and another gives `CarOut` while a car drives out. A lamp `Full` must light while all three places are taken. A car may stand on a sensor for several scans.

The count is a number, so it is an INT. Each car must change it once, so the program adds and subtracts only on the rising edge of each sensor. The lamp is a question about the number, so it is a comparison.

```st
PROGRAM Yard
VAR_INPUT CarIn : BOOL; CarOut : BOOL; END_VAR
VAR_OUTPUT Full : BOOL; END_VAR
VAR
  Cars : INT := 0;
  InWas : BOOL := FALSE;
  OutWas : BOOL := FALSE;
END_VAR
IF CarIn AND NOT InWas THEN Cars := Cars + 1; END_IF;
IF CarOut AND NOT OutWas AND Cars > 0 THEN Cars := Cars - 1; END_IF;
InWas := CarIn;
OutWas := CarOut;
Full := Cars >= 3;
END_PROGRAM
```

Follow it on the diagram. Each car that drives in raises Cars by one, the third car stands on the sensor longer and still counts once, and Full rises with the third car. When a car leaves, Cars falls to 2 and the lamp goes out. The test `Cars > 0` keeps the count from going below zero if the exit sensor sees something when the yard is empty.

```timing
span: 5000
signals:
  - { name: CarIn, edges: [500, 700, 1500, 1700, 2500, 2900] }
  - { name: CarOut, edges: [3800, 4000] }
  - { name: Full, edges: [2500, 3800] }
marks:
  - { from: 500, to: 1500, label: 'Cars 1' }
  - { from: 1500, to: 2500, label: 'Cars 2' }
  - { from: 2500, to: 3800, label: 'Cars 3' }
  - { from: 3800, to: 5000, label: 'Cars 2' }
caption: One count per car, however long it stands on the sensor; Full is the answer of a comparison
```

## Common mistakes

- Adding on every scan. `Cars := Cars + 1;` without the edge condition counts the scans while the car stands on the sensor, not the cars.
- Writing `=` where you mean `:=`. The compiler refuses `Cars = Cars + 1;`: in a statement `=` only compares two values, and a value is stored only with `:=`.
- Picking the wrong comparison. `>=` is TRUE at the limit itself and `>` is not, so `Cars > 3` would never light the lamp in a yard of three places.
- Forgetting the range. An INT holds at most 32767; one more and the value is wrong, it wraps around to the negative end. A count that can grow large needs a DINT.
- Expecting a remainder from `/`. `7 / 2` is 3 with whole numbers; the half is gone.
- Dividing by a variable that can be zero. The program stops with a division error, so test the divisor first.

## Check yourself

```quiz
question: Total is 10. The program has Low := Total < 10; Exact := Total = 10; High := Total >= 10; Which outputs are TRUE?
options:
  - { text: 'Exact and High', correct: true, feedback: 'Yes. 10 >= 10 is TRUE, so High is ON together with Exact; to keep one band per value, High must be Total > 10.' }
  - { text: 'Only Exact', feedback: 'That would hold with Total > 10. A >= comparison is also TRUE at the limit.' }
  - { text: 'Only Low', feedback: '10 < 10 is FALSE: a number is not less than itself.' }
```

```quiz
question: A program holds the line Count := Count + 1; with no IF around it, and the controller runs 100 scans a second. Count starts at 0. What is Count after one second?
options:
  - { text: 'About 100', correct: true, feedback: 'Right. The line runs on every scan, and there are about 100 scans in a second.' }
  - { text: '1', feedback: 'That needs a condition that is TRUE for one scan only, such as a rising edge.' }
  - { text: '0, because nothing pressed a button', feedback: 'The line has no condition, so it adds on every scan whatever the inputs do.' }
```

## What you will do in the practice

The starting program declares the INT Total and already writes the three bands, Low, Exact and High, but nothing ever changes Total. You will make Total grow by 5 on each press of Step, however long the press lasts, and go back to 0 while Reset is TRUE. The scenario presses Step three times, the first press lasting two scans, and presses Reset at {{t:80}} ms. Then press {{ui:learn.check}}.
