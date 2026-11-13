---
title: 'Sensores de clasificación y piezas desviadoras'
sidebar_label: 'Clasificar y desviar'
description: 'Cómo distingue la planta unas piezas de otras y las envía a destinos distintos: propiedades de la pieza, clases y umbrales, los sensores de clasificación, las piezas desviadoras y la calificación de un retirador.'
tags: [plant, reference]
---

# Sensores de clasificación y piezas desviadoras

Una escena de clasificación entrega a su programa piezas distintas, sensores que las distinguen y piezas que envían cada una a un destino. La [referencia de piezas](./parts.md) lista cada ajuste, señal y acción de falla; esta página explica las reglas que los conectan. Los umbrales de abajo son los valores de esta versión, no verdades físicas.

## Propiedades de la pieza

Una pieza lleva propiedades que los sensores leen. Una caja tiene altura, masa y un código opcional. Una `workpiece` (pieza) es un bloque de 0,2 por 0,2 m y 0,1 m de alto, de 0,5 kg por defecto.

| Propiedad | Valores                     | Pieza               | La lee                                                      |
| --------- | --------------------------- | ------------------- | ----------------------------------------------------------- |
| Color     | red, blue                   | pieza               | el sensor de color (`match`), el retirador (`red`, `blue`)  |
| Material  | plastic, metal              | pieza               | el sensor inductivo, el retirador (`metal`, `plastic`)      |
| Código    | 0 a 9 (0 significa ninguno) | pieza, caja         | el sensor de visión, el retirador (`code`)                  |
| Altura    | 0,2, 0,3 o 0,4 m (caja)     | caja                | la cortina de luz, el retirador (`short`, `medium`, `tall`) |
| Masa      | 2 o 5 kg (caja)             | caja, pieza, tarima | la báscula, el retirador (`light`, `heavy`)                 |

El emisor fija las propiedades. Su ajuste `vary` sortea un número con semilla por pieza: `colour` (pieza), `weight` (caja, 2 o 5 kg) o `code` (pieza o caja, de 1 a `codes`). Un `vary` que no aplica al tipo no tiene efecto. Como el sorteo usa semilla, la misma escena da la misma secuencia de piezas.

## Clases y umbrales

Un retirador con `accepts` distinto de `any` califica lo que recibe.

| Clase              | Una pieza pertenece cuando                   |
| ------------------ | -------------------------------------------- |
| `short`            | la altura es de 0,25 m o menos               |
| `medium`           | la altura es mayor que 0,25 m y hasta 0,35 m |
| `tall`             | la altura es mayor que 0,35 m                |
| `light`            | la masa es de 3,5 kg o menos                 |
| `heavy`            | la masa es mayor que 3,5 kg                  |
| `red`, `blue`      | su color es ese color                        |
| `metal`, `plastic` | su material es ese material                  |
| `code`             | su código es igual a `acceptsCode`           |

Los bordes de altura quedan a 50 mm de las tres alturas de caja, y el borde de peso queda entre las dos masas de caja. Una tarima no coincide con ninguna clase, solo con `any`.

### Clasificadas y mal enrutadas

Un retirador retira cada pieza cuyo centro entra en su volumen y la cuenta como `delivered` (entregada). Con `accepts` distinto de `any` publica además dos hechos: `sorted` para las piezas que coinciden y `misrouted` para las que no. `sorted` más `misrouted` siempre es igual a `delivered`. Un escenario los verifica como cualquier otro hecho.

## Sensores de clasificación

Cada sensor de haz lanza un haz a lo largo de su +x, a `heightM` sobre la pieza, durante `rangeM`. La vista 3D dibuja el haz con su alcance real.

| Sensor                   | Señales           | Regla                                                                                                  |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------ |
| Difuso, retrorreflectivo | `detect`          | Cualquier cuerpo que corte el haz.                                                                     |
| Inductivo                | `detect`          | Solo piezas metálicas. Las de plástico, las cajas y las tarimas pasan sin ser vistas.                  |
| Capacitivo               | `detect`          | Cualquier pieza o tarima, sea metálica o no. El piso y las cintas nunca cuentan.                       |
| Color                    | `detect`, `match` | `detect` con cualquier pieza. `match` cuando la pieza tiene el color fijado en `target` (aprendizaje). |

Una pieza sin color nunca coincide con el sensor de color.

### Sensores numéricos

Tres sensores dan un número en lugar de un interruptor. Son [señales numéricas](./numeric-signals.md) y siguen su escalado.

