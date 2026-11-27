## A signal that must be remembered

Many signals of a machine last only a moment. A fault flickers ON and goes away, a push button is TRUE only while a finger holds it, a sensor sees a part for a few milliseconds. Yet the machine often has to remember that the moment happened: an alarm lamp must stay on after the fault is gone, until someone has seen it and pressed Acknowledge.

A program cannot copy such a signal to its output. `Alarm := Fault;` turns the lamp off on the first scan after the fault goes away, and an operator who looks away for a second never knows it was there. The program needs a **memory** that one signal turns on and another turns off.

## Set and reset

Two words name the two halves of that memory.

- To **set** is to turn the memory ON. Once set, it stays ON even when the signal that set it is gone.
- To **reset** is to turn the memory OFF. Once reset, it stays OFF until something sets it again.

A memory that works this way is called a **latch**, or a bistable: it has two stable states and stays in the last one it was given. In an alarm, the fault sets the latch and the acknowledge resets it.

There is one hard question every latch must answer: what happens when the set and the reset are both TRUE in the same scan? A fault that comes back at the very moment the operator presses Acknowledge is not a rare case on a real machine. The answer is not a detail of the program, it is a decision of the person who designs it.

## SR and RS: the block decides who wins

Structured Text has two latch blocks, and they differ only in that answer. Each is a function block, so you declare an **instance** of it in `VAR` and call that instance once on every scan:

```st
VAR
  Overfill : SR;
END_VAR
```

- **SR** is the **set-dominant** latch. Its inputs are **S1** (set) and **R** (reset). When both are TRUE, the set wins and Q1 is TRUE.
- **RS** is the **reset-dominant** latch. Its inputs are **S** (set) and **R1** (reset). When both are TRUE, the reset wins and Q1 is FALSE.
- Both have one output, **Q1**, the state of the memory. You read it after the call, as `Overfill.Q1`.

The figure 1 in an input name marks the input that wins. A call names each input with `:=`, as in `Overfill(S1 := LevelHigh AND ValveOpen, R := Drained);`.

The timing diagram shows both blocks fed with the same two signals. Time runs to the right; a line is up while its signal is ON. Watch the moment when S and R rise together.

```timing
span: 5500
signals:
  - { name: S, edges: [1000, 1500, 4000, 4500] }
  - { name: R, edges: [2500, 3000, 4000, 4500] }
  - { name: SR.Q1, edges: [1000, 2500, 4000] }
  - { name: RS.Q1, edges: [1000, 2500] }
caption: The same set and reset fed to an SR and to an RS; they differ only when both arrive together
```

Until the last pulse the two blocks behave the same: the set turns Q1 on, Q1 stays on after the set is gone, and the reset turns it off. When both arrive together, the SR turns on and stays on, while the RS stays off.

## Worked example

A filling station tops up a tank through a valve. Two memories keep it in order.

- **Overfill.** When the level switch `LevelHigh` trips while the valve `ValveOpen` is still open, the tank has been overfilled, and a beacon must keep flashing until the operator has drained the excess and pressed `Drained`. If the tank overfills again at the very moment `Drained` is pressed, that new overfill must not be lost: the set wins, so this memory is an SR. The operator can quiet the beacon with `Silence` without forgetting the overfill.
- **Permit.** The station may fill only after the operator turns the key `KeyOn`, and an open door, `DoorClosed` FALSE, cancels that permit. Turning the key while the door is open must not give a permit: the reset wins, so this memory is an RS.

```st
PROGRAM FillStation
VAR_INPUT
  LevelHigh : BOOL; ValveOpen : BOOL; Drained : BOOL; Silence : BOOL;
  KeyOn : BOOL; DoorClosed : BOOL;
END_VAR
VAR_OUTPUT Beacon : BOOL; Permit : BOOL; END_VAR
VAR
  Overfill : SR;
  PermitLatch : RS;
END_VAR
Overfill(S1 := LevelHigh AND ValveOpen, R := Drained);
Beacon := Overfill.Q1 AND NOT Silence;
PermitLatch(S := KeyOn, R1 := NOT DoorClosed);
Permit := PermitLatch.Q1;
END_PROGRAM
```

