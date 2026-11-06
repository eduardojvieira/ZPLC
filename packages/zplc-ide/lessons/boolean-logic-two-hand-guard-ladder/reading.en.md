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

```ld-figure
src: reading/lid-and-stairs.ld.json
caption: AND for the blender, NOT for the lid warning, XOR for the stairway light
```

Rung 1 is the AND. Rung 2 is the NOT. Rung 3 is the XOR, with its two parallel paths drawn one above the other.

```ld-try
src: reading/lid-and-stairs.ld.json
inputs:
  - { name: LidClosed, kind: switch }
  - { name: BlendButton, kind: push }
  - { name: SwitchA, kind: switch }
  - { name: SwitchB, kind: switch }
outputs: [Blender, LidWarning, StairLight]
caption: Close the lid and press the button, then flip each stairway switch in turn
```

Press Run. Start with the lid open: the warning lamp is on, and the blender does not run even if you press the button. Close the lid and press the button: the blender runs, and the warning lamp goes off. Now flip SwitchA, then SwitchB, then SwitchA again, and watch the stairway light follow the XOR rule.

## Truth table of the stairway

| SwitchA | SwitchB | StairLight |
| :------ | :------ | :--------- |
| FALSE   | FALSE   | FALSE      |
| FALSE   | TRUE    | TRUE       |
| TRUE    | FALSE   | TRUE       |
| TRUE    | TRUE    | FALSE      |

You can check any new logic by writing such a table first and then testing each row. The practice of this lesson does exactly that with a scenario.

## Putting the pieces together

The two-hand guard of the practice combines what you saw: the press is enabled when the left button **and** the right button **and** the guard are all TRUE, a lamp shows when the guard is **not** closed, and a warning shows when **exactly one** hand is on a button. In that last rule the XOR is useful: one hand alone is suspicious, while zero or two hands are normal states.

## Common mistakes

- Thinking that a normally closed contact is a closed switch. It is a NOT: it passes power when the variable is FALSE.
- Building the XOR with two normally open contacts in parallel. That is a plain OR, and it is also TRUE when both are on.
- Putting the guard in parallel with the buttons. A parallel offers a second way to turn the press on, which is the opposite of a protection. A condition that must always hold goes in **series**.

> [!NOTE]
> Any Boolean rule can be written with AND, OR and NOT alone. XOR is only a handy shortcut for "they disagree".

> [!WARNING]
> A real two-hand control and a real guard are safety functions with strict requirements. They are built with certified safety relays or safety controllers, wired in hardware, and they never rely on a normal PLC program alone. ZPLC makes no safety claim, and this lesson only teaches the logic.

## Check yourself

```quiz
question: A lamp must light when a guard is not closed. Which contact reads the GuardClosed signal in that rung?
options:
  - { text: 'A normally closed contact', correct: true, feedback: Yes. It passes power when GuardClosed is FALSE, which is the NOT. }
  - { text: 'A normally open contact', feedback: That contact passes power when GuardClosed is TRUE, so the lamp would light with the guard closed. }
```

```quiz
question: A stairway light has two switches. Both are up. What is the light?
options:
  - { text: 'Off, because exactly one switch must be up for it to be on', correct: true, feedback: Yes. XOR is TRUE only when the switches disagree. }
  - { text: 'On, because at least one switch is up', feedback: That is OR. For a stairway light, flipping the second switch up turns the light off again. }
```

## What you will do in the practice

In the practice you get a two-hand control with three rungs. The press enable checks the two hands but forgets the guard. You will add the guard contact in series, so that the press is enabled only with both hands on the buttons and the guard closed. Then you will press Check and look at how the guard lamp and the one-hand warning behave in the trace.
