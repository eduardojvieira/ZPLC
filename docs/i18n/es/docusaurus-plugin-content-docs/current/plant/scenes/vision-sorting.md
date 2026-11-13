---
title: 'Clasificación con visión'
sidebar_label: 'Clasificación con visión'
description: 'La escena vision-sorting: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Clasificación con visión

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/vision-sorting. Do not edit. >>> */}

Separe dos productos con un sensor de visión y un brazo desviador. El sensor de visión lee el código de producto de cada caja al pasar; el brazo gira sobre la cinta para enviar el código 2 a una cinta lateral, y el código 1 sigue de largo. El código llega como un valor INT.

## Qué enseña

Encaminar por un código entero y devolver el brazo a su posición inicial después de cada caja.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 2 |
| Emisor de piezas | 1 |
| Sensor de visión | 1 |
| Brazo desviador | 1 |
| Retirador de piezas | 2 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `VisionSorting.Start` |
| `Vision1.detect` | sensor | BOOL | `VisionSorting.Seen` |
| `Vision1.code` | sensor | INT | `VisionSorting.Code` |
| `Infeed.run` | command | BOOL | `VisionSorting.RunIn` |
| `SideBelt.run` | command | BOOL | `VisionSorting.RunSide` |
| `Arm1.divert` | command | BOOL | `VisionSorting.Divert` |
| `Beacon.amber` | command | BOOL | `VisionSorting.Busy` |
| `Beacon.green` | command | BOOL | `VisionSorting.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 78 s
- Pulso más corto (`shortestPulseMs`): 1000 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| desde 0 ms, dentro de 78000 ms | `fact:sorted:Product1 = true`, `fact:sorted:Product2 = true` |
| a los 78000 ms | `VisionSorting.Done = true`, `VisionSorting.Divert = false` |
| siempre | `fact:misrouted:Product1 = false`, `fact:misrouted:Product2 = false`, `fact:itemsDropped = false` |

## Lecciones que usan esta escena

- [Clasificar por código de identidad](../../learn/lessons/plant-vision-sorting.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/vision-sorting <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
