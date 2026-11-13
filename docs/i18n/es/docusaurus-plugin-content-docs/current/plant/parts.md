---
title: "Referencia de piezas de la planta"
sidebar_label: "Referencia de piezas"
description: "Cada pieza del catálogo de la planta con sus ajustes, señales y acciones de falla, generada de las definiciones de pieza."
tags: [reference, generated]
---

# Referencia de piezas de la planta

{/* >>> GENERATED (tools/docs/plant-parts-reference.ts): plant/parts. Do not edit. >>> */}

Cada pieza del catálogo de la planta, con sus ajustes, señales y acciones de falla. El nombre de una señal en una planta es el nombre dado a la pieza, un punto y la señal que figura aquí.

## Piezas

### Caja

`box`

Una caja de 0,4 por 0,3 m con altura y masa a elegir, y un código opcional de 1 a 9 (0 significa ninguno). Su posición es el centro de su cara inferior.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |
| `code` | number | 0 a 9 | `0` |   |

#### Señales

Ninguna.

#### Acciones de falla

Ninguna.

### Pieza

`workpiece`

Un bloque de 0,2 por 0,2 m y 0,1 m de alto, rojo o azul, de plástico o metal, con un código opcional de 1 a 9 (0 significa ninguno) y una masa a elegir. Los sensores y los retiradores leen su color, su material y su código. Su posición es el centro de su cara inferior.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `colour` | enum | `red`, `blue` | `red` |   |
| `material` | enum | `plastic`, `metal` | `plastic` |   |
| `code` | number | 0 a 9 | `0` |   |
| `mass` | number | 0.1 a 5 | `0.5` | kg |

#### Señales

Ninguna.

#### Acciones de falla

Ninguna.

### Tarima

`pallet`

Una tarima de 1,2 por 0,8 m, de 0,144 m de alto y 25 kg. Su posición es el centro de su cara inferior.

#### Ajustes

Ninguna.

#### Señales

Ninguna.

#### Acciones de falla

Ninguna.

### Tapa

`lid`

Una tapa de 0,4 por 0,3 m, de 0,04 m de alto y con masa a elegir. Se apoya sobre una base. Su posición es el centro de su cara inferior.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `mass` | number | 0.1 a 50 | `1` | kg |

#### Señales

Ninguna.

#### Acciones de falla

Ninguna.

### Base

`base`

Una base de 0,4 por 0,3 m, de 0,15 m de alto y con masa a elegir. Una tapa se apoya sobre ella. Su posición es el centro de su cara inferior.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `mass` | number | 0.1 a 50 | `1` | kg |

#### Señales

Ninguna.

#### Acciones de falla

Ninguna.

## Fuentes

### Emisor de piezas

`emitter`

Emite una pieza en cada flanco de subida de su señal, y por sí solo cada intervalMs cuando es mayor que cero (modo aleatorio, con semilla). Tipos: caja, tarima, tapa, base, pieza; una tapa o base toma su masa del ajuste de masa e ignora la altura; una pieza toma color, material y código (0,5 kg). vary sortea un número con semilla por pieza: color (pieza), peso (caja, 2 o 5 kg) o código (pieza o caja, de 1 a codes); un vary que no aplica al tipo no tiene efecto.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `kind` | enum | `box`, `pallet`, `lid`, `base`, `workpiece` | `box` |   |
| `vary` | enum | `none`, `colour`, `weight`, `code` | `none` |   |
| `codes` | number | 1 a 9 | `3` |   |
| `colour` | enum | `red`, `blue` | `red` |   |
| `material` | enum | `plastic`, `metal` | `plastic` |   |
| `code` | number | 0 a 9 | `0` |   |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |
| `intervalMs` | number | 0 a 600000 | `0` | ms |
| `maxItems` | number | 1 a 1000 | `10` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `emit` | command | BOOL |   |   |

#### Acciones de falla

Ninguna.

### Retirador de piezas

`remover`

