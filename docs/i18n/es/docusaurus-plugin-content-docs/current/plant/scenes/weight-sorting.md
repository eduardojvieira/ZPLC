---
title: 'Clasificación por peso'
sidebar_label: 'Clasificación por peso'
description: 'La escena weight-sorting: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Clasificación por peso

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/weight-sorting. Do not edit. >>> */}

Clasifique cajas por peso con una báscula y un empujador. Cada caja espera sobre la báscula en un tope retráctil hasta que la lectura es estable; un empujador envía las cajas de más de 3.5 kg a una cinta lateral y las más livianas siguen de largo. El peso llega como un valor REAL en kilogramos.

## Qué enseña

Esperar a que una lectura con ruido se estabilice antes de compararla con un umbral.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 3 |
| Emisor de piezas | 1 |
| Tope retráctil | 1 |
| Báscula | 1 |
| Empujador | 1 |
| Retirador de piezas | 2 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `WeightSorter.Start` |
| `Scale1.stable` | sensor | BOOL | `WeightSorter.Stable` |
| `Pusher1.extended` | sensor | BOOL | `WeightSorter.Extended` |
| `Pusher1.retracted` | sensor | BOOL | `WeightSorter.Retracted` |
| `Scale1.weight` | sensor | REAL | `WeightSorter.Weight` |
| `Infeed.run` | command | BOOL | `WeightSorter.RunInfeed` |
| `Outfeed.run` | command | BOOL | `WeightSorter.RunOutfeed` |
| `SideBelt.run` | command | BOOL | `WeightSorter.RunSide` |
| `Blade1.extend` | command | BOOL | `WeightSorter.Hold` |
| `Pusher1.extend` | command | BOOL | `WeightSorter.Push` |
| `StackLight1.green` | command | BOOL | `WeightSorter.Green` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 85 s
- Pulso más corto (`shortestPulseMs`): 40 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| siempre | `fact:misrouted:HeavyBin = false`, `fact:misrouted:LightBin = false`, `fact:itemsDropped = false` |
| desde 0 ms, dentro de 85000 ms | `fact:sorted:HeavyBin = true` |
| desde 0 ms, dentro de 85000 ms | `fact:sorted:LightBin = true` |
| a los 85000 ms | `WeightSorter.Green = true` |

## Lecciones que usan esta escena

- [Clasificar por peso](../../learn/lessons/plant-weight-sorting.md)
- [Clasificar por peso en diagrama de escalera](../../learn/lessons/plant-weight-sorting-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/weight-sorting <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
