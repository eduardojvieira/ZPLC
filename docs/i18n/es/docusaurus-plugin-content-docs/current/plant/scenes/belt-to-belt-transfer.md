---
title: 'Transferencia entre cintas'
sidebar_label: 'Transferencia entre cintas'
description: 'La escena belt-to-belt-transfer: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Transferencia entre cintas

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/belt-to-belt-transfer. Do not edit. >>> */}

Tome cajas de una cinta con un manipulador de dos ejes y déjelas en otra cinta. La cinta que recibe se detiene mientras se deja una caja, porque una caja cuenta como colocada solo cuando queda en reposo.

## Qué enseña

Pasar una pieza de una máquina a otra y esperar a que quede en reposo antes de seguir.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 2 |
| Emisor de piezas | 1 |
| Tope retráctil | 1 |
| Sensor óptico difuso | 2 |
| Manipulador de dos ejes | 1 |
| Retirador de piezas | 1 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `BeltTransfer.Start` |
| `EyePick.detect` | sensor | BOOL | `BeltTransfer.Waiting` |
| `EyeOut.detect` | sensor | BOOL | `BeltTransfer.OutEye` |
| `Pick1.xAtMin` | sensor | BOOL | `BeltTransfer.XMin` |
| `Pick1.xAtMax` | sensor | BOOL | `BeltTransfer.XMax` |
| `Pick1.yAtMin` | sensor | BOOL | `BeltTransfer.YMin` |
| `Pick1.yAtMax` | sensor | BOOL | `BeltTransfer.YMax` |
| `Pick1.gripped` | sensor | BOOL | `BeltTransfer.Gripped` |
| `Infeed.run` | command | BOOL | `BeltTransfer.RunIn` |
| `Outfeed.run` | command | BOOL | `BeltTransfer.RunOut` |
| `Source1.emit` | command | BOOL | `BeltTransfer.Emit` |
| `Stop1.extend` | command | BOOL | `BeltTransfer.Hold` |
| `Pick1.xPlus` | command | BOOL | `BeltTransfer.XPlus` |
| `Pick1.xMinus` | command | BOOL | `BeltTransfer.XMinus` |
| `Pick1.yPlus` | command | BOOL | `BeltTransfer.YPlus` |
| `Pick1.yMinus` | command | BOOL | `BeltTransfer.YMinus` |
| `Pick1.grip` | command | BOOL | `BeltTransfer.Grip` |
| `Beacon.amber` | command | BOOL | `BeltTransfer.Busy` |
| `Beacon.green` | command | BOOL | `BeltTransfer.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 45 s
- Pulso más corto (`shortestPulseMs`): 330 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `BeltTransfer.Hold = false`, `BeltTransfer.Grip = false`, `BeltTransfer.XPlus = false`, `BeltTransfer.YPlus = false`, `BeltTransfer.Done = false` |
| a los 1500 ms | `BeltTransfer.Hold = true`, `BeltTransfer.Busy = true`, `BeltTransfer.Done = false` |
| desde 0 ms, dentro de 45000 ms | `fact:picked:Pick1 = true`, `fact:placed:Pick1 = true`, `fact:delivered:Remover1 = true` |
| a los 45000 ms | `BeltTransfer.Done = true`, `BeltTransfer.XPlus = false`, `BeltTransfer.XMinus = false`, `BeltTransfer.YPlus = false`, `BeltTransfer.YMinus = false`, `BeltTransfer.Grip = false` |
| siempre | `fact:itemsDropped = false`, `fact:drops:Pick1 = false` |

## Lecciones que usan esta escena

- [Tomar de una banda y dejar en otra](../../learn/lessons/plant-belt-transfer.md)
- [Tomar de una banda y dejar en otra en diagrama de escalera](../../learn/lessons/plant-belt-transfer-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/belt-to-belt-transfer <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
