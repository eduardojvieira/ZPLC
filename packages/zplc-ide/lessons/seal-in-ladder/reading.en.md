## A motor that remembers

Think of the way a ventilation fan works in a workshop. You press the green button once and the fan starts. You take your finger off, and the fan keeps running. You press the red button and the fan stops. Nobody has to hold anything.

That is a surprise for a PLC, because so far a coil only follows its rung: when the button is released, power leaves the rung and the output goes off. How can a program keep an output on after the button is gone? In the industry, the answer is older than PLCs. It comes from relay panels, and it is called a **seal-in** (also a holding circuit or a latch).

## The idea: the output holds itself

The trick is to let the output **keep its own rung alive**. You add a second contact that reads the output itself, and you put it **in parallel** with the start button. Then:

1. Pressing Start makes power reach the coil. The output turns ON.
2. Now the contact of the output is TRUE as well. It gives power a second way to reach the coil.
3. Releasing Start removes the first path, but the second path is still there. The output stays ON.
4. Pressing Stop must break every path that still reaches the coil. Then the output turns OFF, and because the output is OFF, the second path stops too. The rung stays off after Stop is released.

The scan cycle you studied earlier is what makes this work. In one scan the output is calculated from the state that it had at the end of the previous scan.

## Who wins when both are pressed

A seal-in must also answer one question: when Start and Stop are pressed in the same scan, which one wins? The answer depends only on where the stop contact sits in the rung, compared with the branch. Some machines want the start to win, and the worked example below is one of them; a motor that must always be able to stop wants the opposite. Before you draw a seal-in, decide which one your machine needs, and test the moment when both buttons are pressed together.

## Worked example

A paint booth has a smoke extractor. When anybody asks for extraction with StartFan, the fan must run, even if somebody else is pressing StopFan at that very moment: fumes in a booth are the bigger danger, so here the start wins. StopFan is a push button that is TRUE while pressed, so it is read with a normally closed contact.

```ld-figure
src: reading/booth-extractor.ld.json
caption: The Fan contact holds the coil on, and the StopFan contact sits only on the held path
```

Read it from left to right. Power has two paths to the coil Fan. The upper path is StartFan alone. The lower path is the held path: the contact of Fan, in series with StopFan. Once the fan runs, the lower path keeps it running after StartFan is released, until StopFan opens that path. But nothing on the upper path reads StopFan, so while StartFan is pressed, the fan runs whatever StopFan does.

```ld-try
src: reading/booth-extractor.ld.json
inputs:
  - { name: StartFan, kind: push }
  - { name: StopFan, kind: push }
outputs: [Fan]
timing: [StartFan, StopFan, Fan]
caption: Press StartFan and let go, then press StopFan. Then hold both together
```

Press Run, press and release StartFan: the fan keeps running. Press StopFan: it stops. Now hold StopFan and press StartFan at the same time: the fan runs, and it keeps running when you release both.

```timing
span: 6000
signals:
  - { name: StartFan, edges: [500, 1000, 4000, 4500] }
  - { name: StopFan, edges: [2500, 3000, 4000, 4500] }
  - { name: Fan, edges: [500, 2500, 4000] }
marks:
  - { from: 1000, to: 2500, label: ON }
caption: The fan holds itself on, stops with StopFan, and starts when both are pressed together
```

The motor of the practice must not behave like this extractor when both buttons are pressed together.

## Common mistakes

- Putting the holding contact in parallel with the stop contact. The stop then cannot drop the output.
- Using a normally closed contact for the holding contact. The output would turn itself off on the next scan.
- Reading a stop button wired normally closed with the wrong contact. Choose the contact from the value the input has at rest, not from the name of the button.
- Forgetting that the memory is the output: if the output is overwritten from another place, the seal-in breaks.
- Expecting a seal-in to survive a restart. Variables start from their initial values when the PLC loses power or restarts, so the output is OFF again. That is usually what you want: a machine must not start by itself after a power cut.

> [!WARNING]
> Stopping with a program is not the same as stopping safely. An emergency stop is wired in hardware and cuts the power to the motor even when the PLC is stopped or has failed. It never depends on the seal-in or on any other part of the program.

## Check yourself

```quiz
question: The Start button is released. Why does a seal-in keep the output on?
options:
  - { text: 'A contact of the output itself is in parallel with Start and keeps power flowing', correct: true, feedback: 'Yes. The output holds its own rung alive.' }
  - { text: 'The PLC remembers that the button was pressed for the whole day', feedback: 'The PLC has no special memory for this. The program provides it with a contact of the output.' }
  - { text: 'The Stop contact is closed', feedback: 'The Stop contact must be closed for power to pass, but it is the holding contact that keeps the output on after Start is released.' }
```

```quiz
question: In the booth extractor, the fan is off and StartFan and StopFan are pressed in the same scan. What does the fan do?
options:
  - { text: 'It starts, because the StartFan path does not read StopFan', correct: true, feedback: 'Yes. StopFan sits only on the held path, so the start path reaches the coil.' }
  - { text: 'It stays off, because StopFan is pressed', feedback: 'StopFan opens only the held path. The StartFan path still reaches the coil.' }
  - { text: 'It starts for one scan and then stops', feedback: 'While StartFan is held, its path keeps power on the coil in every scan.' }
```

## What you will do in the practice

The starting program has a motor rung with a Stop contact and a Start contact but nothing that holds the motor on, so the motor stops as soon as Start is released. You will make the motor keep running after Start is released, stop when Stop is pressed, and stay stopped when Start and Stop are pressed together, then press {{ui:learn.check}}.
