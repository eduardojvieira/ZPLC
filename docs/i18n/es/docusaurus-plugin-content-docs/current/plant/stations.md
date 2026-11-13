---
title: 'Estaciones: elevadores, cajones, transelevadores y mecanizado'
sidebar_label: 'Estaciones'
description: 'Cómo funcionan en la planta el cajón, el elevador, el transelevador con su estante y el centro de mecanizado: niveles, las secuencias de transferencia, los enclavamientos, los hechos y las fallas.'
tags: [plant, reference]
---

# Estaciones: elevadores, cajones, transelevadores y mecanizado

Estas piezas mueven objetos entre niveles, los guardan en un estante y los transforman. La [referencia de piezas](./parts.md) lista cada ajuste, señal y acción de falla; esta página explica las reglas que los conectan. Los tamaños y umbrales de abajo son los valores de esta versión, no verdades físicas.

## El cajón

Un `crate` es una caja abierta de 0,8 por 0,6 m y 0,25 m de alto, de 4 kg: un piso y cuatro paredes de 0,02 m en un solo cuerpo rígido. Su posición es el centro de su cara inferior. Un cajón puede colocarse en la escena o emitirse: un emisor de cajones ignora `vary`, `height` y `mass`.

- **Apilado.** Un segundo cajón se apoya en los bordes del primero y se queda ahí.
- **Captura.** Los objetos que caen dentro de un cajón se quedan dentro. Un cajón viaja en una cinta como cualquier pieza.
- **Qué cuenta como cargado.** El hecho `loaded:crate:N` cuenta los objetos que no son cajones, en reposo y con su centro dentro del interior del cajón número N (dentro de las paredes, sobre el piso y bajo el borde). N cuenta los cajones en el orden de la escena, desde 0. El interior se lee como una caja alineada con los ejes, así que el hecho es exacto para un cajón alineado con ellos.

## El elevador

Un `lift` es una plataforma con superficie de cinta que se mueve en vertical entre 2 y 4 `levels`.

| Regla                 | Valor                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Convención de niveles | La posición de la pieza es el centro de la superficie superior en el **nivel 1**, el más bajo. El nivel K está (K - 1) veces `levelPitchM` por encima. |
| Órdenes               | `up` la sube y `down` la baja a `travelSpeedMps`, con `accelMps2`. Con ambas o ninguna se mantiene. Se detiene en los extremos.                        |
| Superficie            | `run` lleva las piezas a lo largo del +x de la plataforma a `speedMps`. `runReverse` existe solo cuando `allowReverse` es TRUE.                        |
| Sensores              | `atLevelK` es TRUE a menos de 0,01 m del nivel K cuando la plataforma se mueve a 0,02 m/s o menos. Hay uno por nivel.                                  |
| Entradas y salidas    | `in1` a `inN` y `out1` a `outN`, un par por nivel, a la altura de ese nivel.                                                                           |

Los valores por defecto son 2 niveles separados 0,6 m, una velocidad de desplazamiento de 0,4 m/s y una velocidad de superficie de 0,5 m/s. `lengthM` y `widthM` dan el tamaño de la plataforma.

- **No confundir con la transferencia de cadenas.** Su señal `lift` sube un módulo corto. Aquí las órdenes son `up` y `down`.
- **Límite conocido.** La planta no inhibe nada. Una plataforma que se mueve con la superficie en marcha puede perder su carga: detenga la superficie antes de mover y arránquela cuando un `atLevelK` sea TRUE.

El hecho `axis:Nombre:y` es la altura de la plataforma sobre el nivel 1, en metros.

## El transelevador

Un `stacker-crane` guarda cajas en un estante y las saca de nuevo.

### Los cuatro ejes

| Eje       | Mueve                  | Orden                       | Sensor                                    |
| --------- | ---------------------- | --------------------------- | ----------------------------------------- |
| X         | a lo largo del pasillo | `bay` (INT, 0 a `columns`)  | `inPosition`                              |
| Y         | el mástil              | `level` (INT, 0 a `levels`) | `inPosition`                              |
| Horquilla | a lo ancho del pasillo | `forkLeft`, `forkRight`     | `forkCentre`, `forkAtLeft`, `forkAtRight` |
| Elevación | la horquilla, 0,06 m   | `raise`                     | `raised`                                  |

`bay` lleva X a bahía por `bayPitchM` y `level` lleva Y a nivel por `levelPitchM`. `inPosition` es TRUE cuando ambos están a menos de 5 mm y en reposo.