Un volumen que retira cada pieza cuyo centro entra en él y las cuenta como entregadas. Cuando accepts no es any (red, blue, metal, plastic, light hasta 3,5 kg, heavy, short hasta 0,25 m, medium hasta 0,35 m, tall, o code con acceptsCode), también las cuenta como clasificadas si coinciden y como mal enrutadas si no; una tarima nunca coincide con una clase.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `width` | number | 0.2 a 2 | `0.6` | m |
| `depth` | number | 0.2 a 2 | `0.6` | m |
| `height` | number | 0.2 a 2 | `0.6` | m |
| `accepts` | enum | `any`, `red`, `blue`, `metal`, `plastic`, `light`, `heavy`, `short`, `medium`, `tall`, `code` | `any` |   |
| `acceptsCode` | number | 0 a 9 | `0` |   |

#### Señales

Ninguna.

#### Acciones de falla

Ninguna.

## Transportadores

### Cinta transportadora

`belt`

Una cinta transportadora. Su posición es el centro de la superficie superior; corre a lo largo de +x. Señales: run, runReverse.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `length` | number | 0.5 a 8 | `2` | m |
| `width` | number | 0.4 a 0.8 | `0.6` | m |
| `speedMps` | number | 0.1 a 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 a 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |

#### Acciones de falla

`stall`, `jam`

### Transportador de rodillos

`roller`

Un transportador de rodillos. Mueve las piezas como una cinta; los rodillos son decoración. Señales: run, runReverse.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `length` | number | 0.5 a 8 | `2` | m |
| `width` | number | 0.4 a 0.8 | `0.6` | m |
| `speedMps` | number | 0.1 a 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 a 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |

#### Acciones de falla

`stall`, `jam`

### Transportador curvo

`curved`

Un transportador de cuarto de vuelta con el radio de línea central indicado. Las piezas viajan a la velocidad del catálogo por la línea central.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `radius` | number | 0.5 a 3 | `1` | m |
| `hand` | enum | `right`, `left` | `right` |   |
| `width` | number | 0.4 a 0.8 | `0.6` | m |
| `speedMps` | number | 0.1 a 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 a 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |

#### Acciones de falla

`stall`, `jam`

### Transferencia de cadenas

`chain-transfer`

Un módulo dentro de una línea de cintas. Su posición es el centro de la superficie superior cuando está bajado. Bajado, mueve las piezas a lo largo de +x como una cinta (run, y runReverse si se permite el sentido inverso). Con lift en TRUE sube liftM en liftTravelMs (0,4 s por defecto); subido, mueve las piezas de lado: moveRight a lo largo de +z, moveLeft a lo largo de -z. La superficie se detiene antes de cambiar de sentido, y las órdenes en conflicto (run con lift, moveLeft con moveRight) no hacen nada. Señales: lift, run, runReverse, moveRight, moveLeft, raised, lowered. Fallas: liftStuck, stall, jam.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `lengthM` | number | 0.4 a 2 | `0.8` | m |
| `widthM` | number | 0.4 a 0.8 | `0.6` | m |
| `liftM` | number | 0.02 a 0.2 | `0.05` | m |
| `liftTravelMs` | number | 100 a 2000 | `400` | ms |
| `speedMps` | number | 0.1 a 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 a 5 | `1` | m/s2 |
| `allowReverse` | boolean |   | `false` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `lift` | command | BOOL |   |   |
| `run` | command | BOOL |   |   |
| `moveRight` | command | BOOL |   |   |
| `moveLeft` | command | BOOL |   |   |
| `raised` | sensor | BOOL |   |   |
| `lowered` | sensor | BOOL |   |   |

#### Acciones de falla

`liftStuck`, `stall`, `jam`

### Mesa giratoria

`turntable`

Una plataforma cuadrada cuya posición es el centro de su superficie superior. Gira sobre su eje vertical a tres posiciones: centro, izquierda (hacia -z) y derecha (hacia +z), y su superficie lleva las piezas a lo largo de su propio +x. toLeft o toRight eligen la posición, sin ninguna vuelve al centro y con ambas conserva el ángulo. La superficie se detiene antes de que la plataforma gire y arranca de nuevo al llegar, de modo que run puede seguir en TRUE. Las órdenes contradictorias no hacen nada. Los ángulos usan una tabla en pasos de 0,25 grados. Señales: run, runReverse, toLeft, toRight, atCentre, atLeft, atRight (a 0,5 grados). Fallas: stall, turnStuck, jam.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `sizeM` | number | 0.6 a 1.2 | `0.9` | m |
| `speedMps` | number | 0.1 a 1 | `0.5` | m/s |
| `accelMps2` | number | 0.1 a 5 | `1` | m/s2 |
| `angleDeg` | number | 30 a 90 | `90` | deg |
| `degPerS` | number | 30 a 120 | `90` | deg/s |
| `allowReverse` | boolean |   | `false` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `run` | command | BOOL |   |   |
| `toLeft` | command | BOOL |   |   |
| `toRight` | command | BOOL |   |   |
| `atCentre` | sensor | BOOL |   |   |
| `atLeft` | sensor | BOOL |   |   |
| `atRight` | sensor | BOOL |   |   |

