## What this is for

Think of a parking garage with a "FULL" sign at the entrance. A sensor in the road notices every car that drives in. The sign must light when the garage holds its limit, and an attendant must be able to clear the count at the start of the day. Somebody has to keep the number, and that somebody is the PLC.

Counting is everywhere in a plant: bottles per case, parts per batch, boxes per pallet, trucks per hour. A PLC counts with a **counter**, a block that adds one each time something happens.

## The idea

The counter you will use is the **CTU**, an up counter. CTU stands for "count up". It has these parts.

- **CU**, the count-up input. Each time CU goes from off to on, the counter adds one.
- **R**, the reset input. While R is on, the count goes back to zero.
- **PV**, the preset value: the number to count up to, such as `4`.
- **CV**, the current value: the count so far. It is a whole number (type INT) that the counter keeps for you.
- **Q**, the output. It turns on when CV has reached PV.

The counter counts **rising edges** of CU, not the time CU stays on. You met this idea in the lesson on edges: a car sits on the sensor loop for many scans, but it is one car. The counter looks at the change from off to on, so it adds one for the whole stay. You do not need to put an edge contact in front of it.

In a bottling plant the same block counts bottles into a case. A sensor beside the conveyor sees each bottle pass, the counter reaches twelve, and its output tells the case packer to close the box and start the next one. Nobody counts by hand, and the count is the same on every shift, because it is a number kept inside the program.

## How it looks in Ladder

In a rung, the sensor contact feeds the CU of the block, the reset button is wired to R, the preset is written in PV, and Q drives the coil, here the FULL sign. The count itself lives in the block and is named after its instance, for example `Cars.CV`.

```ld-figure
src: reading/parking-lot.ld.json
caption: CarSensor feeds CU, Attendant resets, and Q lights FullSign at four cars
```

## Try it

Press the car sensor and release it, four times. The sign lights on the fourth car. Then press the attendant button.

```ld-try
src: reading/parking-lot.ld.json
inputs:
  - { name: CarSensor, kind: push }
  - { name: Attendant, kind: push }
outputs: [FullSign]
timing: [CarSensor, FullSign]
caption: Four presses of CarSensor light FullSign; Attendant clears it
```

Now press the sensor and hold it for a long time. It counts as one car. A counter is not fooled by a car that sits on the loop.

## What happens over time

The diagram shows four cars and the sign. Each car makes the sensor rise and fall. The sign stays off until the fourth rise, and then it stays on until the attendant resets the counter.

```timing
span: 6000
signals:
  - { name: CarSensor, edges: [500, 800, 1500, 1800, 2500, 2800, 3500, 3800] }
  - { name: FullSign, edges: [3500, 5000] }
  - { name: Attendant, edges: [5000, 5300] }
marks:
  - { from: 3500, to: 5000, label: sign on }
caption: The fourth rising edge turns Q on; the reset turns it off
```

## What the count does after the preset

The counter does not stop at PV. It keeps counting while R is off, so CV can be larger than PV. Q is on whenever CV is at or above PV. Only a reset sends the count back to zero. If a pulse arrives while R is held on, it is lost: the counter stays at zero until R is released and a new rising edge comes.

## Other counters

ZPLC also offers **CTD**, a down counter, which counts down from a preset toward zero, and **CTUD**, an up-down counter, which has both inputs. A count-down is useful for a stock of parts that you take one by one. The idea is the same: each block counts rising edges of its input.

## Common mistakes

> [!WARNING]
> A counter is only as accurate as the input. A bouncing sensor can add false counts, and a pulse shorter than one scan can be missed altogether. Do not use a software count as the only guard of a dangerous limit. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim about any lesson.

- Forgetting the reset. The count never returns to zero, and the sign stays lit.
- Putting an edge contact in front of CU. It does no harm, but it is not needed.
- Choosing the wrong preset by one. Count the cars that must pass, not the gaps between them.
- Expecting the count to persist after a restart. A program that stops and starts begins again from its initial values.

## Check yourself

```quiz
question: A box stays on a sensor for 30 scans. The counter has the sensor on CU. By how much does the count rise?
options:
  - { text: 'By one', correct: true, feedback: Right. A counter adds one on the rising edge of CU, however long the input stays on. }
  - { text: 'By 30', feedback: That would be a counter that adds on every scan with CU on. A CTU adds only on the change from off to on. }
  - { text: 'By zero', feedback: The rising edge of the sensor is exactly what a CTU counts, so it does add one. }
```

## What you will do in the practice

In the practice a pulse input is copied straight to an output. You will place a CTU with a preset of 3 between the contact and the coil and wire `Reset` to its `R` input, so that `CountReached` turns on at the third pulse, at {{t:50}} ms, and turns off when `Reset` is pressed at {{t:70}} ms.
