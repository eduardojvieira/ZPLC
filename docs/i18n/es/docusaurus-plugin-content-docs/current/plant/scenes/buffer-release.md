---
title: 'Búfer y liberación'
sidebar_label: 'Búfer y liberación'
description: 'La escena buffer-release: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Búfer y liberación

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/buffer-release. Do not edit. >>> */}

Cargue cinco cajas en una cinta de almacén, retenga las cajas en un tope retráctil y libere una caja por cada pulsación del botón de liberación. La caja siguiente no debe seguir a la liberada.

## Qué enseña

Acumular piezas y liberarlas de una en una a petición.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 2 |
| Emisor de piezas | 1 |
| Tope retráctil | 1 |
| Sensor óptico difuso | 3 |
| Retirador de piezas | 1 |
| Pulsador | 2 |
| Piloto luminoso | 2 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `BufferRelease.Start` |
| `ReleaseButton.pressed` | sensor | BOOL | `BufferRelease.ReleaseCmd` |
| `EyeFull.detect` | sensor | BOOL | `BufferRelease.EyeFull` |
| `EyeBlade.detect` | sensor | BOOL | `BufferRelease.EyeBlade` |
| `EyeRelease.detect` | sensor | BOOL | `BufferRelease.EyeRelease` |
| `Buffer1.run` | command | BOOL | `BufferRelease.RunBuffer` |
| `Release1.run` | command | BOOL | `BufferRelease.RunRelease` |
| `Emitter1.emit` | command | BOOL | `BufferRelease.Emit` |
| `Blade1.extend` | command | BOOL | `BufferRelease.Hold` |
| `DoneLight.lit` | command | BOOL | `BufferRelease.Done` |
| `FaultLight.lit` | command | BOOL | `BufferRelease.Fault` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 36 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `BufferRelease.Hold = false`, `BufferRelease.Done = false` |
| a los 8000 ms | `BufferRelease.Hold = true` |
| a los 15500 ms | `BufferRelease.Hold = true`, `fact:count:EyeFull = true`, `fact:count:EyeBlade = true`, `fact:count:EyeRelease = false`, `fact:itemsRemoved = false` |
| a los 18500 ms | `BufferRelease.Hold = true`, `fact:count:EyeRelease = true` |
| a los 36000 ms | `BufferRelease.Done = true`, `BufferRelease.Hold = true` |
| desde 0 ms, dentro de 36000 ms | `fact:emitted:Emitter1 = true`, `fact:delivered:Remover1 = true` |
| siempre | `BufferRelease.Fault = false`, `fact:itemsDropped = false`, `fact:itemsCollided = false` |

## Lecciones que usan esta escena

- [Acumular y liberar](../../learn/lessons/plant-buffer-release.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/buffer-release <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
