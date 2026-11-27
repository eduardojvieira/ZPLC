## A latch in Instruction List

A latch is a memory that one signal turns ON and another turns OFF. To **set** it is to turn it ON, and it stays ON when the signal that set it is gone; to **reset** it is to turn it OFF, and it stays OFF until something sets it again. An alarm is the classic case: the fault sets it, the acknowledge resets it, and the lamp stays on in between.

Every latch must also answer one question: when the set and the reset are both TRUE in the same scan, which one wins? That answer is a design decision, and Instruction List lets you write it with the order of your lines.

## S and R act only when the result is TRUE

An Instruction List program works on one value, the **current result**. `LD` loads a value into it; the instructions after it use it. Two instructions turn the current result into a memory:

- `S X` sets X to TRUE when the current result is TRUE. When it is FALSE, `S` does nothing.
- `R X` sets X to FALSE when the current result is TRUE. When it is FALSE, `R` does nothing.

Doing nothing is what makes the memory. `ST X` writes the current result into X on every scan, TRUE or FALSE, so X follows the signal. `S` and `R` write only when their condition is TRUE, so X keeps its value in every other scan.

## The line written last wins

The lines of a program run from top to bottom on every scan. If the set and the reset are both TRUE, both instructions write X in the same scan, one after the other, and the one written last decides what X is at the end of the scan.

With `S` and `R`, the order of your lines is the whole decision: nothing else in the program says which one wins.

## Worked example

A packaging machine runs on compressed air. A pressure switch, `AirOK`, is TRUE while the air pressure is fine; it is wired so that a lost pressure and a broken wire both read FALSE. Whenever the air is lost while the machine is switched on (`MachineOn`), the lamp `AirLost` must stay on until the operator presses the push button `ResetAir`. If the air is still missing when the operator presses `ResetAir`, the lamp must stay on: the set must win, so its lines come last.

```il
PROGRAM AirSupply
VAR_INPUT
    AirOK : BOOL;
    MachineOn : BOOL;
    ResetAir : BOOL;
END_VAR
VAR_OUTPUT
    AirLost : BOOL;
END_VAR

        LD    ResetAir
        R     AirLost
        LDN   AirOK
        AND   MachineOn
        S     AirLost
END_PROGRAM
```

Each load opens the condition of the instruction below it. The set condition has two parts: `LDN` loads the opposite of `AirOK`, because the lamp must react to the pressure being lost, and `AND` adds the machine being on. Follow it on the diagram, with the machine switched on all along. The air drops out for a moment, and the lamp stays on after it comes back. `ResetAir` turns it off. Later the air is lost again in the same scan in which `ResetAir` is pressed: the lamp turns on and stays on, because the set is written last.

```timing
span: 5000
signals:
  - { name: AirOK, edges: [0, 500, 1000, 3500, 4000] }
  - { name: ResetAir, edges: [2000, 2300, 3500, 3800] }
  - { name: AirLost, edges: [500, 2000, 3500] }
caption: The set written last wins while both are TRUE; MachineOn is TRUE all along
```

## Common mistakes

- Using `ST` instead of `S`. `ST` writes the current result on every scan, so the output follows the signal and forgets it.
- Writing `S` and never `R`. Nothing ever turns the output off again.
- Putting the lines in the wrong order. Both orders give the same output in most scans; they differ only when the set and the reset arrive together.
- Forgetting the `LD` before the second instruction. `R` then acts on the result the first `LD` loaded, so the fault that sets the output also resets it.

> [!WARNING]
> A latch in a program remembers an alarm; it does not protect anyone. A stop that protects people is wired in hardware and never waits for a program to remember it.

## Check yourself

```quiz
question: The air program has LD ResetAir, R AirLost, LDN AirOK, AND MachineOn, S AirLost in that order. In one scan ResetAir is TRUE, AirOK is FALSE and MachineOn is TRUE. What is AirLost at the end of the scan?
options:
  - { text: 'TRUE', correct: true, feedback: 'Yes. Both instructions write AirLost, and S AirLost runs last, so the set wins.' }
  - { text: 'FALSE', feedback: 'R AirLost runs first and makes it FALSE, but S AirLost runs after it in the same scan.' }
  - { text: 'It keeps the value of the previous scan', feedback: 'That happens only when both conditions are FALSE. Here both instructions write AirLost.' }
```

```quiz
question: A version of the air program has LDN AirOK followed by ST AirLost. The air is lost for one scan. What does AirLost do after that scan?
options:
  - { text: 'It turns FALSE on the next scan', correct: true, feedback: 'Right. ST writes the current result on every scan, so AirLost follows the pressure switch. Use S to keep it.' }
  - { text: 'It stays TRUE until ResetAir', feedback: 'That is what S and R do. ST has no memory of its own.' }
  - { text: 'It stays TRUE for ever', feedback: 'ST writes FALSE as soon as AirOK is TRUE again.' }
```

## What you will do in the practice

The starting program loads Fault and stores it in both outputs with `ST`, so the alarms vanish with the fault. You will make SetFirst and ResetFirst stay ON after the fault that starts at {{t:10}} ms, until Ack at {{t:30}} ms, and make them differ when Fault and Ack arrive together at {{t:50}} ms: SetFirst stays ON and ResetFirst goes OFF. Then press {{ui:learn.check}}.
