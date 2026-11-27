## Why a press needs two hands

A metal press can crush a hand. A classic protection is the **two-hand control**: the press moves only while the operator holds two buttons, one in each hand, set far enough apart that no hand can be under the tool. A **guard** adds a second protection: if the cover is open, the press must not move at all.

The rules of that machine are simple to say: "both buttons pressed, **and** the guard closed". They are also a perfect place to practice the three building blocks of Boolean logic: AND, NOT and exclusive-or. You already met AND and OR as series and parallel. This page adds the other two, and shows how they combine.

## AND: all conditions together

Contacts in series pass power only if every one conducts. A blender is a friendly example. It should run only when the lid is closed and you press the button, so the lid contact and the button contact are in series.

## NOT: the opposite

A **NOT** turns TRUE into FALSE and FALSE into TRUE. In Ladder you do not need a new symbol: a **normally closed contact** is a NOT. It passes power when its variable is FALSE. A lamp that warns of an open lid reads the lid signal with a normally closed contact: when the lid is not closed, the lamp lights.

## Exclusive-or: one or the other, but not both

An **exclusive-or** (XOR) is TRUE when exactly one of two conditions is TRUE. The best example is a stairway light with a switch at the bottom and another at the top. Flip either switch and the light changes. Neither up: off. One up: on. Both up: off again. The light is on exactly when the two switches disagree.

You build it with two parallel paths. The first path says "A is up and B is not up". The second says "A is not up and B is up". Each path is a series of two contacts, one normally open and one normally closed, and the two paths are in parallel.

## Truth table of the stairway

| SwitchA | SwitchB | StairLight |
| :------ | :------ | :--------- |
| FALSE   | FALSE   | FALSE      |
| FALSE   | TRUE    | TRUE       |
| TRUE    | FALSE   | TRUE       |
| TRUE    | TRUE    | FALSE      |

You can check any new logic by writing such a table first and then testing each row. The practice of this lesson does exactly that with a scenario.

Any Boolean rule can be written with AND, OR and NOT alone. XOR is only a handy shortcut for "they disagree".

## Worked example

A sorting conveyor carries boxes past a flap that pushes tall boxes into a side lane. The flap swings out for a tall box (TallBox) while the side lane is not full (LaneFull): an AND in which one condition is a NOT. A position switch, FlapIsOut, reports where the flap really is, and while the belt runs (BeltRunning) a fault lamp lights when the command and the position disagree: an XOR, in series with one more contact.

```ld-figure
src: reading/diverter-flap.ld.json
caption: AND with a NOT for the flap, an XOR in series with the belt for the fault lamp
```

Rung 1 is the AND: TallBox with a normally open contact, and LaneFull with a normally closed one, because the flap may move while LaneFull is FALSE. Rung 2 begins with the XOR, its two parallel paths drawn one above the other, and the paths join before the BeltRunning contact, so the difference only counts while the belt runs. The contacts on Flap read the coil of rung 1.

```ld-try
src: reading/diverter-flap.ld.json
inputs:
  - { name: TallBox, kind: switch }
  - { name: LaneFull, kind: switch }
  - { name: FlapIsOut, kind: switch }
  - { name: BeltRunning, kind: switch }
outputs: [Flap, FlapFault]
caption: Run the belt, send a tall box, then move the flap position switch yourself
```

Press Run and switch BeltRunning on. Switch TallBox on: the flap is commanded out, and the fault lamp lights because FlapIsOut still says the flap is in. Switch FlapIsOut on, as the real flap would: the fault lamp goes off. Now switch LaneFull on: the flap command drops, and the fault lamp lights again until you switch FlapIsOut off. Switch BeltRunning off, and the fault lamp stays dark whatever the flap does.

## Common mistakes

- Thinking that a normally closed contact is a closed switch. It is a NOT: it passes power when the variable is FALSE.
- Building the XOR with two normally open contacts in parallel. That is a plain OR, and it is also TRUE when both are on.
- Putting the guard in parallel with the buttons. A parallel offers a second way to turn the press on, which is the opposite of a protection. A condition that must always hold goes in **series**.

> [!WARNING]
> A real two-hand control and a real guard are safety functions with strict requirements. They are built with certified safety relays or safety controllers, wired in hardware, and they never rely on a normal PLC program alone. This lesson only teaches the logic.

## Check yourself

```quiz
question: A lamp must light when a guard is not closed. Which contact reads the GuardClosed signal in that rung?
options:
  - { text: 'A normally closed contact', correct: true, feedback: 'Yes. It passes power when GuardClosed is FALSE, which is the NOT.' }
  - { text: 'A normally open contact', feedback: 'That contact passes power when GuardClosed is TRUE, so the lamp would light with the guard closed.' }
  - { text: 'No contact: the coil reads the guard by itself', feedback: 'A coil only gets power through the contacts before it. With no contact the lamp is always on.' }
```

```quiz
question: A stairway light has two switches. Both are up. What is the light?
options:
  - { text: 'Off, because exactly one switch must be up for it to be on', correct: true, feedback: 'Yes. XOR is TRUE only when the switches disagree.' }
  - { text: 'On, because at least one switch is up', feedback: 'That is OR. For a stairway light, flipping the second switch up turns the light off again.' }
  - { text: 'It flickers, because the two switches fight', feedback: 'Nothing fights: the rung is solved once per scan and gives one steady answer, FALSE.' }
```

## What you will do in the practice

The starting program is a two-hand control with three rungs: PressEnable, a GuardLamp that shows when the guard is **not** closed, and a OneHandWarning that shows when **exactly one** hand is on a button. In that last rule the XOR is useful: one hand alone is suspicious, while zero or two hands are normal states. PressEnable checks the two hands but forgets the guard, so the press is enabled with the guard open. You will make the press enabled only when the left button **and** the right button **and** the guard are all TRUE, then press {{ui:learn.check}} and look at how the guard lamp and the one-hand warning behave in the trace.
