---
title: 'Manipuladores y agarre'
sidebar_label: 'Manipuladores y agarre'
description: 'Cómo se mueven y sujetan piezas el manipulador de dos ejes, el pórtico y el paletizador de capas en la planta: ejes, variantes digital y numérica, reglas de agarre, hechos y fallas.'
tags: [plant, reference]
---

# Manipuladores y agarre

Un manipulador mueve una placa a lo largo de uno, dos o tres ejes y sujeta una pieza con ella. La planta tiene tres: el `pick-place` de dos ejes, el `gantry` de tres ejes y la estación `layer-palletizer`. La [referencia de piezas](./parts.md) lista cada ajuste, señal y acción de falla; esta página explica cómo trabajan juntos.

## Ejes

Todos los manipuladores usan las mismas tres letras.

- **X** corre a lo largo de la pieza, en la dirección a la que ella mira. `rotationYDeg` la gira.
- **Y** es vertical, hacia arriba.
- **Z** corre a través de la pieza. Solo el pórtico la tiene.

La posición de la pieza es el punto del piso bajo la placa cuando todos los ejes están en 0. La cara inferior de la placa queda a la altura de la pieza más la posición Y. La posición de un eje va de 0 a su carrera (`strokeXM`, `strokeYM`, `strokeZM`) y nunca sale de ese rango.

La placa es el único cuerpo de un manipulador: una caja de 0,3 por 0,03 por 0,2 m. El bastidor y la viga que dibuja la vista 3D no chocan con nada. Es un límite conocido: una placa puede atravesar su propio bastidor sin dejar rastro, y una pieza puede pasar por donde se dibuja el bastidor.

## Cómo se mueve un eje

Un eje tiene una velocidad (`speedMps`) y una aceleración (`accelMps2`). En cada paso de la planta de 5 ms su velocidad se acerca a la velocidad objetivo en como máximo `accelMps2 * 0,005`, y luego la posición avanza la velocidad por el paso. En un extremo de la carrera la posición se detiene y la velocidad es 0. Un eje `stuck` (atascado) no se mueve.

El movimiento es trapezoidal: acelera, avanza a `speedMps` y frena. Con una consigna, el eje empieza a frenar cuando la distancia restante es como máximo `v * v / (2 * accelMps2)`, evaluada con la velocidad que alcanzaría el paso siguiente, de modo que el eje no pasa de la consigna por más de 1 mm. A menos de 0,5 mm de la consigna se detiene exactamente en ella.

## Variantes digital y numérica

El ajuste `variant` elige cómo maneja el programa los ejes.

| Variante | Órdenes                                   | Sensores                                    |
| -------- | ----------------------------------------- | ------------------------------------------- |
| digital  | `xPlus`, `xMinus`, `yPlus`, `yMinus`, ... | `xAtMin`, `xAtMax`, `yAtMin`, `yAtMax`, ... |
| numeric  | `xSet`, `ySet`, ... en metros (`REAL`)    | `xPos`, `yPos`, ... en metros (`REAL`)      |

Ambas variantes tienen además la orden `grip` y el sensor `gripped`.

- **Digital.** Un eje se mueve solo mientras se mantiene su orden. Con `xPlus` y `xMinus` en TRUE a la vez no se mueve. Al soltar la orden el eje frena a `accelMps2`, así que recorre `v * v / (2 * accelMps2)` más antes de detenerse. `AtMin` es TRUE a menos de 1 mm de la posición 0 y `AtMax` a menos de 1 mm de la carrera. El programa debe hallar su propio punto de parada con los sensores de la escena.
- **Numérica.** El eje va a la consigna y `Pos` informa dónde está. Una consigna fuera de la carrera se limita a ella. Una consigna que no es un número finito se ignora y se conserva la anterior. Los rangos son de `0` a la carrera, en `m`, igual que el rango que debe declarar el [mapa de señales](./numeric-signals.md).

### Ejemplo resuelto: un movimiento de dos ejes

