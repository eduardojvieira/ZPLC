---
title: 'Cinta hasta un sensor'
sidebar_label: 'Cinta hasta un sensor'
description: 'La escena belt-to-sensor: su meta, piezas, señales y lo que comprueba su escenario, generadas de sus archivos.'
tags: [plant, scenes, generated]
unlisted: true
---

# Cinta hasta un sensor

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes/belt-to-sensor. Do not edit. >>> */}

Arranque la cinta y envíe una caja. La cinta se detiene cuando el sensor lejano ve la caja.

## Qué enseña

Arrancar un actuador con un pulsador, recordar que está en marcha y detenerlo con un sensor.

## Piezas

| Pieza | Cantidad |
| --- | --- |
| Cinta transportadora | 1 |
| Emisor de piezas | 1 |
| Sensor óptico difuso | 1 |
| Pulsador | 1 |

## Señales

| Señal | Dirección | Tipo | Punto |
| --- | --- | --- | --- |
| `StartButton.pressed` | sensor | BOOL | `BeltToSensor.Start` |
| `EyeFar.detect` | sensor | BOOL | `BeltToSensor.EyeFar` |
| `Belt1.run` | command | BOOL | `BeltToSensor.Run` |
| `Emitter1.emit` | command | BOOL | `BeltToSensor.Emit` |

## El escenario

- Ciclo: 10 ms
- Duración del escenario: 8 s
- Pulso más corto (`shortestPulseMs`): 800 ms

### Qué comprueba el escenario

| Cuándo | Condición |
| --- | --- |
| a los 100 ms | `BeltToSensor.Run = false` |
| desde 0 ms, dentro de 8000 ms | `fact:count:EyeFar = true` |
| a los 8000 ms | `BeltToSensor.Run = false` |
| siempre | `fact:itemsDropped = false` |

## Lecciones que usan esta escena

- [Mover una caja hasta un sensor](../../learn/lessons/plant-belt-to-sensor.md)
- [Construir una escena de banda desde el suelo vacío](../../learn/lessons/plant-build-belt-scene.md)
- [Mover una caja hasta un sensor en diagrama de escalera](../../learn/lessons/plant-belt-to-sensor-ladder.md)
- [Construir una escena de banda desde el suelo vacío](../../learn/lessons/plant-build-belt-scene-ladder.md)

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](../clock.md)
- [Formato del archivo de escena](../scene-format.md)
- [Referencia de piezas de la planta](../parts.md)

{/* <<< END GENERATED: plant/scenes/belt-to-sensor <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
