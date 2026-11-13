---
title: 'Elevador con apilado'
sidebar_label: 'Elevador con apilado'
description: 'La escena lift-stacking: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Elevador con apilado

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/lift-stacking. Do not edit. >>> */}

Reúna hasta cinco piezas en una caja con un elevador. Una caja espera en el centro del elevador, el elevador sube hasta el alimentador, las piezas se alimentan una a una y se cuentan dentro de la caja, y la caja llena se baja y sale.

## Qué enseña

Una secuencia de movimientos del elevador con una cuenta, en la que el programa espera cada interruptor de posición antes del movimiento siguiente.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 3 |
| Emisor de piezas | 2 |
| Elevador | 1 |
| Retirador de piezas | 1 |
| Sensor óptico difuso | 3 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `LiftStacking.Start` |
| `CrateEye.detect` | sensor | BOOL | `LiftStacking.CrateEye` |
| `CountEye.detect` | sensor | BOOL | `LiftStacking.CountEye` |
| `OutEye.detect` | sensor | BOOL | `LiftStacking.OutEye` |
| `Lift1.atLevel1` | sensor | BOOL | `LiftStacking.AtLevel1` |
| `Lift1.atLevel2` | sensor | BOOL | `LiftStacking.AtLevel2` |
| `CrateSource.emit` | command | BOOL | `LiftStacking.EmitCrate` |
| `PartSource.emit` | command | BOOL | `LiftStacking.EmitPart` |
| `FloorIn.run` | command | BOOL | `LiftStacking.RunIn` |
| `FloorOut.run` | command | BOOL | `LiftStacking.RunOut` |
| `Feeder.run` | command | BOOL | `LiftStacking.RunFeeder` |
| `Lift1.up` | command | BOOL | `LiftStacking.Up` |
| `Lift1.down` | command | BOOL | `LiftStacking.Down` |
| `Lift1.run` | command | BOOL | `LiftStacking.RunLift` |
| `StackLight1.green` | command | BOOL | `LiftStacking.Green` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 60 s
- Pulso más corto (`shortestPulseMs`): 400 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| siempre | `fact:itemsDropped = false` |
| desde 0 ms, dentro de 60000 ms | `fact:loaded:crate:0 = true` |
| desde 0 ms, dentro de 60000 ms | `fact:delivered:CrateBin = true` |
| a los 60000 ms | `LiftStacking.Green = true` |

## Lecciones que usan esta escena

- [Reunir piezas en un cajón](../../learn/lessons/plant-lift-stacking.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/lift-stacking <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
