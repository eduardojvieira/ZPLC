---
title: 'Clasificación por altura con mesa giratoria'
sidebar_label: 'Clasificación por altura con mesa giratoria'
description: 'La escena height-sorting-turntable: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Clasificación por altura con mesa giratoria

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/height-sorting-turntable. Do not edit. >>> */}

Clasifique cajas por altura en tres retiradores con una cortina de luz y una mesa giratoria. La cortina de luz lee la altura de cada caja al pasar; la caja se detiene sobre la mesa, que gira para enviar las bajas de frente, las medianas a la derecha y las altas a la izquierda. La altura llega como un valor REAL.

## Qué enseña

Clasificar un número en tres clases con umbrales y encaminar cada clase a su propia salida.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 4 |
| Emisor de piezas | 1 |
| Cortina de luz | 1 |
| Tope retráctil | 1 |
| Sensor óptico difuso | 2 |
| Mesa giratoria | 1 |
| Retirador de piezas | 3 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `HeightSort.Start` |
| `LightArray1.detect` | sensor | BOOL | `HeightSort.ArrayBusy` |
| `EyeStop.detect` | sensor | BOOL | `HeightSort.AtBlade` |
| `EyeTable.detect` | sensor | BOOL | `HeightSort.OnTable` |
| `Table1.atCentre` | sensor | BOOL | `HeightSort.AtCentre` |
| `Table1.atLeft` | sensor | BOOL | `HeightSort.AtLeft` |
| `Table1.atRight` | sensor | BOOL | `HeightSort.AtRight` |
| `LightArray1.height` | sensor | REAL | `HeightSort.HeightCm` |
| `Infeed.run` | command | BOOL | `HeightSort.RunIn` |
| `Table1.run` | command | BOOL | `HeightSort.RunTable` |
| `OutCentre.run` | command | BOOL | `HeightSort.RunCentre` |
| `OutRight.run` | command | BOOL | `HeightSort.RunRight` |
| `OutLeft.run` | command | BOOL | `HeightSort.RunLeft` |
| `Stop1.extend` | command | BOOL | `HeightSort.Hold` |
| `Table1.toLeft` | command | BOOL | `HeightSort.ToLeft` |
| `Table1.toRight` | command | BOOL | `HeightSort.ToRight` |
| `Beacon.amber` | command | BOOL | `HeightSort.Busy` |
| `Beacon.green` | command | BOOL | `HeightSort.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 77 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `HeightSort.Hold = false`, `HeightSort.Busy = false`, `HeightSort.Done = false` |
| siempre | `fact:misrouted:BinShort = false`, `fact:misrouted:BinMedium = false`, `fact:misrouted:BinTall = false`, `fact:itemsDropped = false` |
| desde 0 ms, dentro de 77000 ms | `fact:sorted:BinShort = true`, `fact:sorted:BinMedium = true`, `fact:sorted:BinTall = true` |
| a los 77000 ms | `HeightSort.Done = true`, `HeightSort.Busy = false` |

## Lecciones que usan esta escena

- [Clasificar por altura, mesa giratoria](../../learn/lessons/plant-height-turntable.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/height-sorting-turntable <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
