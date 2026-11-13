---
title: 'The first five scenes'
sidebar_label: 'The first five scenes'
description: 'The five scenes that ship with ZPLC, what the program has to do in each and what its scenario checks.'
tags: [plant, scenes]
---

# The first five scenes

Five scenes ship with ZPLC, in order of difficulty. Each has a scene file, a plant map, a starter program, a scenario and a reference program that passes the scenario. The scenario runs on the native runtime with a 10 ms scan and checks program outputs and facts of the plant. A fact name starts with `fact:`, such as `fact:count:EyeFar`. A check on a fact is a yes or no.

| Scene                     | Length of the scenario | Parts                                                                                                    |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Belt to sensor            | 8 s                    | belt, emitter, diffuse sensor, push button                                                               |
| Latch between two sensors | 8 s                    | belt, box, two diffuse sensors                                                                           |
| Counted queue             | 20 s                   | belt, emitter, two diffuse sensors, remover, push button, indicator light                                |
| Buffer and release        | 36 s                   | two belts, emitter, stop blade, three diffuse sensors, remover, two push buttons, two indicator lights   |
| Merge two lines           | 25 s                   | three belts, two emitters, two stop blades, three diffuse sensors, remover, push button, indicator light |

## Belt to sensor

Start the belt and send one box. The belt stops when the far sensor sees the box.

The scenario presses the start button, then checks that the belt is off before the start, that the far sensor counts a box within 8 s, that the belt is off at the end and that no box is dropped.

## Latch between two sensors

A box rides a belt past two sensors. The first sensor starts the belt and the second stops it. This is a set and reset latch.

The scenario checks that the first sensor counts a box within 100 ms, that the second counts one within 8 s, that the belt is off at the end and that no box is dropped.

## Counted queue

Send three boxes one after another and stop when three have left the belt. Each next box goes out when the previous one has left the emitter. A counter keeps the total.

The scenario checks that the belt and the done light are off before the start, that the remover receives a box and the emitter emits one, that the done light is on and the belt is off at 20 s, and that no box is dropped or collides.

## Buffer and release

Load five boxes on a buffer belt, hold them at a stop blade, and release one box for each press of the release button. The next box must not follow the released one.

The scenario checks, among others, that the program holds the line at 8 s, that two sensors count boxes and the release sensor counts none at 15.5 s, that a release works at 18.5 s, that the done light is on at 36 s, that a box is emitted and delivered, and that the fault output stays off with no box dropped or colliding.

## Merge two lines

Two feeder lines each load three boxes and meet at one merge zone. The program grants the zone to one line at a time, line A first. A grant ends when its box has left the zone.

The scenario checks that both blades hold at 1 s with no box removed, that both emitters emit and the remover receives a box, that the done light is on at 25 s with both blades holding, and that no box is dropped or collides.

## What is not claimed

The scenes run in the headless plant core. This page gives no frame rate and no latency for them: it is not yet measured on the reference machines.

## See also

- [The plant clock](./clock.md)
- [Scene file format](./scene-format.md)
- [Plant parts reference](./parts.md)
