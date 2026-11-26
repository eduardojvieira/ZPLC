## What this is for

Picture a packing line. Boxes ride along a conveyor, and a photo sensor at the entry looks across the belt. While a box blocks the light beam, the sensor input is on. The machine wants to count that box, or start a stamp, exactly once. But a box takes a while to pass, and the PLC looks at the sensor again and again, every few milliseconds. If the program simply says "sensor is on, so do the action", the action repeats on every look until the box has gone by.

The same problem appears at home. Hold a doorbell button for three seconds and the bell should ring once, not hundreds of times. What you want to detect is not "the button is down" but "the button just went down". That moment of change is called an **edge**.

## Level versus edge

Two words keep this clear.

- A **level** is the state of a signal right now: on or off. A plain contact reads the level. It conducts for as long as its variable is on.
- An **edge** is a change of that level. A **rising edge** is the change from off to on. A **falling edge** is the change from on to off.

Recall the scan cycle: the PLC reads its inputs, solves the rungs from top to bottom, writes the outputs, and starts over. An edge contact works inside that cycle. It remembers the value of its variable from the previous scan and compares it with the value in this scan.

- A **positive transition contact**, or P contact, conducts for exactly one scan: the scan in which the variable is on now and was off in the previous scan.
- A **negative transition contact**, or N contact, conducts for exactly one scan: the scan in which the variable is off now and was on in the previous scan.

In every other scan, whether the button is held or released, both contacts are open. The result is a **one-scan pulse**: power that flows through the rung for a single pass of the program and then stops.

## What happens over time

The diagram below shows a button held for five scans and the pulses that the two edge contacts make from it. The time axis is short because a scan lasts only about `T#10ms`.

```timing
span: 100
signals:
  - { name: Button, edges: [10, 60] }
  - { name: P contact, edges: [10, 20] }
  - { name: N contact, edges: [60, 70] }
marks:
  - { from: 10, to: 60, label: held }
caption: The P contact conducts in the scan of the press, the N contact in the scan of the release
```

Notice that the P pulse comes at the start of the press and the N pulse at the end. Between them the button is still on, but neither contact conducts.

Ladder offers the same idea in two more forms. A **pulse coil** writes its variable on for one scan when the power that reaches it rises or falls. And the **R_TRIG** and **F_TRIG** function blocks, which you can place in a rung, do what the P and N contacts do: R_TRIG gives one scan of power on a rising edge and F_TRIG on a falling edge. Use whichever reads best; the result is the same.

## Worked example

A floor indicator has three lamps. One press of the up button should move the lamp up one floor. The figure shows the rung that moves the indicator up. The contact on the left is a P contact: it carries the letter P inside it. Next to it is an ordinary contact that checks the current floor, and on the right are a SET coil for the new floor and a RESET coil for the old one.

```ld-figure
src: reading/elevator-edge.ld.json
rung: 2
caption: A P contact in front of the rung gives it power for one scan only
```

To see why the P contact is there, start with the same program with a plain contact instead, which reacts to the level. Press the button and keep it pressed for a moment, then release it. Use {{ui:learnReading.try.reset}} in the lab to start again.

```ld-try
src: reading/elevator-held.ld.json
inputs:
  - { name: UpButton, kind: push }
outputs: [Lamp1, Lamp2, Lamp3]
timing: [UpButton, Lamp2, Lamp3]
caption: With a plain contact, holding the button races up to the top floor
```

The indicator runs to floor 3 before you let go, because every scan in which the button is down counts as a new press. The second lab is the program of the figure, with the P contact. Hold the button again.

```ld-try
src: reading/elevator-edge.ld.json
inputs:
  - { name: UpButton, kind: push }
outputs: [Lamp1, Lamp2, Lamp3]
timing: [UpButton, Lamp2, Lamp3]
caption: With a P contact, one press moves one floor, however long you hold it
```

Now one press moves one floor. To go up another floor you must release the button and press it again, as a person expects.

## Common mistakes

- Using a pulse to hold something on. A pulse lasts one scan, much too short to see on a lamp or to drive a motor. Use it to trigger a latch, a counter or a timer, and let that element keep the state.
- Turning a stop into an edge. A stop button must work for as long as it is pressed, so it is read as a level.
- Forgetting that every edge contact has its own memory. Two P contacts on the same button in two rungs both conduct in the same scan, so one press can move two steps in a chain unless you order the rungs with care.
- Expecting an edge from a signal the PLC never sees in both states. A signal that is on for less than one scan can be missed. Real inputs also bounce, and a bouncing button makes several edges.

> [!WARNING]
> An edge contact turns a signal into a pulse in the program. It does not make a machine safe: an emergency stop is wired in hardware and never depends on the PLC program.

## Check yourself

```quiz
question: A box blocks the sensor for 40 scans. The rung has a P contact on the sensor. In how many of those scans does the rung have power?
options:
  - { text: 'One scan, the first', correct: true, feedback: 'Right. The P contact conducts only in the scan in which the sensor changes from off to on.' }
  - { text: 'All 40 scans', feedback: 'That is what a plain contact does, because it reads the level. A P contact reads the change.' }
  - { text: 'One scan, the last', feedback: 'The last scan with the sensor on is not a change. The scan in which the sensor turns off is for the N contact.' }
```

```quiz
question: A rung has an N contact on a button and a SET coil on a lamp. You press the button and hold it. When does the lamp turn on?
options:
  - { text: 'When you release the button', correct: true, feedback: 'Right. The N contact conducts in the scan in which the button goes from on to off, and the SET coil keeps the lamp on after that scan.' }
  - { text: 'As soon as you press it', feedback: 'That would be a P contact, which conducts in the scan of the press. An N contact waits for the release.' }
  - { text: 'Never, because the pulse is too short', feedback: 'One scan of power is enough for a SET coil: it writes the lamp on, and the lamp stays on.' }
```

## What you will do in the practice

In the practice you get the box sensor of the conveyor entry. Two rungs copy the sensor to two coils, so both outputs stay on while a box is there. You will make `BoxArrived` pulse for one scan when a box arrives and `BoxLeft` pulse for one scan when it leaves. The test blocks the sensor from {{t:10}} ms to {{t:70}} ms, so `BoxArrived` must be on only at {{t:10}} ms. Then press {{ui:learn.check}}.