An input of a latch takes any Boolean expression, not only a variable, and the Q1 of a latch can be used in an expression like any other BOOL: `Overfill.Q1` stays TRUE while `Silence` only hides it.

Follow the overfill on the diagram, with the valve open and `Silence` FALSE all along. A short overfill sets the memory, and the beacon stays on after the level drops. `Drained` resets it. Later a new overfill and `Drained` arrive in the same scan, and the beacon stays on: the set wins.

```timing
span: 5000
signals:
  - { name: LevelHigh, edges: [500, 800, 3500, 3800] }
  - { name: Drained, edges: [2000, 2300, 3500, 3800] }
  - { name: Beacon, edges: [500, 2000, 3500] }
caption: The SR keeps the overfill until Drained, and an overfill together with Drained stays on
```

The permit works the other way round. The key sets it, the door opening resets it, and while the door is open the key cannot set it, because in an RS the reset wins.

```timing
span: 5000
signals:
  - { name: KeyOn, edges: [500, 800, 3000, 3600] }
  - { name: DoorClosed, edges: [0, 2000, 4000] }
  - { name: Permit, edges: [500, 2000] }
caption: The RS gives the permit with the key, drops it with the door, and refuses the key while the door is open
```

## Common mistakes

- Copying the signal to the output. Without a latch the output follows the signal, and the alarm is gone as soon as the fault is.
- Mixing up the input names. An SR has S1 and R, an RS has S and R1; the figure 1 sits on the input that wins.
- Choosing the block without asking which signal must win. Both blocks pass most tests; they differ only when the set and the reset arrive together, and that is the moment that matters.
- Calling the instance inside an IF. When the condition is FALSE the instance is not called, so a reset that arrives then is never seen.
- Expecting an acknowledge to remove the fault. While the fault is still TRUE, an SR does not turn off at all, and an RS turns off only while the acknowledge is held, then the fault sets it again.

> [!WARNING]
> A latch in a program remembers an alarm; it does not protect anyone. A stop that protects people is wired in hardware and never waits for a program to remember it.

## Check yourself

```quiz
question: In the filling-station program, Overfill is an SR with S1 := LevelHigh AND ValveOpen and R := Drained. In one scan LevelHigh, ValveOpen and Drained are all TRUE. What is Overfill.Q1 at the end of the call?
options:
  - { text: 'TRUE', correct: true, feedback: 'Yes. An SR is set-dominant, so the set wins when both inputs are TRUE.' }
  - { text: 'FALSE', feedback: 'That is what an RS does. In an SR the figure 1 is on S1, the set, and the set wins.' }
  - { text: 'It keeps the value it had in the previous scan', feedback: 'A latch keeps its value only when both inputs are FALSE. Here one of them must win, and in an SR it is the set.' }
```

```quiz
question: The filling-station program calls Overfill only inside IF LevelHigh THEN ... END_IF. The tank overfills for a moment and the level drops again, and later the operator presses Drained. What does Beacon do?
options:
  - { text: 'It stays ON, because the latch is not called while LevelHigh is FALSE', correct: true, feedback: 'Right. An instance changes only when it is called, so Drained is never seen. Call the latch on every scan.' }
  - { text: 'It turns OFF, because Drained resets the latch', feedback: 'Drained resets the latch only during a call, and the call runs only while LevelHigh is TRUE.' }
  - { text: 'It turns OFF when the level drops', feedback: 'Then the latch would not remember anything. Its Q1 keeps the last value it was given.' }
```

## What you will do in the practice

The starting program declares two latches, SetLatch (SR) and ResetLatch (RS), and copies Fault to both outputs, so the alarms vanish with the fault. You will make SetFirst and ResetFirst stay ON after the fault that starts at {{t:10}} ms, until Ack at {{t:30}} ms, and make them differ when Fault and Ack arrive together at {{t:50}} ms: SetFirst stays ON and ResetFirst goes OFF. Then press {{ui:learn.check}}.
