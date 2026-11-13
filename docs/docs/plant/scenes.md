---
title: 'The shipped scenes'
sidebar_label: 'The shipped scenes'
description: 'The scenes that ship with ZPLC, what the program has to do in each and what its scenario checks.'
tags: [plant, scenes]
---

# The shipped scenes

These scenes ship with ZPLC, in order of difficulty. Each has a scene file, a plant map, a starter program, a scenario and a reference program that passes the scenario. The scenario runs on the native runtime with a 10 ms scan and checks program outputs and facts of the plant. A fact name starts with `fact:`, such as `fact:count:EyeFar`. A check on a fact is a yes or no.

| Scene                      | Length of the scenario | Parts                                                                                                                       |
| -------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Belt to sensor             | 8 s                    | belt, emitter, diffuse sensor, push button                                                                                  |
| Latch between two sensors  | 8 s                    | belt, box, two diffuse sensors                                                                                              |
| Timed tank                 | 25 s                   | tank, push button, emergency stop, stack light                                                                              |
| Counted queue              | 20 s                   | belt, emitter, two diffuse sensors, remover, push button, indicator light                                                   |
| Two-axis assembly          | 40 s                   | three belts, two emitters, two stop blades, two diffuse sensors, two-axis pick and place, remover, push button, stack light |
| Two-axis assembly, numeric | 40 s                   | the same parts; the pick and place takes numeric positions                                                                  |
| Buffer and release         | 36 s                   | two belts, emitter, stop blade, three diffuse sensors, remover, two push buttons, two indicator lights                      |
| Merge two lines            | 25 s                   | three belts, two emitters, two stop blades, three diffuse sensors, remover, push button, indicator light                    |
| Tank level control         | 90 s                   | tank, two potentiometers, numeric display, stack light                                                                      |
| Layer palletizer           | 60 s                   | belt, two emitters, diffuse sensor, layer palletizer, pallet, push button, stack light                                      |
| Transfer between belts     | 45 s                   | two belts, emitter, stop blade, two diffuse sensors, two-axis pick and place, remover, push button, stack light             |
| Three-axis palletizing     | 50 s                   | belt, emitter, stop blade, diffuse sensor, three-axis gantry, pallet, push button, stack light                              |

## Belt to sensor

Start the belt and send one box. The belt stops when the far sensor sees the box.

The scenario presses the start button, then checks that the belt is off before the start, that the far sensor counts a box within 8 s, that the belt is off at the end and that no box is dropped.

## Latch between two sensors

A box rides a belt past two sensors. The first sensor starts the belt and the second stops it. This is a set and reset latch.

The scenario checks that the first sensor counts a box within 100 ms, that the second counts one within 8 s, that the belt is off at the end and that no box is dropped.

## Timed tank

Fill a tank for a set time with a timer, hold it, then drain it until the low level switch reports a low level. A press of the start button begins the cycle. The emergency stop closes both valves at any time and lights the red lamp.

The scenario presses start, presses the emergency stop in the middle of the fill and releases it, and presses start again. It checks that every valve and lamp is off before the start, that the fill valve and the amber lamp are on during the fill, that both valves are closed and the red lamp is on during the emergency stop, that the green lamp is on and the drain valve is closed at 25 s, and that the tank never spills.

## Counted queue

Send three boxes one after another and stop when three have left the belt. Each next box goes out when the previous one has left the emitter. A counter keeps the total.

The scenario checks that the belt and the done light are off before the start, that the remover receives a box and the emitter emits one, that the done light is on and the belt is off at 20 s, and that no box is dropped or collides.

## Two-axis assembly

Put a lid on each base with a two-axis pick and place. Lids and bases arrive on two belts and wait at stop blades; the vacuum pad takes a lid and sets it down centred on a base, and the assembled base leaves on the exit belt.

The scenario presses start and checks that nothing moves before the start, that a lid and a base are assembled and an assembly is delivered, that nothing is dropped, and that the green lamp is on and every motion command is off at 40 s.

## Two-axis assembly, numeric

The same task with the numeric variant: the program sets the X and Y positions of the pick and place in metres and reads its position back, instead of jogging to limit switches. See [numeric signals](./numeric-signals.md) and [manipulators and gripping](./manipulators.md).

The scenario checks the same results as the two-axis assembly: an assembly delivered, nothing dropped, the green lamp on at 40 s.

## Buffer and release

Load five boxes on a buffer belt, hold them at a stop blade, and release one box for each press of the release button. The next box must not follow the released one.

The scenario checks, among others, that the program holds the line at 8 s, that two sensors count boxes and the release sensor counts none at 15.5 s, that a release works at 18.5 s, that the done light is on at 36 s, that a box is emitted and delivered, and that the fault output stays off with no box dropped or colliding.

## Merge two lines

Two feeder lines each load three boxes and meet at one merge zone. The program grants the zone to one line at a time, line A first. A grant ends when its box has left the zone.

The scenario checks that both blades hold at 1 s with no box removed, that both emitters emit and the remover receives a box, that the done light is on at 25 s with both blades holding, and that no box is dropped or collides.

## Tank level control

Hold the level of a tank at a set point with a PID loop. The set point comes from a potentiometer in metres, a second potentiometer opens the discharge valve as a disturbance, and a numeric display shows the level. The level and the set point arrive as `INT` raw values and the valves take `REAL` percentages: see [numeric signals](./numeric-signals.md).

The scenario sets the set point to 0.5 m, opens the discharge to 40 % at 40 s and lowers the set point to 0.3 m at 70 s. It checks that the level stays in the band of 0.45 m to 0.55 m for 8 s from 30 s and for 8 s from 60 s, that it is back in the band within 20 s of the disturbance, that it is out of the band for 5 s from 85 s, and that the tank never spills.

## Layer palletizer

Form layers of four boxes with a layer palletizer and stack three layers on a pallet. The pusher squares each layer against the plates before the clamp lifts it. The head starts at its lowest position, so the program raises it before boxes arrive.

The scenario presses start and checks that boxes are placed and stacked in layers on the pallet, that nothing is dropped, and that the green lamp is on and every command is off at 60 s.

## Transfer between belts

Pick boxes from one belt with a two-axis pick and place and put them on another belt. The receiving belt stops while a box is set down, because a box counts as placed only once it rests.

The scenario presses start and checks that boxes are picked, placed and delivered, that nothing is dropped, and that the done lamp is on and every motion command is off at 45 s.

## Three-axis palletizing

Place boxes on a pallet in two layers with a three-axis gantry that takes numeric positions. The gantry raises its pad first, takes each box at the stop blade and puts it on a pallet slot.

The scenario presses start and checks that boxes are placed and stacked in layers, that nothing is dropped, and that the green lamp is on at 50 s.

## What is not claimed

The scenes run in the headless plant core. This page gives no frame rate and no latency for them: it is not yet measured on the reference machines.

## See also

- [The plant clock](./clock.md)
- [Scene file format](./scene-format.md)
- [Plant parts reference](./parts.md)