Un `pick-place` con la variante numérica y las carreras por defecto (X 1,2 m, Y 0,5 m) toma una caja de 0,3 m que está en X 0 y la deja en X 1. La pieza está a la altura de la superficie bajo la caja.

1. `ySet = 0.3`. La cara inferior de la placa baja hasta la cara superior de la caja.
2. `grip = TRUE`. Cuando `gripped` lee TRUE la caja está sujeta.
3. `ySet = 0.5`. La placa sube la caja al tope de la carrera.
4. `xSet = 1`. La placa lleva la caja a lo largo de X. `xPos` lee cerca de 1 al llegar.
5. `ySet = 0.3`. La placa baja la caja hasta quedar cerca de la superficie que tiene debajo.
6. `grip = FALSE`. La caja se suelta.

La variante digital hace el mismo recorrido manteniendo `yMinus`, `yPlus` y `xPlus` durante el tiempo que toma cada movimiento; ese tiempo lo decide el programa.

## Cómo funciona un agarre

En cada paso en que `grip` es TRUE y la pinza sujeta menos piezas de las que puede, busca una pieza para tomar. Los valores de abajo son los **valores actuales de esta versión**. Son valores iniciales del modelo, no propiedades de una pinza real.

Una pieza se toma cuando se cumple todo lo siguiente.

- **Es una pieza de la planta**: una caja, una tarima, una tapa o una base.
- **Su masa es a lo sumo `maxLoadKg`.** Una pieza más pesada nunca se toma. El paletizador de capas aplica el límite al total de la capa.
- **No se mueve**: su velocidad relativa a la placa es a lo sumo 0,05 m/s. Un agarre sobre una pieza en movimiento **falla**. Un programa que cierra la pinza sobre una caja que viaja en una cinta debe detener antes la caja, por ejemplo con una cuchilla de tope.
- **Está al alcance.** Una placa de _vacío_ toma una pieza cuya cara superior está entre 0,005 m por encima y 0,02 m por debajo de la cara inferior de la placa, con el centro de la placa sobre la huella de la pieza. Una _pinza de mordazas_ toma una pieza cuyo centro está a menos de 0,05 m del centro de la placa (o dentro de la placa, si es más ancha) y cuya cara superior está de 0 a 0,25 m bajo la placa, una vez cerradas las mordazas. Las mordazas tardan 0,3 s en cerrarse.

Cuando varias piezas están al alcance, la pinza toma la más cercana en el plano horizontal (las que están a menos de 1 mm entre sí cuentan como igual de cercanas), luego la más alta y luego la de menor identificador. El manipulador de dos ejes y el pórtico sujetan una pieza. El paletizador de capas sujeta hasta `columns * rows` piezas.

Una pieza sujeta queda fija a la placa y se mueve con ella. `grip = FALSE` la suelta con la velocidad que lleve. `gripped` lee TRUE mientras la pinza sujeta al menos una pieza.

### Colocada y caída

Los hechos cuentan cada pieza una sola vez.

- **`picked`** cuenta las piezas que la pinza tomó.
- **`placed`** cuenta una pieza soltada que queda en reposo (velocidad a lo sumo 0,05 m/s) a menos de 0,01 m de la superficie que tiene debajo, durante 100 ms, dentro de los 3 s siguientes a la suelta.
- **`drops`** cuenta el resto: una pieza soltada a más de 0,05 m sobre la superficie que tiene debajo, una pieza que no se asienta en 3 s, una pieza que sale de la planta y cada pieza que suelta la falla `dropLoad`.

Una pieza en reposo sobre el piso nunca cuenta como colocada, así que una caja soltada al piso es una caída aunque termine en reposo. Una caída nunca es también una colocación.

## Hechos

| Hecho                       | Significado                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `picked:<Nombre>`           | Piezas que tomó la pieza `<Nombre>`.                                                                     |
| `placed:<Nombre>`           | Piezas que dejó y que quedaron en reposo.                                                                |
| `drops:<Nombre>`            | Piezas que dejó caer.                                                                                    |
| `axis:<Nombre>:x`, `y`, `z` | Posición de cada eje en metros, redondeada a 0,001.                                                      |
| `itemsAssembled`            | Tapas que han reposado sobre una base durante 40 pasos de la planta (0,2 s), centradas a menos de 0,1 m. |
| `stacked:pallet:<n>`        | Piezas que reposan sobre la tarima número `<n>`, directamente o a través de otras piezas.                |
| `layers:pallet:<n>`         | Altura de la pila más alta sobre esa tarima, en piezas.                                                  |

