---
title: 'Elevadores de tres niveles'
sidebar_label: 'Elevadores de tres niveles'
description: 'La escena three-level-lifts: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Elevadores de tres niveles

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/three-level-lifts. Do not edit. >>> */}

Lleve cinco cajas del nivel 1 al nivel 3 con dos elevadores y las cintas entre ellos. El elevador A lleva una caja de la entrada al nivel 2, una cinta de transferencia la lleva al elevador B, y el elevador B la sube a la salida en el nivel 3. Un paro de emergencia detiene la línea.

## Qué enseña

Coordinar dos elevadores que se entregan una caja y un paro de emergencia que detiene todos los movimientos.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 3 |
| Emisor de piezas | 1 |
| Elevador | 2 |
| Retirador de piezas | 1 |
| Sensor óptico difuso | 3 |
| Pulsador | 1 |
| Paro de emergencia | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `ThreeLevelLifts.Start` |
| `EStop1.ok` | sensor | BOOL | `ThreeLevelLifts.EStopOk` |
| `EyeFoot.detect` | sensor | BOOL | `ThreeLevelLifts.BoxOnA` |
| `EyeMid.detect` | sensor | BOOL | `ThreeLevelLifts.BoxOnB` |
| `EyeTop.detect` | sensor | BOOL | `ThreeLevelLifts.BoxAtTop` |
| `LiftA.atLevel1` | sensor | BOOL | `ThreeLevelLifts.AAtLow` |
| `LiftA.atLevel2` | sensor | BOOL | `ThreeLevelLifts.AAtHigh` |
| `LiftB.atLevel1` | sensor | BOOL | `ThreeLevelLifts.BAtLow` |
| `LiftB.atLevel2` | sensor | BOOL | `ThreeLevelLifts.BAtHigh` |
| `Infeed.run` | command | BOOL | `ThreeLevelLifts.RunInfeed` |
| `Transfer.run` | command | BOOL | `ThreeLevelLifts.RunTransfer` |
| `Outfeed.run` | command | BOOL | `ThreeLevelLifts.RunOutfeed` |
| `LiftA.up` | command | BOOL | `ThreeLevelLifts.AUp` |
| `LiftA.down` | command | BOOL | `ThreeLevelLifts.ADown` |
| `LiftA.run` | command | BOOL | `ThreeLevelLifts.ARun` |
| `LiftB.up` | command | BOOL | `ThreeLevelLifts.BUp` |
| `LiftB.down` | command | BOOL | `ThreeLevelLifts.BDown` |
| `LiftB.run` | command | BOOL | `ThreeLevelLifts.BRun` |
| `StackLight1.green` | command | BOOL | `ThreeLevelLifts.Green` |
| `StackLight1.red` | command | BOOL | `ThreeLevelLifts.Red` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 95 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| siempre | `fact:itemsDropped = false` |
| a los 16000 ms | `ThreeLevelLifts.Red = true` |
| desde 0 ms, dentro de 95000 ms | `fact:delivered:TopBin = true` |
| a los 95000 ms | `ThreeLevelLifts.Green = true` |

## Lecciones que usan esta escena

- [Mover cajas entre tres niveles](../../learn/lessons/plant-three-level-lifts.md)
- [Paro de emergencia y enclavamientos](../../learn/lessons/plant-estop-interlocks.md)
- [Paro de emergencia y enclavamientos en diagrama de escalera](../../learn/lessons/plant-estop-interlocks-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/three-level-lifts <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