- **Cortina de luz.** Una fila de `beams` haces a través de la línea, uno cada `pitchM`, el primero a medio paso sobre la pieza. `height` (`REAL`, metros) es el borde superior de la pieza más alta que corta un haz, **en pasos de `pitchM`**: con el valor por defecto de 0,05 m las tres cajas leen 0,20, 0,30 y 0,40. Lee 0 cuando ningún haz está cortado.
- **Báscula.** Suma las masas de las piezas cuyo centro está dentro de su volumen de pesaje. `weight` (`REAL`, kg) es esa suma redondeada a 0,01 kg **solo mientras la carga está en reposo**, y 0 en caso contrario. `stable` es TRUE cuando una pieza lleva en reposo (a lo sumo 0,05 m/s) durante `settleMs`. Una carga mayor que `rangeKg` lee `rangeKg`. La báscula es estática: no lee fuerza de contacto.
- **Sensor de visión.** `code` (`INT`, 0 a 9) es el código de la pieza más cercana al centro de su campo, y 0 cuando el campo está vacío o la pieza no tiene código. Lee un código, no una imagen.

## Piezas desviadoras

Cuatro piezas envían una pieza hacia un lado o a otra línea. En todas **la derecha es +z** en el sistema de la propia pieza.

| Pieza            | Órdenes                                | Límites y sensores              | Regla                                                                                     |
| ---------------- | -------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| `pusher`         | `extend`                               | `extended`, `retracted`         | Un tope que se mueve `strokeM` a lo largo de +z mientras `extend` es TRUE y vuelve si no. |
| `diverter-arm`   | `divert`                               | `diverted`, `home`              | Un tope articulado que gira `angleDeg` hacia +z mientras `divert` es TRUE.                |
| `chain-transfer` | `lift`, `run`, `moveRight`, `moveLeft` | `raised`, `lowered`             | Bajada es una cinta. Subida, mueve las piezas de lado.                                    |
| `turntable`      | `run`, `toLeft`, `toRight`             | `atCentre`, `atLeft`, `atRight` | Gira a izquierda, centro o derecha y lleva las piezas a lo largo de su propio +x.         |

- **Detenerse, luego girar.** La superficie de una transferencia de cadenas y de una mesa giratoria se detiene antes de cambiar de sentido (el movimiento lateral de la transferencia) o de girar (la mesa). Arranca de nuevo cuando ha llegado, así que `run` puede seguir en TRUE. Las órdenes en conflicto no hacen nada.
- **Ángulo del brazo desviador.** `angleDeg` va de 15 a 35 grados, porque un brazo más inclinado detiene las cajas contra él. El brazo por defecto, de 0,8 m a 35 grados, alcanza unos 0,46 m de lado, así que una escena que necesite una cinta lateral define un brazo más largo.
- **Velocidad angular.** El brazo y la mesa giratoria aplican una rampa a su velocidad angular, así que nunca arrancan de golpe.

## Fallas y lo que enseñan

| Pieza                      | Falla                       | Qué hace                                | Qué enseña                                          |
| -------------------------- | --------------------------- | --------------------------------------- | --------------------------------------------------- |
| Sensores de haz            | `stuckOn`, `stuckOff`       | `detect` queda en TRUE o en FALSE       | Contrastar una lectura con otra señal               |
| Sensor de color            | `wrongColour`               | Invierte `match`                        | A un sensor se le puede enseñar el color equivocado |
| Cortina de luz, báscula    | `readingStuck`              | La lectura se mantiene                  | Un valor congelado parece válido                    |
| Cortina de luz, báscula    | `readingOffset`             | Suma un paso (cortina) o 2 kg (báscula) | Un error constante desplaza cada decisión           |
| Sensor de visión           | `blind`, `misread`          | Lee 0, o lee otro código                | No confiar en una sola lectura para enrutar         |
| Empujador, brazo desviador | `stuck`                     | El tope se detiene donde está           | Usar las señales de límite, no el tiempo            |
| Transferencia de cadenas   | `liftStuck`, `stall`, `jam` | Se detiene la elevación o la superficie | Detectar una pieza que no llega                     |
| Mesa giratoria             | `turnStuck`, `stall`, `jam` | Se detiene el giro o la superficie      | Detectar una pieza que no llega                     |

Una báscula vacía que no es estable, con la falla `readingOffset` activa, lee 2 kg: el desfase se suma al 0 de una báscula inestable.

## Límites de este modelo

- La báscula es estática y no lee fuerza de contacto.
- Los ángulos usan una tabla con una resolución de 0,25 grados.
- Los topes de los desviadores son los únicos cuerpos de esas piezas.
- La planta es un modelo. Un resultado aquí no dice cómo se comporta una máquina clasificadora real.

## Qué está medido

El núcleo de la planta es determinista y su traza está fijada en Linux; macOS y Windows aún no se han medido. La tasa de cuadros, la latencia del enlace y el costo por ciclo todavía no se miden en las máquinas de referencia, así que esta página no da ninguna cifra para ellos.
