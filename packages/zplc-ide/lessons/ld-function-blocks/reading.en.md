## What this is for

Imagine a water station with ten identical pumps. Each pump needs the same logic: start on a button, keep running after the button is released, stop on a stop button, and refuse to run when the suction line is dry. You could copy that logic ten times and rename the variables. But then a mistake found in one copy has to be fixed in ten places, and somebody will miss one.

Real programs avoid this with a **function block**: logic written once, with a name, that you can use as many times as you need. This page explains what a function block is, why it needs a memory, and how to call your own from a Ladder rung.

## The idea: a small machine with its own memory

A function block is like a small machine with a label on it.

- It has **inputs**, which you feed.
- It has **outputs**, which you read.
- It has an inside, which you do not touch, and which **remembers** things between scans.

You already know function blocks. A `TON` timer is one: you give it an input and a preset, it gives you the output `Q`, and inside it remembers how long its input has been on. A counter `CTU` is another: inside it remembers the count. Neither forgets between scans, which a plain rung would.

The program can use a block only through its inputs and outputs. That is a feature: whoever uses the block does not need to know how it works inside.

## Declaration and instance

There are two different things to keep apart.

- The **declaration** is the plan of the machine. It says what inputs, outputs and memory the block has, and what it does. It is written once.
- An **instance** is one real machine built from the plan. You create it by declaring a variable whose type is the block.

If a cake recipe is the declaration, each cake in the oven is an instance. Two cakes from the same recipe do not share their dough.

The same holds for timers. If you declare `DelayA : TON` and `DelayB : TON`, you have two instances of one block, and each has its own running time. The next example shows it.

```ld-figure
src: reading/two-delays.ld.json
caption: Two instances of the same block. Each rung calls its own instance.
```

## Try it

Press and hold `ButtonA`. After two seconds `LampA` turns on. Now press and hold `ButtonB` a little later. `LampB` has its own clock, so it turns on two seconds after its own button, not after the first.

```ld-try
src: reading/two-delays.ld.json
inputs:
  - { name: ButtonA, kind: push }
  - { name: ButtonB, kind: push }
outputs: [LampA, LampB]
timing: [ButtonA, LampA, ButtonB, LampB]
caption: Press ButtonA, then ButtonB a moment later. Each lamp keeps its own time.
```

## Your own function block

ZPLC lets a project declare its own function blocks, in Structured Text, in a file next to the Ladder program. Here is a small one that switches an output on when a level goes above a high limit and off when it falls below a low limit, and keeps its output between the two limits:

```st
FUNCTION_BLOCK Hysteresis
VAR_INPUT Level : INT; High : INT; Low : INT; END_VAR
VAR_OUTPUT Out : BOOL; END_VAR
IF Level > High THEN Out := TRUE; END_IF;
IF Level < Low THEN Out := FALSE; END_IF;
END_FUNCTION_BLOCK
```

Read it as a plan. `Out` is an output, and because the block is called every scan and `Out` is not reset at the top, it **keeps its last value** whenever neither limit is crossed. That is the memory. Each instance has its own `Out`.

Once the project has this file, the Ladder editor lists `Hysteresis` in the **Project** category of its toolbox, next to `TON` and `CTU`. You declare an instance, place the block in a rung, and fill in its inputs.

## How a block sits in a Ladder rung

In a rung, the power that reaches the block enters one of its inputs, marked as connected. The other inputs take variables or constants. The outputs you need are written to variables. A block whose Run output you want on a coil gets a variable bound to that output.

Two details matter:

- The rung condition in front of the block feeds the connected input. If it is off, that input is off.
- Calling the block is what makes it run. A block in a rung that is never reached still keeps its memory, but its inputs are not updated.

## What happens over time

Each instance reacts only to its own inputs. When `ButtonA` is pressed alone, only `DelayA` counts.

```timing
span: 6000
signals:
  - { name: ButtonA, edges: [500, 3500] }
  - { name: LampA, edges: [2500, 3500] }
  - { name: ButtonB, edges: [1500, 5500] }
  - { name: LampB, edges: [3500, 5500] }
marks:
  - { from: 500, to: 2500, label: DelayA }
  - { from: 1500, to: 3500, label: DelayB }
caption: DelayA and DelayB count at the same time, each from its own button.
```

## Common mistakes

> [!WARNING]
> The most common mistake is to call one instance from two places. The second call changes the memory that the first call set, and the outputs of both places become tangled. One instance should be called from exactly one place per scan.

- Using one instance for two machines. If two pumps share an instance, they share a memory, and stopping one stops the other.
- Forgetting an input. An input you do not wire keeps its default value, usually `FALSE`, and the block behaves as if that input never happens.
- Expecting the block to keep its output when it is not called. A block only works while the program calls it.

> [!WARNING]
> A function block that starts a pump does not make the pump safe. An emergency stop is wired in hardware and never depends on the PLC program, and ZPLC makes no safety claim.

## Check yourself

```quiz
question: A project declares the block `Hysteresis` and two instances, `Tank1Level` and `Tank2Level`. Tank 1 goes above its high limit. What happens to the output of the second instance?
options:
  - { text: 'Nothing. Each instance has its own memory.', correct: true, feedback: Right. An instance is separate from every other instance of the same block. }
  - { text: 'It also turns on, because they share the declaration.', feedback: They share the plan, not the memory. The declaration is only a description. }
```

```quiz
question: Which one of these is the memory of a timer block?
options:
  - { text: 'The time that its input has been on.', correct: true, feedback: Right. It is stored inside the instance and survives from scan to scan. }
  - { text: 'The name of the rung that calls it.', feedback: The timer does not know where it is called from. }
  - { text: 'The value of the preset.', feedback: The preset is an input. You provide it each scan. }
```

## What you will do in the practice

In the practice you get a pump station. The project declares a block, `PumpCtl`, in Structured Text. Pump 1 is already a rung that calls its own instance. You will add a second rung for pump 2, with the contact and the second instance, and wire the same stop button and permissive. Then you check that the two pumps keep their own state.
