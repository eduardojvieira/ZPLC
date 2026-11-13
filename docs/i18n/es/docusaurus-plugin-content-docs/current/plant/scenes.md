---
title: 'Las cinco primeras escenas'
sidebar_label: 'Las cinco primeras escenas'
description: 'Las cinco escenas que se incluyen con ZPLC, qué debe hacer el programa en cada una y qué comprueba su escenario.'
tags: [plant, scenes]
---

# Las cinco primeras escenas

ZPLC incluye cinco escenas, en orden de dificultad. Cada una tiene un archivo de escena, un mapa de la planta, un programa inicial, un escenario y un programa de referencia que pasa el escenario. El escenario corre en el entorno de ejecución nativo con un ciclo de 10 ms y comprueba salidas del programa y hechos de la planta. El nombre de un hecho empieza con `fact:`, como `fact:count:EyeFar`. Una comprobación sobre un hecho es un sí o un no. Los nombres de las escenas son los de sus archivos, en inglés.

| Escena                      | Duración del escenario | Piezas                                                                                                        |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt to sensor`            | 8 s                    | cinta, emisor, sensor difuso, pulsador                                                                        |
| `Latch between two sensors` | 8 s                    | cinta, caja, dos sensores difusos                                                                             |
| `Counted queue`             | 20 s                   | cinta, emisor, dos sensores difusos, retirador, pulsador, piloto luminoso                                     |
| `Buffer and release`        | 36 s                   | dos cintas, emisor, tope retráctil, tres sensores difusos, retirador, dos pulsadores, dos pilotos luminosos   |
| `Merge two lines`           | 25 s                   | tres cintas, dos emisores, dos topes retráctiles, tres sensores difusos, retirador, pulsador, piloto luminoso |

## Belt to sensor

Arranque la cinta y envíe una caja. La cinta se detiene cuando el sensor lejano ve la caja.

El escenario pulsa el botón de inicio y comprueba que la cinta está apagada antes del inicio, que el sensor lejano cuenta una caja en menos de 8 s, que la cinta está apagada al final y que no cae ninguna caja.

## Latch between two sensors

Una caja viaja por una cinta frente a dos sensores. El primer sensor arranca la cinta y el segundo la detiene. Es un enclavamiento de activación y desactivación.

El escenario comprueba que el primer sensor cuenta una caja en menos de 100 ms, que el segundo cuenta una en menos de 8 s, que la cinta está apagada al final y que no cae ninguna caja.

## Counted queue

Envíe tres cajas una tras otra y deténgase cuando las tres hayan salido de la cinta. Cada caja siguiente sale cuando la anterior dejó el emisor. Un contador lleva el total.

El escenario comprueba que la cinta y el piloto de fin están apagados antes del inicio, que el retirador recibe una caja y el emisor emite una, que a los 20 s el piloto de fin está encendido y la cinta apagada, y que ninguna caja cae ni choca.

## Buffer and release

Cargue cinco cajas en una cinta de almacén, retenga las cajas en un tope retráctil y libere una caja por cada pulsación del botón de liberación. La caja siguiente no debe seguir a la liberada.

El escenario comprueba, entre otras cosas, que el programa retiene la línea a los 8 s, que a los 15,5 s dos sensores cuentan cajas y el sensor de liberación no cuenta ninguna, que una liberación funciona a los 18,5 s, que a los 36 s el piloto de fin está encendido, que se emite y se entrega una caja, y que la salida de falla se mantiene apagada sin que caiga ni choque ninguna caja.

## Merge two lines

Dos líneas de alimentación cargan tres cajas cada una y se encuentran en una zona de unión. El programa concede la zona a una línea a la vez, primero la línea A. Una concesión termina cuando su caja salió de la zona.

El escenario comprueba que a 1 s ambos topes retienen sin que se retire ninguna caja, que ambos emisores emiten y el retirador recibe una caja, que a los 25 s el piloto de fin está encendido con ambos topes reteniendo, y que ninguna caja cae ni choca.

## Lo que no se afirma

Las escenas corren en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ellas: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](./clock.md)
- [Formato del archivo de escena](./scene-format.md)
- [Referencia de piezas de la planta](./parts.md)
