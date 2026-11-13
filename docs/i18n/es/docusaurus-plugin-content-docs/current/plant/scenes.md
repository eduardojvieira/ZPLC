---
title: 'Las escenas incluidas'
sidebar_label: 'Las escenas incluidas'
description: 'Las escenas que se incluyen con ZPLC, qué debe hacer el programa en cada una y qué comprueba su escenario.'
tags: [plant, scenes, generated]
---

# Las escenas incluidas

{/* >>> GENERATED (tools/docs/generate_scene_pages.ts): plant/scenes. Do not edit. >>> */}

ZPLC incluye estas escenas, en orden de dificultad. Cada una tiene un archivo de escena, un mapa de la planta, un programa inicial, un escenario, un programa de referencia que pasa el escenario y un texto en inglés y en español. El escenario corre en el entorno de ejecución nativo y comprueba salidas del programa y hechos de la planta. El nombre de un hecho empieza con `fact:`, como `fact:count:EyeFar`. Una comprobación sobre un hecho es un sí o un no. Cada escena tiene su propia página, generada de sus archivos.

| Escena | Duración del escenario | Piezas |
| --- | --- | --- |
| [Cinta hasta un sensor](./scenes/belt-to-sensor.md) | 8 s | Cinta transportadora, Emisor de piezas, Sensor óptico difuso, Pulsador |
| [Biestable entre dos sensores](./scenes/latch-two-sensors.md) | 8 s | Cinta transportadora, Caja, Sensor óptico difuso ×2 |
| [Tanque temporizado](./scenes/timed-tank.md) | 25 s | Tanque, Pulsador, Paro de emergencia, Torre de luces |
| [Cola contada](./scenes/counted-queue.md) | 20 s | Cinta transportadora, Emisor de piezas, Sensor óptico difuso ×2, Retirador de piezas, Pulsador, Piloto luminoso |
| [Ensamble de dos ejes](./scenes/two-axis-assembly.md) | 40 s | Cinta transportadora ×3, Emisor de piezas ×2, Tope retráctil ×2, Sensor óptico difuso ×2, Manipulador de dos ejes, Retirador de piezas, Pulsador, Torre de luces |
| [Ensamble de dos ejes, numérico](./scenes/two-axis-assembly-numeric.md) | 40 s | Cinta transportadora ×3, Emisor de piezas ×2, Tope retráctil ×2, Sensor óptico difuso ×2, Manipulador de dos ejes, Retirador de piezas, Pulsador, Torre de luces |
| [Almacén con transelevador](./scenes/stacker-crane-warehouse.md) | 90 s | Transelevador, Cinta transportadora ×2, Emisor de piezas, Retirador de piezas, Sensor óptico difuso, Pulsador ×4, Torre de luces |
| [Búfer y liberación](./scenes/buffer-release.md) | 36 s | Cinta transportadora ×2, Emisor de piezas, Tope retráctil, Sensor óptico difuso ×3, Retirador de piezas, Pulsador ×2, Piloto luminoso ×2 |
| [Unión de dos líneas](./scenes/merge-lines.md) | 25 s | Cinta transportadora ×3, Emisor de piezas ×2, Tope retráctil ×2, Sensor óptico difuso ×3, Retirador de piezas, Pulsador, Piloto luminoso |
| [Elevador con apilado](./scenes/lift-stacking.md) | 60 s | Cinta transportadora ×3, Emisor de piezas ×2, Elevador, Retirador de piezas, Sensor óptico difuso ×3, Pulsador, Torre de luces |
| [Elevadores de tres niveles](./scenes/three-level-lifts.md) | 95 s | Cinta transportadora ×3, Emisor de piezas, Elevador ×2, Retirador de piezas, Sensor óptico difuso ×3, Pulsador, Paro de emergencia, Torre de luces |
| [Control de nivel de un tanque](./scenes/tank-level-control.md) | 90 s | Tanque, Potenciómetro ×2, Indicador numérico, Torre de luces |
| [Paletizador de capas](./scenes/layer-palletizer.md) | 60 s | Cinta transportadora, Emisor de piezas ×2, Sensor óptico difuso, Paletizador de capas, Tarima, Pulsador, Torre de luces |
| [Transferencia entre cintas](./scenes/belt-to-belt-transfer.md) | 45 s | Cinta transportadora ×2, Emisor de piezas, Tope retráctil, Sensor óptico difuso ×2, Manipulador de dos ejes, Retirador de piezas, Pulsador, Torre de luces |
| [Paletizado de tres ejes](./scenes/three-axis-palletizing.md) | 50 s | Cinta transportadora, Emisor de piezas, Tope retráctil, Sensor óptico difuso, Pórtico de tres ejes, Tarima, Pulsador, Torre de luces |
| [Línea de producción balanceada](./scenes/balanced-production-line.md) | 80 s | Cinta transportadora ×4, Emisor de piezas, Sensor óptico difuso ×3, Brazo desviador, Centro de mecanizado ×2, Retirador de piezas ×2, Pulsador, Torre de luces |
| [Separación por color](./scenes/colour-separation.md) | 50 s | Cinta transportadora ×3, Emisor de piezas, Tope retráctil, Sensor óptico difuso, Sensor de color, Empujador, Retirador de piezas ×2, Pulsador, Torre de luces |
| [Clasificación por altura con mesa giratoria](./scenes/height-sorting-turntable.md) | 77 s | Cinta transportadora ×4, Emisor de piezas, Cortina de luz, Tope retráctil, Sensor óptico difuso ×2, Mesa giratoria, Retirador de piezas ×3, Pulsador, Torre de luces |
| [Clasificación por altura con transferencia de cadenas](./scenes/height-sorting-chain.md) | 62 s | Cinta transportadora ×4, Emisor de piezas, Transferencia de cadenas, Tope retráctil, Sensor óptico difuso ×3, Retirador de piezas ×3, Pulsador, Torre de luces |
| [Clasificación por peso](./scenes/weight-sorting.md) | 85 s | Cinta transportadora ×3, Emisor de piezas, Tope retráctil, Báscula, Empujador, Retirador de piezas ×2, Pulsador, Torre de luces |
| [Clasificación con visión](./scenes/vision-sorting.md) | 78 s | Cinta transportadora ×2, Emisor de piezas, Sensor de visión, Brazo desviador, Retirador de piezas ×2, Pulsador, Torre de luces |

## Lo que no se afirma

La escena corre en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ella: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](./clock.md)
- [Formato del archivo de escena](./scene-format.md)
- [Referencia de piezas de la planta](./parts.md)

{/* <<< END GENERATED: plant/scenes <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
