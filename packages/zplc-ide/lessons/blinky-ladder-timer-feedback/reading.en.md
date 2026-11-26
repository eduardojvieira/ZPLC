## A blink needs time

A lamp that blinks is on for a while, off for a while, on again. So far your programs have reacted to buttons, and a button can be pressed at any moment. A blink must decide by itself, from time alone. For that the PLC needs two new tools: a **timer**, which measures time, and a way to **remember** a state between scans, which you will build with **SET** and **RESET** coils.

Blinking is not only for decoration. A warning beacon on a crane, a pulsing pump that doses a chemical, and a heartbeat lamp that shows the controller is alive all use the same idea.

## The on-delay timer: TON

A **TON** (on-delay timer) is a block with three main connections.

- **IN** is the input. While IN is TRUE, the timer counts time. When IN becomes FALSE, the timer goes back to zero.
- **PT** is the **preset time**, how long to wait. You write it as a duration such as `T#2s` (two seconds) or `T#500ms` (half a second).
- **Q** is the output. It stays FALSE until IN has been TRUE for the whole preset time, and then it turns TRUE. It stays TRUE as long as IN stays TRUE.

Think of a phone that turns off only if you hold the power button for two seconds. If you let go early, the count starts over. Only a full, uninterrupted hold gives the answer.

## Remembering a state: SET and RESET

A normal coil follows its rung: power in, output on; power out, output off. A **SET** coil works differently. When power reaches it, it turns the output ON, and the output **stays on** even when the power goes away. A **RESET** coil turns the same output OFF, and it too stays off. They behave like the two buttons of a valve: one opens it, one closes it, and it remembers.

```ld-figure
src: reading/set-reset-valve.ld.json
caption: A press of OpenButton sets the valve, a press of CloseButton resets it
```

Both coils are used on the same variable. The valve is solved from top to bottom, so when both buttons are pressed in the same scan, the RESET rung is the last one and wins.

## Feedback: an output that chooses its own timer

A blinker combines the two ideas. A lamp that is OFF starts one timer; when that timer finishes, a SET coil switches the lamp ON. A lamp that is ON starts a second timer; when that finishes, a RESET coil switches the lamp OFF. The lamp itself is the memory that decides which timer runs. This idea is called **feedback**: the output is fed back as an input of the same program.

Why two timers and not one? With a single timer fed by the lamp, the lamp turning on would immediately reset the timer and the lamp would flicker for a single scan, not blink. Two timers give each half of the blink its own count.

## Worked example

A machine asks the operator to confirm a command by holding HoldButton, so that a brush against the button does nothing. ConfirmLamp must light only after the button has been held for the preset time, and go off as soon as it is released. That is a TON with the button on IN and the lamp on Q.

```ld-figure
src: reading/hold-to-confirm.ld.json
caption: Rung 1 feeds the timer, rung 2 lights the lamp from its output Q
```

In Ladder, the timer is a box on the right of its rung, where a coil would be. Its IN comes from the power that reaches the rung. The name `HoldTimer` is the **instance**: your program keeps one memory for each timer, and `HoldTimer.Q` reads the output of that timer in another rung.

```ld-try
src: reading/hold-to-confirm.ld.json
inputs:
  - { name: HoldButton, kind: push }
outputs: [ConfirmLamp]
timing: [HoldButton, ConfirmLamp]
caption: Hold the button until the lamp lights, then try releasing it too early
```

Press Run and hold the button. Nothing happens for the preset time, and then the lamp lights. Release the button: the lamp goes off at once, and the timer is ready to start again. If you release before the time is up, the lamp never lights.

```timing
span: 6000
signals:
  - { name: HoldButton, edges: [500, 3500] }
  - { name: ConfirmLamp, edges: [2500, 3500] }
marks:
  - { from: 500, to: 2500, label: PT }
caption: The lamp lights when the button has been held for PT, and goes off when the button is released
```

## Common mistakes

- Forgetting that the timer needs power on IN all the time. If power on IN flickers, the timer restarts at zero.
- Using a SET coil without a RESET coil. The output turns on and nothing can turn it off.
- Mixing up PT and the real duration. Add a small margin for the scan: the real time is the preset plus up to one scan.
- Writing the times in the wrong unit. `T#500ms` is half a second and `T#5s` is five seconds.
- Looking for the TON among the coils. A TON is a block: in ZPLC it appears as a box on the rung, with its instance name above it.

> [!WARNING]
> A lamp that warns of a danger must keep warning even if the PLC stops, so it comes from the machine's own wiring. A timer in a program delays a signal; it does not make a machine safe.

## Check yourself

```quiz
question: A TON has the preset `T#2s`. IN is TRUE for one second and then FALSE. What is Q at the end?
options:
  - { text: 'FALSE, because IN was not TRUE for the whole preset time', correct: true, feedback: 'Yes. When IN falls, the timer returns to zero and Q never became TRUE.' }
  - { text: 'TRUE, because IN was TRUE once', feedback: 'Q becomes TRUE only after IN stays TRUE for the whole preset time.' }
  - { text: 'TRUE for one second', feedback: 'A TON does not copy IN. It waits for the preset time first.' }
```

```quiz
question: A SET coil turns an output on. The power to the coil then goes away. What does the output do?
options:
  - { text: 'It stays on until a RESET coil turns it off', correct: true, feedback: 'Yes. A SET coil remembers its state.' }
  - { text: 'It turns off at once', feedback: 'That is how a normal coil behaves. A SET coil keeps its value.' }
  - { text: 'It turns off when the preset time is over', feedback: 'A SET coil has no time of its own. Only a RESET coil turns the output off.' }
```

## What you will do in the practice

The starting program has the two timers of a blinker already drawn: OffTimer runs while LED_Output is OFF and OnTimer while it is ON, but nothing changes the LED, so it stays OFF for ever. You will make the LED stay OFF for about {{t:500}} ms, then ON for about {{t:500}} ms, and repeat, then press {{ui:learn.check}} and compare the on and off times with the plan of the lesson.