#### Acciones de falla

`stall`, `turnStuck`, `jam`

## Flujo

### Empujador

`pusher`

Una placa que empuja piezas hacia un lado. Su posición es el centro de la placa retraída, justo sobre la superficie; se mueve a lo largo de su propio +z (derecha) strokeM a speedMps, con accelMps2, mientras extend es TRUE y vuelve en caso contrario. Ajustes: strokeM, widthM, heightM, speedMps, accelMps2. Señales: extend, extended, retracted (a menos de 1 mm de un extremo). Falla: stuck detiene la placa donde está.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `strokeM` | number | 0.2 a 1 | `0.6` | m |
| `widthM` | number | 0.2 a 0.8 | `0.4` | m |
| `heightM` | number | 0.1 a 0.4 | `0.25` | m |
| `speedMps` | number | 0.2 a 1.5 | `0.8` | m/s |
| `accelMps2` | number | 1 a 10 | `4` | m/s2 |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `extend` | command | BOOL |   |   |
| `extended` | sensor | BOOL |   |   |
| `retracted` | sensor | BOOL |   |   |

#### Acciones de falla

`stuck`

### Brazo desviador

`diverter-arm`

Una placa articulada en la posición de la pieza que reposa a lo largo de su propio +x (home). Mientras divert es TRUE gira hacia su propio +z (derecha) angleDeg a degPerS, con una rampa corta, y vuelve en caso contrario; una caja que viaja a lo largo de +x se desvía hacia la derecha. Ajustes: lengthM, heightM, angleDeg (15 a 35: un brazo más inclinado detiene las cajas contra él), degPerS. La longitud predeterminada de 0,8 m a 35 grados solo alcanza 0,46 m de lado, así que una escena que necesite una cinta lateral define un brazo más largo. Señales: divert, diverted, home (a menos de 0,5 grados de un extremo). Falla: stuck detiene el brazo donde está.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `lengthM` | number | 0.4 a 1.2 | `0.8` | m |
| `heightM` | number | 0.1 a 0.4 | `0.25` | m |
| `angleDeg` | number | 15 a 35 | `35` | deg |
| `degPerS` | number | 30 a 180 | `90` | deg/s |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `divert` | command | BOOL |   |   |
| `diverted` | sensor | BOOL |   |   |
| `home` | sensor | BOOL |   |   |

#### Acciones de falla

`stuck`

### Tope retráctil

`stop-blade`

Una placa a través de una cinta en la posición de la pieza (el centro de la superficie de la cinta). Tarda 0,4 s en recorrer; extended y retracted indican los límites. Señales: extend, extended, retracted. Falla: stuck.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `widthM` | number | 0.2 a 1 | `0.6` | m |
| `heightM` | number | 0.1 a 0.6 | `0.3` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `extend` | command | BOOL |   |   |
| `extended` | sensor | BOOL |   |   |
| `retracted` | sensor | BOOL |   |   |

#### Acciones de falla

`stuck`

## Sensores

### Sensor óptico difuso

`sensor-diffuse`

Detecta cualquier pieza que entre en su haz. El haz parte de la posición de la pieza, corre a lo largo de +x durante rangeM y está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 a 2 | `0.5` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckOn`, `stuckOff`

### Sensor óptico retrorreflectivo

`sensor-retro`

Un haz hasta un reflector a rangeM de distancia; detecta una pieza que corte el haz. Señal: detect. Fallas: stuckOn, stuckOff.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 a 2 | `1.5` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckOn`, `stuckOff`

### Sensor inductivo

`sensor-inductive`

