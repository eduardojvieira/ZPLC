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

- Write `R` last, and the reset wins.
- Write `S` last, and the set wins.

The SR and RS blocks fix that choice inside the block; with `S` and `R` it is the order of your lines.

## Worked example

A cold room has a door switch, `DoorOpen`. Whenever the door has been opened, the lamp `DoorWasOpen` must stay on until the warehouse keeper has checked the room and pressed the push button `Checked`. The keeper's check must win: if the keeper presses `Checked` while the door is still open, the lamp goes off for as long as the push button is held.

The reset must win, so its lines come last:

```il
PROGRAM ColdRoom
VAR_INPUT
    DoorOpen : BOOL;
    Checked : BOOL;
END_VAR
VAR_OUTPUT
    DoorWasOpen : BOOL;
END_VAR

        LD    DoorOpen
        S     DoorWasOpen
        LD    Checked
        R     DoorWasOpen
END_PROGRAM
```

Each `LD` loads the condition of the instruction below it. Follow it on the diagram. The door opens and closes, and the lamp stays on. `Checked` turns it off. Later the door opens again and `Checked` is pressed in the same scan: the lamp stays off while both are TRUE, and turns on as soon as `Checked` is released, because the door is still open.

```timing
span: 5000
signals:
  - { name: DoorOpen, edges: [500, 1000, 3000, 4000] }
  - { name: Checked, edges: [2000, 2300, 3000, 3500] }
  - { name: DoorWasOpen, edges: [500, 2000, 3500] }
caption: The reset written last wins while both are TRUE; the open door sets the lamp again once Checked is released
```

Swap the two pairs of lines, `LD Checked` and `R` first, `LD DoorOpen` and `S` last, and the open door would win instead.

## Common mistakes

- Using `ST` instead of `S`. `ST` writes the current result on every scan, so the output follows the signal and forgets it.
- Writing `S` and never `R`. Nothing ever turns the output off again.
- Putting the lines in the wrong order. Both orders give the same output in most scans; they differ only when the set and the reset arrive together.
- Forgetting the `LD` before the second instruction. `R` then acts on the result the first `LD` loaded, so the fault that sets the output also resets it.

> [!WARNING]
> A latch in a program remembers an alarm; it does not protect anyone. A stop that protects people is wired in hardware and never waits for a program to remember it.

## Check yourself

```quiz
question: A program has LD Fault, S Alarm, LD Ack, R Alarm in that order. In one scan Fault and Ack are both TRUE. What is Alarm at the end of the scan?
options:
  - { text: 'FALSE', correct: true, feedback: 'Yes. Both lines write Alarm, and R Alarm runs last, so the reset wins.' }
  - { text: 'TRUE', feedback: 'S Alarm runs first and makes it TRUE, but R Alarm runs after it in the same scan.' }
  - { text: 'It keeps the value of the previous scan', feedback: 'That happens only when both conditions are FALSE. Here both instructions write Alarm.' }
```

```quiz
question: A program has LD Fault followed by ST Alarm. The fault lasts one scan. What does Alarm do after that scan?
options:
  - { text: 'It turns FALSE on the next scan', correct: true, feedback: 'Right. ST writes the current result on every scan, so Alarm follows Fault. Use S to keep it.' }
  - { text: 'It stays TRUE until Ack', feedback: 'That is what S and R do. ST has no memory of its own.' }
  - { text: 'It stays TRUE for ever', feedback: 'ST writes FALSE as soon as Fault is FALSE.' }
```

## What you will do in the practice

The starting program loads Fault and stores it in both outputs with `ST`, so the alarms vanish with the fault. You will make SetFirst and ResetFirst stay ON after the fault that starts at {{t:10}} ms, until Ack at {{t:30}} ms, and make them differ when Fault and Ack arrive together at {{t:50}} ms: SetFirst stays ON and ResetFirst goes OFF. Then press {{ui:learn.check}}.
