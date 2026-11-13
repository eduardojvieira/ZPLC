---
title: 'Clasificación por altura con transferencia de cadenas'
sidebar_label: 'Clasificación por altura con transferencia de cadenas'
description: 'La escena height-sorting-chain: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Clasificación por altura con transferencia de cadenas

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/height-sorting-chain. Do not edit. >>> */}

Clasifique cajas por altura en tres retiradores con dos sensores de barrera a distinta altura y una transferencia de cadenas. Las dos barreras distinguen cajas bajas, medianas y altas; las bajas siguen de largo, y la transferencia levanta las medianas y las altas y las mueve de lado hacia uno u otro costado.

## Qué enseña

Leer una clase a partir de dos sensores de todo o nada en lugar de un solo número.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 4 |
| Emisor de piezas | 1 |
| Transferencia de cadenas | 1 |
| Tope retráctil | 1 |
| Sensor óptico difuso | 3 |
| Retirador de piezas | 3 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `HeightSortChain.Start` |
| `BeamLow.detect` | sensor | BOOL | `HeightSortChain.Low` |
| `BeamHigh.detect` | sensor | BOOL | `HeightSortChain.High` |
| `EyeChain.detect` | sensor | BOOL | `HeightSortChain.AtBlade` |
| `Chain1.raised` | sensor | BOOL | `HeightSortChain.Raised` |
| `Chain1.lowered` | sensor | BOOL | `HeightSortChain.Lowered` |
| `Infeed.run` | command | BOOL | `HeightSortChain.RunIn` |
| `Chain1.run` | command | BOOL | `HeightSortChain.RunChain` |
| `Chain1.lift` | command | BOOL | `HeightSortChain.Lift` |
| `Chain1.moveRight` | command | BOOL | `HeightSortChain.MoveRight` |
| `Chain1.moveLeft` | command | BOOL | `HeightSortChain.MoveLeft` |
| `Straight.run` | command | BOOL | `HeightSortChain.RunStraight` |
| `SideRight.run` | command | BOOL | `HeightSortChain.RunRight` |
| `SideLeft.run` | command | BOOL | `HeightSortChain.RunLeft` |
| `Stop1.extend` | command | BOOL | `HeightSortChain.Hold` |
| `Beacon.amber` | command | BOOL | `HeightSortChain.Busy` |
| `Beacon.green` | command | BOOL | `HeightSortChain.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 62 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `HeightSortChain.Hold = false`, `HeightSortChain.Lift = false`, `HeightSortChain.Done = false` |
| desde 0 ms, dentro de 62000 ms | `fact:sorted:BinShort = true`, `fact:sorted:BinMedium = true`, `fact:sorted:BinTall = true` |
| a los 62000 ms | `HeightSortChain.Done = true`, `HeightSortChain.Lift = false`, `HeightSortChain.MoveRight = false`, `HeightSortChain.MoveLeft = false` |
| siempre | `fact:misrouted:BinShort = false`, `fact:misrouted:BinMedium = false`, `fact:misrouted:BinTall = false`, `fact:itemsDropped = false` |

## Lecciones que usan esta escena

- [Clasificar por altura, transferencia de cadenas](../../learn/lessons/plant-height-chain.md)
- [Encontrar la falla](../../learn/lessons/plant-fault-actions.md)
- [Clasificar por altura, transferencia de cadenas en diagrama de escalera](../../learn/lessons/plant-height-chain-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/height-sorting-chain <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