Detecta solo piezas metálicas; las piezas de plástico, las cajas y las paletas pasan sin ser vistas. El haz parte de la posición de la pieza, corre a lo largo de +x durante rangeM y está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.02 a 0.3 | `0.1` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckOn`, `stuckOff`

### Sensor capacitivo

`sensor-capacitive`

Detecta cualquier pieza o paleta, sea metálica o no. El haz parte de la posición de la pieza, corre a lo largo de +x durante rangeM y está heightM por encima. Señal: detect. Fallas: stuckOn, stuckOff.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.02 a 0.5 | `0.15` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckOn`, `stuckOff`

### Sensor de color

`sensor-colour`

Sensor de color con aprendizaje: detect es TRUE con cualquier pieza en su haz y match es TRUE cuando esa pieza tiene el color de target (rojo o azul); una pieza sin color nunca coincide. El haz corre a lo largo de +x durante rangeM a heightM. Señales: detect, match. Fallas: stuckOn, stuckOff, wrongColour (invierte match).

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 a 1 | `0.3` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |
| `target` | enum | `red`, `blue` | `red` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |   |
| `match` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckOn`, `stuckOff`, `wrongColour`

### Cortina de luz

`light-array`

Una fila de haces a través de la línea, uno cada pitchM, el primero a medio paso por encima de la pieza. Señales: height (REAL, m, 0 a beams * pitchM) es el borde superior de la pieza más alta que corta un haz, en pasos de pitchM (0,20, 0,30 y 0,40 para las tres cajas con el 0,05 m por defecto; una tapa sobre una base lee la parte superior de la tapa), 0 cuando ningún haz está cortado; detect (BOOL) es VERDADERO mientras algún haz esté cortado. Hecho: count (flancos de subida de detect). Fallas: readingStuck mantiene la lectura, readingOffset suma un paso.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `beams` | number | 4 a 32 | `12` |   |
| `pitchM` | number | 0.025 a 0.1 | `0.05` | m |
| `spanM` | number | 0.4 a 1.2 | `0.8` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `height` | sensor | REAL | m | 0 a 0.6 |
| `detect` | sensor | BOOL |   |   |

#### Acciones de falla

`readingStuck`, `readingOffset`

### Báscula

`scale`

Una báscula estática: suma las masas de las piezas y palés cuyo centro está dentro de su volumen de pesaje (lengthM a lo largo de la pieza, widthM a lo ancho, heightM hacia arriba). Señales: weight (REAL, kg, 0 a rangeKg) es esa suma, redondeada a 0,01 kg, solo mientras es estable y, si no, 0 (una carga mayor lee rangeKg); stable (BOOL) es VERDADERO cuando al menos una pieza lleva settleMs en reposo (como máximo 0,05 m/s). No lee la fuerza de contacto. Fallas: readingStuck mantiene el peso, readingOffset suma 2 kg.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeKg` | number | 5 a 200 | `20` | kg |
| `lengthM` | number | 0.3 a 1.5 | `0.6` | m |
| `widthM` | number | 0.3 a 1.2 | `0.6` | m |
| `heightM` | number | 0.2 a 1 | `0.5` | m |
| `settleMs` | number | 0 a 2000 | `300` | ms |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `weight` | sensor | REAL | kg | 0 a 20 |
| `stable` | sensor | BOOL |   |   |

#### Acciones de falla

`readingStuck`, `readingOffset`

### Sensor de visión

`vision-sensor`

Lee la identidad de la pieza a la vista como un código, no como una imagen. El campo es un cuadrado de fieldM por fieldM centrado en la pieza, desde su posición hacia arriba heightM. Señales: code (INT, 0 a 9) es el código de la pieza cuyo centro está más cerca del centro del campo, 0 cuando el campo está vacío o la pieza no tiene código; detect (BOOL) es VERDADERO mientras haya una pieza en el campo. Fallas: blind lee 0, misread lee otro código.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `fieldM` | number | 0.2 a 1 | `0.5` | m |
| `heightM` | number | 0.2 a 1 | `0.5` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `code` | sensor | INT | code | 0 a 9 |
| `detect` | sensor | BOOL |   |   |

#### Acciones de falla

`blind`, `misread`

## Panel

### Pulsador

`push-button`

Un pulsador que una persona pulsa en la vista 3D o por guion. Señal: pressed.

#### Ajustes

Ninguna.

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `pressed` | sensor | BOOL |   |   |

