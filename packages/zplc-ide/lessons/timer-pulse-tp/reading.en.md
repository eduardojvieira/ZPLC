## A pulse that does not depend on the button

Sometimes a machine needs an output ON for an exact time, started by a signal that lasts for any time: a dose of soap, a puff of oil, a short horn blast. If the output simply copied the button, a person who holds the button for a long time would get a long dose.

The **TP** timer, the **pulse timer**, solves this. It is a function block like the TON and the TOF of the timers lesson: you declare an instance, call it once on every scan with `IN` and `PT`, and read its output `Q`.

```st
VAR
    Dose : TP;
END_VAR
Dose(IN := Hand, PT := T#400ms);
```

- When `IN` goes from OFF to ON, `Q` goes ON on that scan and the clock starts.
- `Q` stays ON until the preset `PT` has run out. What `IN` does in the meantime changes nothing: it may fall, or come back, or stay ON.
- When `PT` has run out, `Q` goes OFF. `IN` has to be OFF and then ON again before a new pulse can start. A new rise of `IN` while `Q` is ON is ignored.

So the length of the pulse belongs to the program, not to the person at the button. The timing diagram below is from a run of the worked example.

```timing
span: 2600
signals:
  - { name: Hand, edges: [100, 1000, 1200, 1260, 1500, 1520, 2000, 2020] }
  - { name: Valve, edges: [100, 500, 1200, 1600, 2000, 2400] }
caption: The valve opens for 400 ms per touch, not for as long as the hand stays
```

## Worked example

A soap dispenser has a sensor, `Hand`, that is TRUE while a hand is under it. The valve must open for {{t:400}} ms each time a hand arrives, however long the hand stays.

```st
PROGRAM Dispenser
VAR_INPUT Hand AT %I0.0 : BOOL; END_VAR
VAR_OUTPUT Valve AT %QX0.0 : BOOL; END_VAR
VAR
    Dose : TP;
END_VAR
Dose(IN := Hand, PT := T#400ms);
Valve := Dose.Q;
END_PROGRAM
```

ZPLC ran this program against a scenario with four touches. In the first, the hand stays from {{t:100}} ms to {{t:1000}} ms. `Valve` came ON at {{t:100}} ms and went OFF at {{t:500}} ms, a pulse of {{t:400}} ms, and it stayed OFF for the rest of that touch, although `Hand` was still ON for another {{t:500}} ms. The second touch, a short one from {{t:1200}} ms to {{t:1260}} ms, gave a pulse of the same length, from {{t:1200}} ms to {{t:1600}} ms.

The third touch, from {{t:1500}} ms to {{t:1520}} ms, came while that pulse was still running. It did not make the pulse longer and it did not start another one: `Valve` went OFF at {{t:1600}} ms as before. The fourth touch, at {{t:2000}} ms, started a new pulse that ended at {{t:2400}} ms.

## Common mistakes

- Expecting `Q` to follow `IN`. `Q` follows the preset: it stays ON for `PT` even when `IN` falls, and it goes OFF after `PT` even when `IN` is still ON.
- Expecting a held button to repeat the pulse. The next pulse needs `IN` to fall and rise again.
- Not calling the TP on every scan. A call that is skipped leaves the clock where it was.
- Expecting a new press during a pulse to extend it. It is ignored.

## Check yourself

```quiz
question: In the soap dispenser, a hand stays under the sensor for 900 ms. How long is the valve ON?
options:
  - { text: 'The 400 ms of the preset', correct: true, feedback: 'Yes. In the run the valve opened at {{t:100}} ms and closed at {{t:500}} ms, although Hand stayed ON until {{t:1000}} ms.' }
  - { text: 'The 900 ms that the hand stays', feedback: 'That is what the output would do if it copied Hand. A pulse timer ends its pulse by itself, after its preset.' }
  - { text: '400 ms, then another 400 ms while the hand is still there', feedback: 'The pulse does not repeat while the input stays ON. A new pulse needs the input to fall and rise again.' }
```

```quiz
question: The valve is ON for a dose and a hand touches the sensor again before the dose ends. What happens?
options:
  - { text: 'The dose ends at its time, and the touch is ignored', correct: true, feedback: 'Right. In the run the touch at {{t:1500}} ms came during the pulse that started at {{t:1200}} ms: the valve closed at {{t:1600}} ms and opened again only with the touch at {{t:2000}} ms.' }
  - { text: 'The dose is extended by 400 ms', feedback: 'A rise of the input while Q is ON does not restart the clock.' }
  - { text: 'The valve closes at once and a new dose starts', feedback: 'The pulse runs to its end whatever the input does.' }
```

## What you will do in the practice

A lubrication pump has a button and a guard switch. The starting program copies the button to the pump. You will make each press give a pulse of {{t:500}} ms, and you will decide what the guard may and may not do, then press {{ui:learn.check}}. The scenario holds the button for {{t:900}} ms and opens and closes the guard in {{t:3400}} ms.
