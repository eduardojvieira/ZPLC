---
title: 'Línea de producción balanceada'
sidebar_label: 'Línea de producción balanceada'
description: 'La escena balanced-production-line: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Línea de producción balanceada

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/balanced-production-line. Do not edit. >>> */}

Produzca la misma cantidad de tapas y de bases con dos centros de maquinado. Las piezas en bruto llegan por una cinta y un brazo desviador envía una de cada dos a la máquina que hace bases; la otra máquina hace tapas y es más rápida. Los productos terminados salen por dos cintas.

## Qué enseña

Un bloque de función usado para dos máquinas y el reparto del trabajo entre máquinas con distinto tiempo de ciclo alternando las piezas.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 4 |
| Emisor de piezas | 1 |
| Sensor óptico difuso | 3 |
| Brazo desviador | 1 |
| Centro de mecanizado | 2 |
| Retirador de piezas | 2 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `ProductionLine.Start` |
| `Gate.detect` | sensor | BOOL | `ProductionLine.Gate` |
| `EyeA.detect` | sensor | BOOL | `ProductionLine.EyeA` |
| `EyeB.detect` | sensor | BOOL | `ProductionLine.EyeB` |
| `MachineA.ready` | sensor | BOOL | `ProductionLine.ReadyA` |
| `MachineA.done` | sensor | BOOL | `ProductionLine.DoneA` |
| `MachineB.ready` | sensor | BOOL | `ProductionLine.ReadyB` |
| `MachineB.done` | sensor | BOOL | `ProductionLine.DoneB` |
| `Infeed.run` | command | BOOL | `ProductionLine.RunInfeed` |
| `BranchB.run` | command | BOOL | `ProductionLine.RunBranch` |
| `OutA.run` | command | BOOL | `ProductionLine.RunOutA` |
| `OutB.run` | command | BOOL | `ProductionLine.RunOutB` |
| `Arm1.divert` | command | BOOL | `ProductionLine.Divert` |
| `MachineA.feed` | command | BOOL | `ProductionLine.FeedA` |
| `MachineA.start` | command | BOOL | `ProductionLine.StartA` |
| `MachineB.feed` | command | BOOL | `ProductionLine.FeedB` |
| `MachineB.start` | command | BOOL | `ProductionLine.StartB` |
| `Beacon.green` | command | BOOL | `ProductionLine.Green` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 80 s
- Pulso más corto (`shortestPulseMs`): 400 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| siempre | `fact:itemsDropped = false`, `fact:misfires:MachineA = false`, `fact:misfires:MachineB = false` |
| desde 0 ms, dentro de 80000 ms | `fact:produced:MachineA = true`, `fact:produced:MachineB = true`, `fact:delivered:LidBin = true`, `fact:delivered:BaseBin = true` |
| a los 80000 ms | `ProductionLine.Green = true` |

## Lecciones que usan esta escena

- [Equilibrar una línea de producción](../../learn/lessons/plant-production-line.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/balanced-production-line <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