#### Acciones de falla

Ninguna.

### Piloto luminoso

`indicator-light`

Una luz que el programa enciende. Señal: lit.

#### Ajustes

Ninguna.

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `lit` | command | BOOL |   |   |

#### Acciones de falla

Ninguna.

### Selector

`selector-switch`

Un selector rotativo de 2 a 4 posiciones. Salida "contacts": un contacto BOOL por posición (pos0, pos1, ...), solo el seleccionado es TRUE. Salida "integer": una señal INT, position, de 0 a positions - 1. Acción de falla: stuck (se ignora la operación).

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `positions` | number | 2 a 4 | `3` |   |
| `output` | enum | `contacts`, `integer` | `contacts` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `pos0` | sensor | BOOL |   |   |
| `pos1` | sensor | BOOL |   |   |
| `pos2` | sensor | BOOL |   |   |

#### Acciones de falla

`stuck`

#### Variantes

| Ajuste | Valor | Señales |
| --- | --- | --- |
| `output` | `integer` | position INT |

### Paro de emergencia

`emergency-stop`

Un botón de seta con enclavamiento. Señales: pressed (TRUE al pulsarlo, hasta que se gira para liberarlo) y ok (el contacto normalmente cerrado: TRUE mientras está liberado). Acción de falla: wireBreak (ok lee FALSE como si el cable estuviera cortado).

#### Ajustes

Ninguna.

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `pressed` | sensor | BOOL |   |   |
| `ok` | sensor | BOOL |   |   |

#### Acciones de falla

`wireBreak`

### Potenciómetro

`potentiometer`

Una perilla que una persona gira entre min y max. Señal: value, un REAL en la unidad configurada, que parte en initial. Acción de falla: stuck (se ignora la operación).

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `min` | number | -1000 a 1000 | `0` |   |
| `max` | number | -1000 a 1000 | `100` |   |
| `initial` | number | -1000 a 1000 | `0` |   |
| `unit` | enum | `%`, `m`, `L/s`, `bar`, `V`, `C` | `%` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `value` | sensor | REAL | % | 0 a 100 |

#### Acciones de falla

`stuck`

### Torre de luces

`stack-light`

Una torre de tres luces que el programa enciende. Señales: red, amber, green, cada una por separado.

#### Ajustes

Ninguna.

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `red` | command | BOOL |   |   |
| `amber` | command | BOOL |   |   |
| `green` | command | BOOL |   |   |

#### Acciones de falla

Ninguna.

### Indicador numérico

`numeric-display`

Un indicador que muestra un número que envía el programa, limitado a su rango, con sus decimales y su unidad. Señal: value (REAL o INT).

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `type` | enum | `REAL`, `INT` | `REAL` |   |
| `min` | number | -1000 a 1000 | `0` |   |
| `max` | number | -1000 a 1000 | `100` |   |
| `unit` | enum | `%`, `m`, `L/s`, `bar`, `V`, `C` | `%` |   |
| `decimals` | number | 0 a 3 | `1` |   |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `value` | command | REAL | % | 0 a 100 |

#### Acciones de falla

Ninguna.

#### Variantes

| Ajuste | Valor | Señales |
| --- | --- | --- |
| `type` | `INT` | value INT |

## Proceso

### Tanque

`tank`

Un tanque que se llena por una válvula de entrada y se vacía por gravedad por una válvula de salida. La variante digital tiene válvulas todo o nada (fill, drain) y dos interruptores de nivel (levelLow, levelHigh); la variante numérica tiene válvulas proporcionales (fill, drain, 0 a 100 %) e instrumentos (level en m, flowIn y flowOut en L/s). Hechos: level, volume, spilledL, highs, inBand. Fallas: inletStuck, outletStuck, levelStuck, leak. Es un modelo numérico, no una simulación de fluidos; las ecuaciones se listan a continuación.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `numeric` |   |
| `widthM` | number | 0.2 a 2 | `0.4` | m |
| `depthM` | number | 0.2 a 2 | `0.25` | m |
| `heightM` | number | 0.3 a 2 | `1` | m |
| `initialFraction` | number | 0 a 1 | `0` |   |
| `inletMaxLps` | number | 1 a 50 | `20` | L/s |
| `outletCoef` | number | 1 a 50 | `12` | L/s per square root of m |
| `valveTauS` | number | 0 a 5 | `0.5` | s |
| `highFraction` | number | 0.5 a 1 | `0.8` |   |
| `lowFraction` | number | 0 a 0.5 | `0.2` |   |
| `bandLow` | number | 0 a 1 | `0` |   |
| `bandHigh` | number | 0 a 1 | `1` |   |
| `leakLps` | number | 0 a 10 | `1` | L/s |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `fill` | command | REAL | % | 0 a 100 |
| `drain` | command | REAL | % | 0 a 100 |
| `level` | sensor | REAL | m | 0 a 1 |
| `flowIn` | sensor | REAL | L/s | 0 a 20 |
| `flowOut` | sensor | REAL | L/s | 0 a 12 |

