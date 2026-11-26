## What this is for

Think of a small pumping station. A start button, a stop button, a pump contactor, a run lamp. Between the buttons and the pump the program must remember things: that the pump was asked to run, how long to wait before it starts, how many cases have been filled. Each of those things needs a name and a place to live. That name plus its kind of content is a **variable**.

This page answers three questions. What kinds of value can a variable hold? How does a variable become connected to a real wire? And which variables never touch a wire at all?

## Types: the kind of value

Every variable has a **type**, which says what it can hold and how much memory it takes. Four types cover most of Ladder.

| Type | Holds                                    | Example                          |
| :--- | :--------------------------------------- | :------------------------------- |
| BOOL | one of two states, `TRUE` or `FALSE`     | a button, a lamp, a limit switch |
| INT  | a whole number, positive or negative     | a count of bottles, `3`          |
| REAL | a number with decimals                   | a tank level of `42.5`           |
| TIME | a duration, written with the prefix `T#` | `T#50ms`, `T#3s`, `T#2m`         |

A contact and a coil work on BOOL variables, because power either flows or does not. Timers take a TIME for how long to wait, and counters take an INT for how many to count. If you give a block the wrong type, the compiler tells you.

A counter needs its preset as a whole number, so the natural home for it is an INT variable. This lab fills a case with `BatchSize` bottles, where `BatchSize` is an INT. Change the value in the variable table and the whole machine changes with it, with no rung edited.

```ld-try
src: reading/case-counter.ld.json
inputs:
  - { name: Bottle, kind: push }
  - { name: NewCase, kind: push }
outputs: [CaseFull]
caption: Press Bottle three times, then NewCase
```

## Addresses: the wire between the program and the machine

A variable that only lives in the program is invisible to the machine. To read a real button, the program needs a variable tied to the input terminal where the button is wired. That tie is the **address**, written after the name in the variable table.

An address is written with a percent sign, an area letter, a size letter and a position.

| Address  | Meaning                                                      |
| :------- | :----------------------------------------------------------- |
| `%IX0.0` | **I**nput, one bit (**X**): byte 0, bit 0                    |
| `%QX0.1` | **O**utput ("Q"), one bit: byte 0, bit 1                     |
| `%IW2`   | input, one 16-bit word, for a number such as an analog value |
| `%MW0`   | **M**emory, one 16-bit word                                  |

The short form `%I0.0` means the same as `%IX0.0`, and you will see both. In the rest of the course the inputs are `%IX`, the outputs are `%QX`, and a word of memory is `%MW`. A `%MW` variable lives in the work memory of the runtime, at an address that the runtime documents. If the compiler places another variable on top of a located one, the build stops with an error.

## Memory bits versus physical I/O

Most variables in a real program have no address at all. They are **memory bits**: BOOL variables kept inside the program to remember something, such as "the pump was asked to run". No terminal reads them and no terminal drives them. A seal-in coil, a state of a sequence and a timer's finished flag are all memory.

Why bother? Because one memory bit can feed many outputs, and you can change what is wired without changing the logic.

The **I/O map** is the list of every variable that is tied to the machine: which inputs the program reads and which outputs it writes, each with its type and address. ZPLC builds it from the addresses you declared, so you never write the list by hand. While a simulation runs, open the {{ui:panel.watch}} tab. Its first table, **{{ui:faceplate.title}}**, shows the map with the live value of each row. A memory bit is not on that list, because it has no address; to see it, use the watch table below it.

## Worked example

The pumping station keeps one memory bit, `Running`. In the figure, the seal-in rung sets it, and then two other rungs copy it to the contactor and to the lamp. Only the buttons, the contactor and the lamp have addresses.

```ld-figure
src: reading/pump-memory.ld.json
caption: Running is a memory bit with no address; PumpContactor and RunLamp are the outputs
```

Press Start and then Stop. Both outputs follow the memory bit. If the lamp is later moved to another terminal, only its address changes: the rung that decides when the pump runs stays as it is.

```ld-try
src: reading/pump-memory.ld.json
inputs:
  - { name: StartButton, kind: push }
  - { name: StopButton, kind: push }
outputs: [PumpContactor, RunLamp]
caption: One memory bit drives two outputs
```

## Common mistakes

- Writing a time as a bare number. A TIME needs the prefix and the unit: `T#50ms`, not `50`.
- Giving two variables the same memory address. The second one overlaps the first, and the build reports it.
- Putting a number in a BOOL or a BOOL where an INT is expected. Choose the type from what the value means.
- Forgetting the scan: an input changes only between scans, so the program sees a steady value during one pass.

> [!WARNING]
> An output in the I/O map is only a variable of the program. The wire to a real contactor, and the stop that cuts power to a dangerous machine, belong to the hardware: an emergency stop never depends on the PLC program.

## Check yourself

```quiz
question: A variable named Requested is a BOOL with no address. What can you say about it?
options:
  - { text: 'It is a memory bit: only the program reads and writes it', correct: true, feedback: 'Right. With no address, no terminal is tied to it, and it does not appear in the I/O map.' }
  - { text: 'It reads an input terminal', feedback: 'A variable reads a terminal only through an address such as %IX0.0.' }
  - { text: 'It cannot be used in a rung', feedback: 'Memory bits are used in rungs all the time, as contacts and as coils.' }
```

```quiz
question: A variable holds how many bottles go into a case, 12. Which type fits it?
options:
  - { text: 'INT', correct: true, feedback: 'Right. A count is a whole number, and a counter takes its preset as an INT.' }
  - { text: 'REAL', feedback: 'A REAL holds decimals, and a case never holds half a bottle. A counter expects an INT.' }
  - { text: 'TIME', feedback: 'A TIME is a duration such as T#50ms, not a number of bottles.' }
```

## What you will do in the practice

In the practice you get a machine that warns before it starts. The memory bit `Requested` is already there, together with the seal-in and the timer. You will make the warning period last `T#50ms` and make `Motor` turn on when it is over, so that the lamp turns on at {{t:10}} ms and the motor at a later time, and you will look at the I/O map to see what has an address and what does not. Then press {{ui:learn.check}}.
