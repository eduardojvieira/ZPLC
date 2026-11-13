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

Una caja de 0,4 por 0,3 m con altura y masa a elegir. Su posición es el centro de su cara inferior.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `height` | enum | `0.2`, `0.3`, `0.4` | `0.3` | m |
| `mass` | enum | `2`, `5` | `2` | kg |

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

## Fuentes

### Emisor de piezas

`emitter`

Emite una pieza en cada flanco de subida de su señal, y por sí solo cada intervalMs cuando es mayor que cero (modo aleatorio, con semilla).

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `kind` | enum | `box`, `pallet` | `box` |   |
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

Un volumen que retira cada pieza cuyo centro entra en él y las cuenta como entregadas.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `width` | number | 0.2 a 2 | `0.6` | m |
| `depth` | number | 0.2 a 2 | `0.6` | m |
| `height` | number | 0.2 a 2 | `0.6` | m |

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

## Flujo

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

Estado: nivel h (m), aperturas de válvula uIn y uOut (0 a 1), volumen derramado (L). Área A = widthM * depthM (m2); paso dt = 0,005 s. En cada paso, en orden: (1) objetivo de la válvula: en digital VERDADERO es 1 y FALSO es 0, en numérico es clamp(valor, 0, 100) / 100; una válvula atascada conserva su apertura. (2) Retardo de primer orden de la válvula: u = objetivo si valveTauS &lt;= dt, si no u = u + (objetivo - u) * dt / valveTauS. (3) Caudales en L/s: qIn = inletMaxLps * uIn; descarga por gravedad (Torricelli) qOut = outletCoef * uOut * raíz(h); con la falla de fuga sale además una constante leakLps. (4) Nivel: h = h + (qIn - qOut - qLeak) * dt / (1000 * A), nunca por debajo de 0. (5) Desborde: si h > heightM entonces derramado = derramado + (h - heightM) * 1000 * A y h = heightM. La raíz cuadrada es una iteración de Newton solo con + - * / (12 iteraciones, semilla 1 si h >= 1 y h en otro caso), de modo que una ejecución se repite bit a bit. Con apertura total un tanque se vacía en un tiempo finito 2 * raíz(h0) * 1000 * A / outletCoef.

{/* <<< END GENERATED: plant/parts <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