#### Acciones de falla

`inletStuck`, `outletStuck`, `levelStuck`, `leak`

#### Variantes

| Ajuste | Valor | Señales |
| --- | --- | --- |
| `variant` | `digital` | fill BOOL, drain BOOL, levelLow BOOL, levelHigh BOOL |

#### Ecuaciones

Estado: nivel h (m), aperturas de válvula uIn y uOut (0 a 1), volumen derramado (L). Área A = widthM * depthM (m2); paso dt = 0,005 s. En cada paso, en orden: (1) objetivo de la válvula: en digital VERDADERO es 1 y FALSO es 0, en numérico es clamp(valor, 0, 100) / 100; una válvula atascada conserva su apertura. (2) Retardo de primer orden de la válvula: u = objetivo si valveTauS &lt;= dt, si no u = u + (objetivo - u) * dt / valveTauS. (3) Caudales en L/s: qIn = inletMaxLps * uIn; descarga por gravedad (Torricelli) qOut = outletCoef * uOut * raíz(h); con la falla de fuga sale además una constante leakLps. (4) Nivel: h = h + (qIn - qOut - qLeak) * dt / (1000 * A), nunca por debajo de 0. (5) Desborde: si h > heightM entonces derramado = derramado + (h - heightM) * 1000 * A y h = heightM. La raíz cuadrada es una iteración de Newton solo con + - * / (40 iteraciones, semilla (1 + h) / 2), de modo que una ejecución se repite bit a bit. Con apertura total un tanque se vacía en un tiempo finito 2 * raíz(h0) * 1000 * A / outletCoef.

## Manipuladores

### Manipulador de dos ejes

`pick-place`

Un manipulador de dos ejes con pinza de vacío o de mordazas (ajuste gripper). X corre a lo largo de la pieza, Y es vertical. Su posición es el punto del piso bajo la ventosa en la posición 0 de los ejes; la cara inferior de la ventosa queda a la altura de la pieza más la posición Y. Variante digital: órdenes que mueven mientras se mantienen (xPlus, xMinus, yPlus, yMinus) y sensores de límite (xAtMin, xAtMax, yAtMin, yAtMax); con ambos sentidos a la vez no se mueve. Variante numérica: consignas (xSet, ySet) y posiciones (xPos, yPos) en metros, limitadas a la carrera. Ambas variantes tienen grip (vacío activo o mordazas cerradas) y gripped. Un agarre sobre una pieza en movimiento falla, y una pieza por encima de maxLoadKg nunca se sujeta. Fallas: stuckX, stuckY, gripFail, dropLoad, grippedStuckOn, grippedStuckOff. Hechos: picked, placed y drops por pieza (picked\:Nombre, placed\:Nombre, drops\:Nombre) y las posiciones de los ejes (axis\:Nombre\:x, axis\:Nombre\:y) en metros, redondeadas a 0,001.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `digital` |   |
| `gripper` | enum | `vacuum`, `clamp` | `vacuum` |   |
| `strokeXM` | number | 0.4 a 3 | `1.2` | m |
| `strokeYM` | number | 0.2 a 1.2 | `0.5` | m |
| `speedMps` | number | 0.1 a 2 | `0.8` | m/s |
| `accelMps2` | number | 0.5 a 10 | `3` | m/s2 |
| `maxLoadKg` | number | 1 a 25 | `5` | kg |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `xPlus` | command | BOOL |   |   |
| `xMinus` | command | BOOL |   |   |
| `yPlus` | command | BOOL |   |   |
| `yMinus` | command | BOOL |   |   |
| `xAtMin` | sensor | BOOL |   |   |
| `xAtMax` | sensor | BOOL |   |   |
| `yAtMin` | sensor | BOOL |   |   |
| `yAtMax` | sensor | BOOL |   |   |
| `grip` | command | BOOL |   |   |
| `gripped` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckX`, `stuckY`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`