- **Saturación.** Un `bay` o un `level` fuera de su rango se detiene en el extremo del rango. Un valor que no es un número finito no cambia nada.
- **La horquilla.** `forkLeft` la extiende hacia -z y `forkRight` hacia +z. Mantener la orden la extiende, soltarla la centra, y con ambas se mantiene. La superficie de la horquilla es una cinta: `beltRight` la mueve hacia +z y `beltLeft` hacia -z. Con ambas no hace nada.
- **El muelle y el estante.** El nivel 0 es el muelle: los estantes son los niveles 1 en adelante. Las cintas del muelle van con su superficie a 0,13 m sobre la posición de la pieza, terminando en la punta de la horquilla (puntos de unión `dockIn` en -z y `dockOut` en +z). El estante está del lado +z. La columna c y el nivel l son un par de rieles separados 0,24 m, con su parte superior a l por `levelPitchM` más 0,1 m sobre la posición de la pieza. Una caja de 0,3 m de ancho y 0,4 m de largo descansa sobre ambos rieles y la horquilla de 0,16 m de ancho pasa entre ellos.
- **Cargado.** `loaded` es TRUE mientras una caja descansa en el centro de la horquilla.

### Guardar y retirar

La transferencia es una secuencia de órdenes. El transelevador no la hace por usted.

| Transferencia | Secuencia                                                                    |
| ------------- | ---------------------------------------------------------------------------- |
| **Guardar**   | Suba la horquilla cargada, extiéndala a la derecha, bájela y luego recójala. |
| **Retirar**   | Extiéndala baja, súbala y luego recójala.                                    |

Una celda cuenta como ocupada cuando una caja descansa en reposo sobre ambos rieles de esa celda. Una caja sobre la horquilla subida queda 0,03 m sobre los rieles, así que no está guardada hasta que se baja la horquilla.

### La inhibición y `blocked`

X e Y se mantienen mientras la horquilla está fuera del centro, y también mientras la carga sobre la horquilla supera `maxLoadKg` (10 kg por defecto). Un cambio de `bay` o de `level` que el transelevador rechaza por cualquiera de los dos motivos se cuenta una vez, en su flanco ascendente, en el hecho `blocked:Nombre`. Una segunda consigna que llega mientras la petición sigue rechazada es la misma petición. Cuando la horquilla vuelve al centro, se cumplen las consignas retenidas.

El transelevador no inhibe la horquilla: `forkLeft` y `forkRight` la mueven también cuando X e Y no están en posición. El programa debe esperar `inPosition` antes de extender la horquilla. La planta no modela una colisión de la horquilla con el estante.

### Hechos

| Hecho                       | Significado                                              |
| --------------------------- | -------------------------------------------------------- |
| `stored:Nombre`             | El número de celdas con una caja en reposo.              |
| `cell:Nombre:C:L`           | TRUE en cada celda ocupada (columna C, nivel L).         |
| `blocked:Nombre`            | El número de peticiones rechazadas.                      |
| `axis:Nombre:x`, `:y`, `:z` | Las posiciones en metros. Z tiene signo, 0 en el centro. |

Límites conocidos: un estante, de un solo lado, una caja de fondo. El transelevador inicia en la bahía 0, nivel 0, con la horquilla abajo y centrada.

## El centro de mecanizado

Un `machining-centre` convierte una pieza en una tapa o en una base. Su posición es el centro de la superficie superior de su cinta integrada.

1. **Alimentar.** La cinta corre a lo largo de +x mientras `feed` es TRUE y el ciclo no está en marcha. La cámara mide `lengthM` por `widthM`, con una puerta en cada extremo que sube en 0,4 s.
2. **Listo.** `ready` es TRUE cuando exactamente una pieza en bruto está en reposo en la cámara y nada más lo está. Una pieza en bruto es una pieza (`workpiece`): un elemento con color y sin etiqueta. Las cajas, las tapas y las bases no lo son. Detenga primero la cinta, para que la pieza quede en reposo.
3. **Arrancar.** Un flanco ascendente de `start` con `ready` cierra las puertas e inicia un ciclo de `cycleMs` (4000 ms por defecto). La cinta se detiene y `busy` es TRUE. `doorClosed` es TRUE cuando las puertas están arriba.
4. **Terminado.** Al final del ciclo la pieza en bruto se retira y un producto aparece en su lugar en el centro de la cámara en el mismo paso: una tapa o una base, según `product`, de 1 kg. Las puertas bajan y `done` es TRUE hasta que el producto sale de la cámara o hasta el siguiente `start`.

### El cambio es un evento del modelo

El cambio de la pieza en bruto por el producto es un **evento del modelo**, no física: cambia lo que es el elemento, no dónde está, como el nivel de un tanque es un modelo. Todo lo demás lo llevan, lo bloquean y lo empujan la física. La pieza en bruto sale y el producto aparece en el mismo paso, nunca uno sin el otro.

