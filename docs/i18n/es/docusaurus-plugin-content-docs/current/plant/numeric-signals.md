---
title: 'Señales numéricas'
sidebar_label: 'Señales numéricas'
description: 'Cómo viaja un valor INT o REAL entre una pieza de la planta y el programa: valores crudos y de ingeniería, escalado, saturación y los límites del intercambio.'
tags: [plant, reference]
---

# Señales numéricas

Una pieza de la planta puede tener señales numéricas: el nivel de un tanque, la posición de un potenciómetro, la apertura de una válvula. Una señal numérica es un `INT` o un `REAL`. Viaja entre la pieza y una variable del programa en cada ciclo, en la sesión en vivo y en la corrida evaluada, con el mismo escalado en ambas.

## Valor crudo y valor de ingeniería

Una señal numérica tiene dos valores.

- El **valor de ingeniería** es el que usa la pieza, en la unidad de la señal: metros, litros por segundo, por ciento. La [referencia de piezas](./parts.md) indica la unidad y el rango de cada señal.
- El **valor crudo** es el que contiene la variable del programa: un número entero para un `INT`, un número decimal para un `REAL`.

El mapa de la planta une ambos con un `range` en cada señal numérica: `raw_min`, `raw_max`, `eng_min`, `eng_max` y `unit`. `eng_min`, `eng_max` y `unit` deben ser iguales al rango y a la unidad que la pieza declara para esa señal; ZPLC informa un mensaje con ubicación cuando difieren. El rango crudo es libre: lo elige quien escribe el mapa.

## Las dos reglas

De crudo a ingeniería, para una señal que el programa lee de la planta o envía a ella como orden:

1. Limitar el valor crudo a `raw_min` hasta `raw_max`.
2. `eng = eng_min + (raw - raw_min) / (raw_max - raw_min) * (eng_max - eng_min)`.

De ingeniería a crudo, para una señal que la planta escribe al programa:

1. Limitar el valor de ingeniería a `eng_min` hasta `eng_max`.
2. `raw = raw_min + (eng - eng_min) / (eng_max - eng_min) * (raw_max - raw_min)`.
3. Para un `INT`, redondear al entero más cercano (la mitad sube) y limitar otra vez a `raw_min` hasta `raw_max`. Para un `REAL`, redondear al flotante de 32 bits más cercano.

### Ejemplo resuelto

El tanque de la escena 12 tiene un sensor de nivel, `Tank1.level`, de 0 a 1 m. Su entrada en el mapa es un `INT` con un rango crudo de 0 a 27648 sobre 0 a 1 m.

| Valor crudo que lee el programa | Valor de ingeniería (m) |
| ------------------------------- | ----------------------- |
| 0                               | 0                       |
| 13824                           | 0.5                     |
| 27648                           | 1                       |

El tanque contiene 0.5 m. La planta escribe `raw = 0 + 0.5 / 1 * 27648 = 13824` en la variable `INT` del programa. En el otro sentido, un programa que envía 13824 a una señal con este rango ordena 0.5.

## Saturación

Un valor fuera de su rango **se satura**: se detiene en el extremo más cercano del rango y nunca da la vuelta. Un nivel de 1.2 m en una señal de 0 a 1 m se lee como 27648. Un valor crudo de 30000 en ese rango ordena 1 m.

## REAL e INT

Un `REAL` es un flotante de 32 bits guardado en little-endian en 4 bytes. Un `INT` es un entero de 16 bits guardado en little-endian en 2 bytes, de -32768 a 32767.

El tipo de la señal de la pieza y el tipo de la variable del programa son dos decisiones. Una señal de pieza que es `REAL` en la referencia de piezas puede enlazarse a una variable `INT` del programa, y al revés: el escalado convierte. Es el caso habitual de un canal analógico, donde un valor físico en una unidad llega al programa como un número entero. La variable que nombra el mapa debe tener el mismo tipo que el `type` que el mapa da a la señal.

Un `REAL` que envía el programa y que no es un número finito (no es un número, o es infinito) se ignora: la planta conserva el valor anterior de esa orden.

## El tramo de intercambio

En cada ciclo la sesión en vivo lee una vez la parte de la imagen de salida que contiene las órdenes del programa, y escribe una vez la parte de la imagen de entrada que contiene los sensores. Cada tramo va desde la dirección mapeada más baja hasta el final de la ranura más alta, de modo que el tramo cuenta la dirección y el ancho de la ranura: un `INT` en la dirección 10 termina en 12 y un `REAL` en la dirección 10 termina en 14. Un tramo lleva como máximo 64 bytes. Un tramo más largo se informa con un mensaje que pide mapear los puntos más cerca.

Una señal numérica necesita sus propios bytes. No puede compartir un byte con otra señal numérica, ni con un bit `BOOL` que pertenezca a otra señal. ZPLC informa ambos casos al revisar el mapa.

## Forzado

Una entrada `BOOL` forzada conserva su valor forzado: la escritura de la planta no lo cambia. Una entrada numérica forzada también conserva todo su valor forzado: un `INT` de 2 bytes y un `REAL` de 4 bytes quedan como se forzaron mientras la planta escribe la imagen de entradas en cada ciclo. Lo comprueba una prueba en el entorno de ejecución nativo en Linux; macOS y Windows aún no se han comprobado.

## Sensores de clasificación

Tres sensores de las escenas de clasificación publican un número, con los rangos de abajo. Siguen el mismo escalado y el mismo tramo de intercambio de 64 bytes que cualquier otra señal numérica. La [página de clasificación](./sorting.md) da la regla de cada lectura.

| Señal    | Pieza            | Tipo   | Unidad | Rango                    | Lee                                                       |
| -------- | ---------------- | ------ | ------ | ------------------------ | --------------------------------------------------------- |
| `height` | cortina de luz   | `REAL` | m      | 0 a `beams` por `pitchM` | El borde superior de la pieza más alta, en pasos del paso |
| `weight` | báscula          | `REAL` | kg     | 0 a `rangeKg`            | La masa en reposo, 0 mientras la carga se mueve           |
| `code`   | sensor de visión | `INT`  | code   | 0 a 9                    | El código de la pieza más cercana al centro del campo     |

Una báscula vacía que no es estable y tiene la falla `readingOffset` lee 2 kg, no 0.

## Sin medir todavía

Nada en esta página afirma un tiempo, una tasa ni un resultado de hardware. El costo del intercambio numérico por ciclo todavía no se mide en las máquinas de referencia.