#### Variantes

| Ajuste | Valor | Señales |
| --- | --- | --- |
| `variant` | `numeric` | xSet REAL, ySet REAL, xPos REAL, yPos REAL, grip BOOL, gripped BOOL |

#### Ecuaciones

Por eje y por paso de la planta dt = 0,005 s: la velocidad se acerca a la velocidad objetivo en como máximo accel * dt y luego p = p + v * dt, limitada a 0..carrera (v = 0 en un tope). Con orden mantenida, la velocidad objetivo es el sentido por speed. Con consigna, el eje frena cuando la distancia restante es como máximo v * v / (2 * accel) y se ajusta a la consigna a menos de 0,5 mm. Un eje atascado no se mueve.

### Pórtico de tres ejes

`gantry`

Un manipulador de tres ejes con pinza de vacío o de mordazas (ajuste gripper). X corre a lo largo de la pieza, Y es vertical y Z corre a través de ella. Su posición es el punto del piso bajo la ventosa en la posición 0 de los ejes; la cara inferior de la ventosa queda a la altura de la pieza más la posición Y. Variante digital: órdenes que mueven mientras se mantienen (xPlus, xMinus, yPlus, yMinus) y sensores de límite (xAtMin, xAtMax, yAtMin, yAtMax); con ambos sentidos a la vez no se mueve. Variante numérica: consignas (xSet, ySet) y posiciones (xPos, yPos) en metros, limitadas a la carrera. Ambas variantes tienen grip (vacío activo o mordazas cerradas) y gripped. Un agarre sobre una pieza en movimiento falla, y una pieza por encima de maxLoadKg nunca se sujeta. Fallas: stuckX, stuckY, stuckZ, gripFail, dropLoad, grippedStuckOn, grippedStuckOff. Hechos: picked, placed y drops por pieza (picked\:Nombre, placed\:Nombre, drops\:Nombre) y las posiciones de los ejes (axis\:Nombre\:x, axis\:Nombre\:y, axis\:Nombre\:z) en metros, redondeadas a 0,001.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `digital` |   |
| `gripper` | enum | `vacuum`, `clamp` | `vacuum` |   |
| `strokeXM` | number | 0.4 a 3 | `1.2` | m |
| `strokeYM` | number | 0.2 a 1.2 | `0.5` | m |
| `strokeZM` | number | 0.4 a 3 | `1` | m |
| `speedMps` | number | 0.1 a 2 | `0.8` | m/s |
| `accelMps2` | number | 0.5 a 10 | `3` | m/s2 |
| `maxLoadKg` | number | 1 a 25 | `5` | kg |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `xPlus` | command | BOOL |   |   |
| `xMinus` | command | BOOL |   |   |
| `yPlus` | command | BOOL |   |   |
| `yMinus` | command | BOOL |   |   |
| `zPlus` | command | BOOL |   |   |
| `zMinus` | command | BOOL |   |   |
| `xAtMin` | sensor | BOOL |   |   |
| `xAtMax` | sensor | BOOL |   |   |
| `yAtMin` | sensor | BOOL |   |   |
| `yAtMax` | sensor | BOOL |   |   |
| `zAtMin` | sensor | BOOL |   |   |
| `zAtMax` | sensor | BOOL |   |   |
| `grip` | command | BOOL |   |   |
| `gripped` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckX`, `stuckY`, `stuckZ`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`

#### Variantes

| Ajuste | Valor | Señales |
| --- | --- | --- |
| `variant` | `numeric` | xSet REAL, ySet REAL, zSet REAL, xPos REAL, yPos REAL, zPos REAL, grip BOOL, gripped BOOL |

#### Ecuaciones

Por eje y por paso de la planta dt = 0,005 s: la velocidad se acerca a la velocidad objetivo en como máximo accel * dt y luego p = p + v * dt, limitada a 0..carrera (v = 0 en un tope). Con orden mantenida, la velocidad objetivo es el sentido por speed. Con consigna, el eje frena cuando la distancia restante es como máximo v * v / (2 * accel) y se ajusta a la consigna a menos de 0,5 mm. Un eje atascado no se mueve.

