---
title: 'Biestable entre dos sensores'
sidebar_label: 'Biestable entre dos sensores'
description: 'La escena latch-two-sensors: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Biestable entre dos sensores

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/latch-two-sensors. Do not edit. >>> */}

Una caja viaja por una cinta frente a dos sensores. El primer sensor arranca la cinta y el segundo la detiene. Es un biestable de activación y desactivación.

## Qué enseña

El biestable de activación y desactivación, gobernado por dos sensores en lugar de dos pulsadores.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 1 |
| Caja | 1 |
| Sensor óptico difuso | 2 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `EyeA.detect` | sensor | BOOL | `LatchTwoSensors.EyeA` |
| `EyeB.detect` | sensor | BOOL | `LatchTwoSensors.EyeB` |
| `Belt1.run` | command | BOOL | `LatchTwoSensors.Run` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 8 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| desde 0 ms, dentro de 100 ms | `fact:count:EyeA = true` |
| desde 0 ms, dentro de 8000 ms | `fact:count:EyeB = true` |
| a los 8000 ms | `LatchTwoSensors.Run = false` |
| siempre | `fact:itemsDropped = false` |

## Lecciones que usan esta escena

- [Del sensor A al sensor B](../../learn/lessons/plant-latch-two-sensors.md)
- [Del sensor A al sensor B en diagrama de escalera](../../learn/lessons/plant-latch-two-sensors-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/latch-two-sensors <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
