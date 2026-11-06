## Why diagnosis is a skill

Writing a program is only half of the work of a PLC programmer. The other half is finding out why a program that looks right does not behave right. A **PLC** is the small industrial computer that runs your program and switches the outputs of a machine. When a machine misbehaves at night, nobody wants to read every rung. They want a method.

Think of a house where one light does not turn off. You do not rewire the house. You look at the switch, you look at the light, and you ask what the switch is telling the light. Diagnosis in a PLC works the same way: you compare what the inputs say with what the outputs do, and you find the one place where the program disagrees with your expectation.

In this lesson the program is in simulation, so you can look at everything and break nothing. The ZPLC tools you will use are the **Watch table**, **breakpoints**, **Force** and the **Trace**.

## The method in six steps

Follow the same order every time. It keeps you from changing the program before you understand it.

1. Observe the symptom. Write one sentence: "when X happens, Y should happen, but Z happens".
2. Watch the variables. Put the inputs and outputs that matter in the Watch table and look at their values while the program runs.
3. Set a breakpoint on the rung that you suspect, so that the program stops there and you can read the values of that moment.
4. Force an input to test your idea. In simulation you may hold an input at a value you choose, to see what the rung does with it.
5. Read the trace to see when each value changed.
6. Fix the bug, release every force, and check again.

## A lamp that does the opposite

Here is a small program with a bug. A warning lamp should light while a door is **open**. The door switch `DoorClosed` is TRUE while the door is closed. The programmer drew a normally open contact, which conducts when its variable is TRUE.

```ld-figure
src: reading/door-lamp-bug.ld.json
caption: "The lamp follows the switch directly"
```

Press Run, then play with the switch. First write the symptom: the lamp is on when the door is closed, and off when it is open. That is the opposite of what we want.

```ld-try
src: reading/door-lamp-bug.ld.json
inputs:
  - { name: DoorClosed, kind: switch }
outputs: [Lamp]
timing: [DoorClosed, Lamp]
caption: "Toggle the door switch and watch the lamp"
```

The two signals move together. That already tells you something: the rung copies the switch instead of inverting it. You did not need a debugger for this one, but you used step 1 and step 2 of the method.

```timing
span: 4000
signals:
  - { name: DoorClosed, edges: [1000, 3000] }
  - { name: Lamp, edges: [1000, 3000] }
caption: "Lamp and DoorClosed have the same shape: the rung copies the switch"
```

## The Watch table

The **Watch table** lists variables and their live values while a program runs in Simulation. You add a variable by its path, for example `Motor`, and its value updates as the program scans. Use it first, always. Most bugs show themselves in a table of five values: an output that is ON when it should be OFF, or an input that never changes.

Look at inputs and outputs together. If an output is wrong while its inputs are right, the bug is in the rungs. If an input is not what you expected, the problem is outside the program: the sensor, the wiring, or the simulated plant.

## Breakpoints

A **breakpoint** stops the program at a rung so that you can read the values of that exact scan. In the ZPLC Ladder editor, select the rung and press F9 to toggle the breakpoint. It is armed when the program is loaded. When the program stops, the Watch table shows the values at that moment, and you can step the program one scan at a time and see how they change.

Use a breakpoint when a value changes too fast to see, or when you want to know what the rung saw at the instant of the symptom.

## Force, in simulation only

**Force** holds a variable at a value that you choose, whatever the program or the plant says. In the Watch table, each variable has a Force action. A forced value stays until you release it; the table warns you with the number of active forces, and a Release all forces action clears them.

Forcing an input is a good experiment. If you force `DoorClosed` to FALSE and the lamp does not change, the rung does not depend on that input the way you thought. If it changes, you have found the path.

> [!WARNING]
> Forcing an input or an output on a real machine is dangerous. It can start a motor that someone is cleaning, or hide a fault that protects people. On a real machine, forcing is allowed only under the procedures of the site, by authorized people, with the machine in a known safe state. An emergency stop is wired in hardware and never depends on the PLC program or on a force. ZPLC makes no safety claim. In this course you force only in simulation.

## The Trace

The **Trace** records samples of the values during a run on the simulator, so that you can read what happened after the fact. It is the tool for questions such as "when did the output change?" and "did it change at the same scan as the input?". The Trace of the simulator is host evidence only: it is not evidence from a real board.

## Fix, remove the forces, check again

The fix for the lamp is to invert the contact: a normally closed contact conducts when its variable is FALSE, so the lamp lights while the door is open.

```ld-figure
src: reading/door-lamp-fixed.ld.json
caption: "A normally closed contact lights the lamp while the door is open"
```

After a fix, always do two things. Release every force, because a forgotten force hides the real behavior of your program. Then run the check again and look at the result, not at your belief that you fixed it.

## Check yourself

```quiz
question: "You fixed a bug, but an input is still forced from your experiment. What do you do before you check?"
options:
  - { text: "Release all forces", correct: true, feedback: "A forced value is not the program's behavior. Release it, then check." }
  - { text: "Leave it, the program is fixed", feedback: "The force keeps the input at your value, so the result would not show the real program." }
  - { text: "Delete the rung", feedback: "The rung is not the problem. The force is." }
```

```quiz
question: "The lamp is on while the door is closed, but it should light while the door is open. What is the best first step?"
options:
  - { text: "Watch DoorClosed and Lamp together and describe the symptom", correct: true, feedback: "Observe first. The two values will show the relation between input and output." }
  - { text: "Rewrite the whole program", feedback: "You do not yet know what is wrong, so you cannot know what to rewrite." }
  - { text: "Force Lamp to FALSE", feedback: "That hides the symptom and tells you nothing about the cause." }
```

## What you will do in the practice

In the practice you get a motor program with a realistic bug: the stop button does not stop the motor. You will apply the method: watch `Motor`, `StartPB` and `StopOK`, set a breakpoint on the rung, force `StopOK` and see that nothing changes, read the Trace, and then move one contact. Finally you release every force and press Check. The scenario grades the fixed behavior only.