## Estaciones

### Paletizador de capas

`layer-palletizer`

Una estación que escuadra cajas en una capa, levanta la capa completa con una cabeza de pinza y la coloca sobre una tarima. Los ejes siguen al mundo: X es el traslado a lo largo de la pieza (+x local), Y es hacia arriba. La posición de la pieza es el punto del piso bajo la cabeza en reposo, que es el centro de la zona de formación; la base de la placa está a la altura de la pieza más la posición Y. La zona de formación mide columns x 0,4 m por rows x 0,3 m; placas fijas la cierran en +x y -z, y el empujador de escuadra la cierra en +z (tarda 0,4 s); las cajas llegan por una cinta en -x (punto de unión infeed). La placa es tan grande como la zona. Ponga el centro de la tarima a strokeXM a lo largo de la pieza. La pinza se cierra en 0,3 s y toma hasta columns x rows cajas en reposo a menos de 0,25 m bajo la placa; toma la capa solo si su masa total es a lo sumo maxLoadKg. layerReady es TRUE cuando exactamente columns x rows cajas están en reposo en la zona. Variante digital: xPlus, xMinus, yPlus, yMinus (mantener para mover) y los sensores de límite xAtMin, xAtMax, yAtMin, yAtMax; variante numérica: xSet, ySet y xPos, yPos en metros. Ambas: square, squared, layerReady, grip, gripped. Hechos: picked, placed y drops cuentan cajas; axis:&lt;Name>\:x y axis:&lt;Name>\:y son posiciones en metros. Fallas: stuckX, stuckY, squareStuck, gripFail, dropLoad, grippedStuckOn, grippedStuckOff, layerReadyStuckOff. Los ejes inician en 0, con la cabeza en su punto más bajo: levántela primero.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `variant` | enum | `digital`, `numeric` | `digital` |   |
| `strokeXM` | number | 0.8 a 3 | `1.6` | m |
| `strokeYM` | number | 0.3 a 1.5 | `0.8` | m |
| `speedMps` | number | 0.1 a 2 | `0.8` | m/s |
| `accelMps2` | number | 0.5 a 10 | `3` | m/s2 |
| `columns` | number | 1 a 3 | `2` |   |
| `rows` | number | 1 a 3 | `2` |   |
| `maxLoadKg` | number | 5 a 60 | `40` | kg |

#### Señales

| Señal | Dirección | Tipo | Unidad | Rango |
| --- | --- | --- | --- | --- |
| `xPlus` | command | BOOL |   |   |
| `xMinus` | command | BOOL |   |   |
| `yPlus` | command | BOOL |   |   |
| `yMinus` | command | BOOL |   |   |
| `xAtMin` | sensor | BOOL |   |   |
| `xAtMax` | sensor | BOOL |   |   |
| `yAtMin` | sensor | BOOL |   |   |
| `yAtMax` | sensor | BOOL |   |   |
| `square` | command | BOOL |   |   |
| `squared` | sensor | BOOL |   |   |
| `layerReady` | sensor | BOOL |   |   |
| `grip` | command | BOOL |   |   |
| `gripped` | sensor | BOOL |   |   |

#### Acciones de falla

`stuckX`, `stuckY`, `squareStuck`, `gripFail`, `dropLoad`, `grippedStuckOn`, `grippedStuckOff`, `layerReadyStuckOff`

#### Variantes

| Ajuste | Valor | Señales |
| --- | --- | --- |
| `variant` | `numeric` | xSet REAL, ySet REAL, xPos REAL, yPos REAL, square BOOL, squared BOOL, layerReady BOOL, grip BOOL, gripped BOOL |

#### Ecuaciones

Ley del eje por paso de 5 ms con a = accelMps2, v_max = speedMps: v se acerca a la velocidad objetivo en a * dt como máximo; p = p + v * dt, limitado a 0..carrera. Un valor de consigna frena cuando \|d - v * dt\| &lt;= v * v / (2 * a), d = objetivo - p. Empujador: el recorrido t va de 0 a 400 ms; squared cuando t = 400 ms.

{/* <<< END GENERATED: plant/parts <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
