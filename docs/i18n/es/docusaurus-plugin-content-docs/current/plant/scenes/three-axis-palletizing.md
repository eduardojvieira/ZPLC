---
title: 'Paletizado de tres ejes'
sidebar_label: 'Paletizado de tres ejes'
description: 'La escena three-axis-palletizing: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Paletizado de tres ejes

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/three-axis-palletizing. Do not edit. >>> */}

Coloque cajas sobre una tarima en dos capas con un pórtico de tres ejes que recibe posiciones numéricas. El pórtico sube primero su ventosa, toma cada caja en el tope retráctil y la deja en un lugar de la tarima.

## Qué enseña

Calcular posiciones de destino a partir de un número de lugar y un número de capa.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 1 |
| Emisor de piezas | 1 |
| Tope retráctil | 1 |
| Sensor óptico difuso | 1 |
| Pórtico de tres ejes | 1 |
| Tarima | 1 |
| Pulsador | 1 |
| Torre de luces | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `Gantry1.xSet` | command | INT | `Palletizing.XCmd` |
| `Gantry1.ySet` | command | INT | `Palletizing.YCmd` |
| `Gantry1.zSet` | command | INT | `Palletizing.ZCmd` |
| `Gantry1.xPos` | sensor | INT | `Palletizing.XPos` |
| `Gantry1.yPos` | sensor | INT | `Palletizing.YPos` |
| `Gantry1.zPos` | sensor | INT | `Palletizing.ZPos` |
| `Gantry1.grip` | command | BOOL | `Palletizing.Grip` |
| `Gantry1.gripped` | sensor | BOOL | `Palletizing.Gripped` |
| `StartButton.pressed` | sensor | BOOL | `Palletizing.Start` |
| `EyePick.detect` | sensor | BOOL | `Palletizing.EyePick` |
| `Belt1.run` | command | BOOL | `Palletizing.RunBelt` |
| `Emitter1.emit` | command | BOOL | `Palletizing.Emit` |
| `Blade1.extend` | command | BOOL | `Palletizing.Hold` |
| `StackLight1.green` | command | BOOL | `Palletizing.Green` |
| `StackLight1.amber` | command | BOOL | `Palletizing.Amber` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 50 s
- Pulso más corto (`shortestPulseMs`): 1300 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `Palletizing.Grip = false`, `Palletizing.RunBelt = false`, `Palletizing.Emit = false`, `Palletizing.Green = false` |
| desde 0 ms, dentro de 50000 ms | `fact:placed:Gantry1 = true`, `fact:layers:pallet:0 = true` |
| a los 50000 ms | `Palletizing.Green = true`, `Palletizing.Grip = false`, `Palletizing.Amber = false` |
| a los 50000 ms | `fact:stacked:pallet:0 = true`, `fact:itemsEmitted = true` |
| siempre | `fact:itemsDropped = false`, `fact:drops:Gantry1 = false` |

## Lecciones que usan esta escena

- [Paletizar con un pórtico](../../learn/lessons/plant-xyz-palletizing.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/three-axis-palletizing <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