### Arranques rechazados

Un flanco de `start` cuando la pieza no está lista, o cuando su puerta está atascada, no hace nada salvo sumar uno al hecho `misfires:Nombre`. El hecho `produced:Nombre` cuenta los ciclos terminados.

## Piezas de completado

Tres piezas pequeñas completan el catálogo.

| Pieza          | Qué hace                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit-switch` | Una palanca de `reachM` de largo a lo largo de +x, 0,1 m de ancho y `heightM` de alto. `contact` es TRUE mientras el centro de una pieza o paleta está dentro. El hecho `count:Nombre` cuenta cada subida. No detiene la pieza. |
| `aligner`      | Dos guías a los lados de una cinta. `align` en TRUE las cierra de `widthM` a `gapM` en 0,4 s y al soltarlo se abren. `aligned` y `open` indican los límites. Un `gapM` mayor que `widthM` cierra a `widthM`.                    |
| `chute`        | Una placa fija inclinada `tiltDeg` (5 a 35) que desciende a lo largo de +x, desde la entrada `in` en el extremo alto hasta la salida `out` en el extremo bajo. No tiene señales ni fallas.                                      |

**La rampa necesita inclinación.** La placa tiene un rozamiento de 0,2 y una caja tiene 0,6. El rozamiento combinado es la raíz cuadrada de 0,6 por 0,2, cerca de 0,346, así que una caja se desliza solo cuando la tangente de la inclinación lo supera: 20 grados (tangente 0,364) o más. La inclinación por defecto es 20 grados; por debajo, la caja se queda sobre la placa. La placa no tiene bordes y nada frena la pieza.

## Fallas y qué enseñan

| Pieza                | Falla                 | Qué hace                                     | Qué enseña                                           |
| -------------------- | --------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Elevador             | `stuck`               | La plataforma se queda donde está            | Usar las señales de nivel, no el tiempo              |
| Elevador             | `stall`               | La superficie se detiene                     | Detectar una pieza que no llega                      |
| Elevador             | `levelStuckOff`       | Todos los `atLevelK` leen FALSE              | Un sensor puede fallar con la pieza en su sitio      |
| Transelevador        | `stuckX`, `stuckY`    | Ese eje se queda donde está                  | Comparar `inPosition` con lo que se ordenó           |
| Transelevador        | `forkStuck`           | La horquilla se queda donde está             | Usar los límites de la horquilla, no el tiempo       |
| Transelevador        | `loadedStuckOff`      | `loaded` lee FALSE                           | Confirmar una carga con la horquilla y la cinta      |
| Transelevador        | `beltStall`           | La cinta de la horquilla se detiene          | Detectar una caja que no se mueve                    |
| Centro de mecanizado | `doorStuck`           | Las puertas se quedan; un `start` se rechaza | No esperar `doorClosed` para siempre                 |
| Centro de mecanizado | `cycleSlow`           | El ciclo dura el doble de `cycleMs`          | Un ciclo lento necesita un límite de tiempo          |
| Centro de mecanizado | `readyStuckOff`       | `ready` lee FALSE                            | Un paso que espera un solo sensor necesita un límite |
| Centro de mecanizado | `stall`               | La cinta se detiene                          | Detectar una pieza en bruto que no llega             |
| Final de carrera     | `stuckOn`, `stuckOff` | `contact` se queda en TRUE o en FALSE        | Comparar una lectura con otra señal                  |
| Alineador            | `stuck`               | Las guías se quedan donde están              | Usar `aligned`, no el tiempo                         |

Una falla nunca cambia lo que la vista 3D dibuja de una pieza física: un elevador con `levelStuckOff` sigue dibujado donde está. Una acción que la pieza no tiene se rechaza con un mensaje ubicado. La rampa no tiene ninguna.

## Límites del modelo

- El elevador y el transelevador no modelan la colisión de la plataforma o de la horquilla con el bastidor o el estante.
- El cambio del centro de mecanizado es un evento del modelo, y atiende una pieza en bruto a la vez.
- El estante del transelevador es uno, de un solo lado, una caja de fondo.
- El interior de un cajón se lee como una caja alineada con los ejes.
- La planta es un modelo. Un resultado aquí no dice cómo se comporta un elevador, un transelevador o un centro de mecanizado reales.

## Qué está medido

El núcleo de la planta es determinista y su traza está fijada en Linux; macOS y Windows aún no se han medido. La tasa de cuadros, la latencia del enlace y el costo por ciclo todavía no se miden en las máquinas de referencia, así que esta página no da ninguna cifra para ellos.
