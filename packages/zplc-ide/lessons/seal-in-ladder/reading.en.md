## A motor that remembers

Think of the way a ventilation fan works in a workshop. You press the green button once and the fan starts. You take your finger off, and the fan keeps running. You press the red button and the fan stops. Nobody has to hold anything.

That is a surprise for a PLC, because so far a coil only follows its rung: when the button is released, power leaves the rung and the output goes off. How can a program keep an output on after the button is gone? In the industry, the answer is older than PLCs. It comes from relay panels, and it is called a **seal-in** (also a holding circuit or a latch).

## The idea: the output holds itself

The trick is to let the output **keep its own rung alive**. You add a second contact that reads the output itself, and you put it **in parallel** with the start button. Then:

1. Pressing Start makes power reach the coil. The output turns ON.
2. Now the contact of the output is TRUE as well. It gives power a second way to reach the coil.
3. Releasing Start removes the first path, but the second path is still there. The output stays ON.
4. Pressing Stop breaks the rung **before** the branch. Neither path can reach the coil any more, so the output turns OFF, and because the output is OFF, the second path stops too. The rung stays off after Stop is released.

The scan cycle you studied earlier is what makes this work. In one scan the output is calculated from the state that it had at the end of the previous scan.

## How it looks in Ladder

Here is a fan with two reasons to stop: an Off button and an overload relay that trips when the motor is too hot. The Off button and the overload are both read with normally closed contacts, in series before the branch.

```ld-figure
src: reading/fan-seal-in.ld.json
caption: The Fan contact under OnButton holds the coil on once it has started
```

Read it from left to right. Power passes OffButton and Overload only when both are FALSE, that is, when nobody pressed Off and the overload has not tripped. Then it reaches the branch: either OnButton is pressed, or the contact of Fan is TRUE. Then it reaches the coil Fan.

```ld-try
src: reading/fan-seal-in.ld.json
inputs:
  - { name: OnButton, kind: push }
  - { name: OffButton, kind: push }
  - { name: Overload, kind: switch }
outputs: [Fan]
timing: [OnButton, OffButton, Fan]
caption: Press On and let go, then press Off. Then try the overload switch
```

Press Run, press and release OnButton: the fan keeps running. Press OffButton: it stops. Start it again, and then switch the overload on: the fan stops, and pressing OnButton does nothing until you switch the overload off.

```timing
span: 6000
signals:
  - { name: OnButton, edges: [500, 1000] }
  - { name: OffButton, edges: [3500, 4000] }
  - { name: Fan, edges: [500, 3500] }
marks:
  - { from: 1000, to: 3500, label: ON }
caption: Fan starts with the press of OnButton, stays on after the release, and stops with OffButton
```

## Why the stop contacts go before the branch

The stop contacts are in series with the **whole branch**. This is what gives the stop priority. If a stop contact were inside the held path, pressing Start together with Stop would turn the machine on, because the Start path would bypass the Stop contact. A stop that can be bypassed is not a stop. Put every condition that must always be able to stop the machine **in series, before the branch**.

## Common mistakes

- Putting the holding contact in parallel with the stop contact. The stop then cannot drop the output.
- Using a normally closed contact for the holding contact. The output would turn itself off on the next scan.
- Using a normally open contact for the stop button wired normally closed in the field. Remember how your program reads the field signal, as you will see in a later lesson.
- Forgetting that the memory is the output: if the output is overwritten from another place, the seal-in breaks.

> [!NOTE]
> A seal-in forgets its state when the PLC loses power or is restarted, because variables start from their initial values. That is usually what you want, so that a machine does not start by itself after a power cut.

> [!WARNING]
> Stopping with a program is not the same as stopping safely. An emergency stop is wired in hardware and cuts the power to the motor even when the PLC is stopped or has failed. It never depends on the seal-in or on any other part of the program. ZPLC makes no safety claim.

## Check yourself

```quiz
question: The Start button is released. Why does a seal-in keep the output on?
options:
  - { text: 'A contact of the output itself is in parallel with Start and keeps power flowing', correct: true, feedback: Yes. The output holds its own rung alive. }
  - { text: 'The PLC remembers that the button was pressed for the whole day', feedback: The PLC has no special memory for this. The program provides it with a contact of the output. }
  - { text: 'The Stop contact is closed', feedback: The Stop contact must be closed for power to pass, but it is the holding contact that keeps the output on after Start is released. }
```

```quiz
question: Where must the Stop contact go for Stop to win over Start?
options:
  - { text: 'In series, before the branch of Start and the holding contact', correct: true, feedback: Yes. Nothing can bypass it. }
  - { text: 'In parallel with the holding contact', feedback: Then the Start button could still power the coil while Stop is pressed. }
```

## What you will do in the practice

In the practice you get a motor rung with a Stop contact and a Start contact, but without the holding contact, so the motor stops as soon as you release Start. You will add the contact of the motor in parallel with Start, press Check, and see that the motor keeps running after Start is released and that Stop still wins.
