---
title: 'Unión de dos líneas'
sidebar_label: 'Unión de dos líneas'
description: 'La escena merge-lines: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Unión de dos líneas

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/merge-lines. Do not edit. >>> */}

Dos líneas de alimentación cargan tres cajas cada una y se encuentran en una zona de unión. El programa concede la zona a una línea a la vez, primero la línea A. Una concesión termina cuando su caja salió de la zona.

## Qué enseña

Compartir un recurso entre dos solicitantes, de modo que dos cajas nunca coincidan en la zona.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 3 |
| Emisor de piezas | 2 |
| Tope retráctil | 2 |
| Sensor óptico difuso | 3 |
| Retirador de piezas | 1 |
| Pulsador | 1 |
| Piloto luminoso | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `MergeLines.Start` |
| `EyeA.detect` | sensor | BOOL | `MergeLines.WaitA` |
| `EyeB.detect` | sensor | BOOL | `MergeLines.WaitB` |
| `EyeZone.detect` | sensor | BOOL | `MergeLines.Zone` |
| `FeedA.run` | command | BOOL | `MergeLines.RunA` |
| `FeedB.run` | command | BOOL | `MergeLines.RunB` |
| `Outfeed.run` | command | BOOL | `MergeLines.RunOut` |
| `EmitterA.emit` | command | BOOL | `MergeLines.EmitA` |
| `EmitterB.emit` | command | BOOL | `MergeLines.EmitB` |
| `BladeA.extend` | command | BOOL | `MergeLines.HoldA` |
| `BladeB.extend` | command | BOOL | `MergeLines.HoldB` |
| `DoneLight.lit` | command | BOOL | `MergeLines.Done` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 25 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `MergeLines.HoldA = false`, `MergeLines.HoldB = false`, `MergeLines.Done = false` |
| a los 1000 ms | `MergeLines.HoldA = true`, `MergeLines.HoldB = true`, `fact:itemsRemoved = false` |
| desde 0 ms, dentro de 25000 ms | `fact:delivered:Remover1 = true`, `fact:emitted:EmitterA = true`, `fact:emitted:EmitterB = true` |
| a los 25000 ms | `MergeLines.Done = true`, `MergeLines.HoldA = true`, `MergeLines.HoldB = true` |
| siempre | `fact:itemsDropped = false`, `fact:itemsCollided = false` |

## Lecciones que usan esta escena

- [Fusionar dos líneas](../../learn/lessons/plant-merge-lines.md)
- [Modificar una escena: alimentar la segunda línea](../../learn/lessons/plant-change-scene.md)
- [Fusionar dos líneas en diagrama de escalera](../../learn/lessons/plant-merge-lines-ladder.md)
- [Modificar una escena: alimentar la segunda línea](../../learn/lessons/plant-change-scene-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/merge-lines <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
