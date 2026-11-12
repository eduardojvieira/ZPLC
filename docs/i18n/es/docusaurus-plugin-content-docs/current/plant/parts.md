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

### Palé

`pallet`

Un palé de 1,2 por 0,8 m, de 0,144 m de alto y 25 kg. Su posición es el centro de su cara inferior.

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

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `emit` | command | BOOL |   |

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

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `run` | command | BOOL |   |

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

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `run` | command | BOOL |   |

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

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `run` | command | BOOL |   |

#### Acciones de falla

`stall`, `jam`

## Flujo

### Tope retráctil

`stop-blade`

Una placa a través de una cinta en la posición de la pieza (el centro de la superficie de la cinta). Tarda 0,4 s en recorrer; extended y retracted indican los límites. Señales: extend, extended, retracted. Fallo: stuck.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `widthM` | number | 0.2 a 1 | `0.6` | m |
| `heightM` | number | 0.1 a 0.6 | `0.3` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `extend` | command | BOOL |   |
| `extended` | sensor | BOOL |   |
| `retracted` | sensor | BOOL |   |

#### Acciones de falla

`stuck`

## Sensores

### Sensor óptico difuso

`sensor-diffuse`

Detecta cualquier pieza que entre en su haz. El haz parte de la posición de la pieza, corre a lo largo de +x durante rangeM y está heightM por encima. Señal: detect. Fallos: stuckOn, stuckOff.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 a 2 | `0.5` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |

#### Acciones de falla

`stuckOn`, `stuckOff`

### Sensor óptico retrorreflectivo

`sensor-retro`

Un haz hasta un reflector a rangeM de distancia; detecta una pieza que corte el haz. Señal: detect. Fallos: stuckOn, stuckOff.

#### Ajustes

| Ajuste | Tipo | Rango o valores | Valor por defecto | Unidad |
| --- | --- | --- | --- | --- |
| `rangeM` | number | 0.05 a 2 | `1.5` | m |
| `heightM` | number | 0 a 2 | `0.1` | m |

#### Señales

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `detect` | sensor | BOOL |   |

#### Acciones de falla

`stuckOn`, `stuckOff`

## Panel

### Pulsador

`push-button`

Un pulsador que una persona pulsa en la vista 3D o por guion. Señal: pressed.

#### Ajustes

Ninguna.

#### Señales

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `pressed` | sensor | BOOL |   |

#### Acciones de falla

Ninguna.

### Piloto luminoso

`indicator-light`

Una luz que el programa enciende. Señal: lit.

#### Ajustes

Ninguna.

#### Señales

| Señal | Dirección | Tipo | Unidad |
| --- | --- | --- | --- |
| `lit` | command | BOOL |   |

#### Acciones de falla

Ninguna.

{/* <<< END GENERATED: plant/parts <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