La numeración de las tarimas sigue el orden en que la escena las crea, desde 0. `stacked`, `layers` e `itemsAssembled` describen el estado de la planta, no lo que hizo el programa: leen igual para una tarima que llegó en una cinta que para una que cargó una pinza, ignoran las piezas en movimiento, y una pieza debe reposar sobre su soporte a menos de 5 mm para contar. Cada tarima cuenta una pieza solo cuando al menos el 30 % de la huella de la pieza queda sobre su soporte. Un escenario puede comprobar cualquiera de ellos con `fact:`.

## El paletizador de capas

El `layer-palletizer` tiene los ejes X y Y y una cabeza de pinza tan ancha como su zona de formación. La zona mide `columns * 0,4` por `rows * 0,3` m. Las cajas llegan por una cinta del lado de entrada, contra dos topes fijos; la orden `square` extiende un empujador (0,4 s) que las escuadra en un bloque. `squared` informa el fin del recorrido.

- `layerReady` es TRUE cuando exactamente `columns * rows` cajas están en reposo en la zona.
- `maxLoadKg` es el límite de la capa completa: la pinza no se cierra sobre una capa que pesa más.
- La cabeza inicia en su punto más bajo, con Y en 0, así que el programa debe subirla antes de que lleguen las cajas.
- La tarima va al final del traslado: el centro de la tarima a `strokeXM` a lo largo de la pieza.

## Fallas

Un escenario o una persona puede activar estas acciones de falla en una pieza manipuladora. Cada una enseña una comprobación que un programa real necesita.

| Acción                       | Efecto                                                             | Qué enseña                                                                |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `stuckX`, `stuckY`, `stuckZ` | Ese eje se detiene donde está; los demás siguen funcionando.       | Comparar la posición o el sensor de límite con lo que el programa ordenó. |
| `squareStuck`                | El empujador del paletizador se queda donde está.                  | No esperar `squared` para siempre; rendirse con una alarma.               |
| `gripFail`                   | La pinza nunca toma una pieza; las que ya sujeta se conservan.     | Un agarre es una petición: comprobar `gripped` antes de subir.            |
| `dropLoad`                   | La pinza suelta todo lo que sujeta y cada pieza cuenta como caída. | Vigilar `gripped` durante el traslado, no solo al inicio.                 |
| `grippedStuckOn`             | `gripped` lee TRUE aunque no sujete nada.                          | Un sensor puede mentir: confirmar con la posición y la cuenta.            |
| `grippedStuckOff`            | `gripped` lee FALSE aunque sujete.                                 | Lo mismo, en el otro sentido.                                             |
| `layerReadyStuckOff`         | `layerReady` lee FALSE con una capa completa.                      | Un paso que espera un solo sensor necesita un límite de tiempo.           |

Una acción que la pieza no tiene se rechaza con un mensaje ubicado.

## Límites del modelo

- La placa es el único cuerpo. El bastidor, la viga y las mordazas se dibujan, no se simulan.
- Los umbrales de agarre son los valores de esta versión y pueden cambiar.
- Las posiciones son exactas para el modelo, no para un eje real: no hay holgura, vibración ni error de seguimiento.
- La planta se repite exactamente: la misma escena, programa y guion dan la misma traza. Esto está fijado en Linux; macOS y Windows aún no se han medido.
- No se declara ninguna tasa de cuadros, latencia ni resultado de hardware para los manipuladores. Aún no se han medido en las máquinas de referencia.
- Un mapa de un pórtico con señales numéricas puede superar el tramo de intercambio de 64 bytes. Vea [Señales numéricas](./numeric-signals.md#el-tramo-de-intercambio).
