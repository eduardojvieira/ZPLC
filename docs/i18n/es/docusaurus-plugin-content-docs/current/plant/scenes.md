---
title: 'Las escenas incluidas'
sidebar_label: 'Las escenas incluidas'
description: 'Las escenas que se incluyen con ZPLC, qué debe hacer el programa en cada una y qué comprueba su escenario.'
tags: [plant, scenes]
---

# Las escenas incluidas

ZPLC incluye estas escenas, en orden de dificultad. Cada una tiene un archivo de escena, un mapa de la planta, un programa inicial, un escenario y un programa de referencia que pasa el escenario. El escenario corre en el entorno de ejecución nativo con un ciclo de 10 ms y comprueba salidas del programa y hechos de la planta. El nombre de un hecho empieza con `fact:`, como `fact:count:EyeFar`. Una comprobación sobre un hecho es un sí o un no. Los nombres de las escenas son los de sus archivos, en inglés.

| Escena                      | Duración del escenario | Piezas                                                                                                        |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Belt to sensor`            | 8 s                    | cinta, emisor, sensor difuso, pulsador                                                                        |
| `Latch between two sensors` | 8 s                    | cinta, caja, dos sensores difusos                                                                             |
| `Timed tank`                | 25 s                   | tanque, pulsador, paro de emergencia, torre de luces                                                          |
| `Counted queue`             | 20 s                   | cinta, emisor, dos sensores difusos, retirador, pulsador, piloto luminoso                                     |
| `Buffer and release`        | 36 s                   | dos cintas, emisor, tope retráctil, tres sensores difusos, retirador, dos pulsadores, dos pilotos luminosos   |
| `Merge two lines`           | 25 s                   | tres cintas, dos emisores, dos topes retráctiles, tres sensores difusos, retirador, pulsador, piloto luminoso |
| `Tank level control`        | 90 s                   | tanque, dos potenciómetros, indicador numérico, torre de luces                                                |

## Belt to sensor

Arranque la cinta y envíe una caja. La cinta se detiene cuando el sensor lejano ve la caja.

El escenario pulsa el botón de inicio y comprueba que la cinta está apagada antes del inicio, que el sensor lejano cuenta una caja en menos de 8 s, que la cinta está apagada al final y que no cae ninguna caja.

## Latch between two sensors

Una caja viaja por una cinta frente a dos sensores. El primer sensor arranca la cinta y el segundo la detiene. Es un enclavamiento de activación y desactivación.

El escenario comprueba que el primer sensor cuenta una caja en menos de 100 ms, que el segundo cuenta una en menos de 8 s, que la cinta está apagada al final y que no cae ninguna caja.

## Timed tank

Llene un tanque durante un tiempo fijo con un temporizador, manténgalo lleno un momento y luego vacíelo hasta que el interruptor de nivel bajo indique un nivel bajo. Una pulsación del botón de inicio comienza el ciclo. El paro de emergencia cierra las dos válvulas en cualquier momento y enciende la luz roja.

El escenario pulsa el inicio, pulsa el paro de emergencia a mitad del llenado y lo suelta, y vuelve a pulsar el inicio. Comprueba que las válvulas y las luces están apagadas antes del inicio, que la válvula de llenado y la luz ámbar están encendidas durante el llenado, que las dos válvulas están cerradas y la luz roja encendida durante el paro de emergencia, que la luz verde está encendida y la válvula de vaciado cerrada a los 25 s, y que el tanque nunca rebosa.

## Counted queue

Envíe tres cajas una tras otra y deténgase cuando las tres hayan salido de la cinta. Cada caja siguiente sale cuando la anterior dejó el emisor. Un contador lleva el total.

El escenario comprueba que la cinta y el piloto de fin están apagados antes del inicio, que el retirador recibe una caja y el emisor emite una, que a los 20 s el piloto de fin está encendido y la cinta apagada, y que ninguna caja cae ni choca.

## Buffer and release

Cargue cinco cajas en una cinta de almacén, retenga las cajas en un tope retráctil y libere una caja por cada pulsación del botón de liberación. La caja siguiente no debe seguir a la liberada.

El escenario comprueba, entre otras cosas, que el programa retiene la línea a los 8 s, que a los 15,5 s dos sensores cuentan cajas y el sensor de liberación no cuenta ninguna, que una liberación funciona a los 18,5 s, que a los 36 s el piloto de fin está encendido, que se emite y se entrega una caja, y que la salida de falla se mantiene apagada sin que caiga ni choque ninguna caja.

## Merge two lines

Dos líneas de alimentación cargan tres cajas cada una y se encuentran en una zona de unión. El programa concede la zona a una línea a la vez, primero la línea A. Una concesión termina cuando su caja salió de la zona.

El escenario comprueba que a 1 s ambos topes retienen sin que se retire ninguna caja, que ambos emisores emiten y el retirador recibe una caja, que a los 25 s el piloto de fin está encendido con ambos topes reteniendo, y que ninguna caja cae ni choca.

## Tank level control

Mantenga el nivel de un tanque en un valor de consigna con un lazo PID. La consigna viene de un potenciómetro en metros, un segundo potenciómetro abre la válvula de descarga como perturbación y un indicador numérico muestra el nivel. El nivel y la consigna llegan como valores crudos `INT` y las válvulas reciben porcentajes `REAL`: consulte [señales numéricas](./numeric-signals.md).

El escenario fija la consigna en 0.5 m, abre la descarga al 40 % a los 40 s y baja la consigna a 0.3 m a los 70 s. Comprueba que el nivel se mantiene en la banda de 0.45 m a 0.55 m durante 8 s desde los 30 s y durante 8 s desde los 60 s, que vuelve a la banda en menos de 20 s tras la perturbación, que está fuera de la banda durante 5 s desde los 85 s y que el tanque nunca rebosa.

## Lo que no se afirma

Las escenas corren en el núcleo de la planta sin interfaz. Esta página no da tasa de cuadros ni latencia para ellas: aún no se han medido en las máquinas de referencia.

## Consulte también

- [El reloj de la planta](./clock.md)
- [Formato del archivo de escena](./scene-format.md)
- [Referencia de piezas de la planta](./parts.md)
