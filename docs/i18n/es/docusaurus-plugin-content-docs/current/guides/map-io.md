---
slug: /guides/map-io
id: map-io
title: Asignar variables a pines
sidebar_label: Asignar E/S a pines
description: 'Conecte las variables de un programa con las entradas y salidas de una placa, con la descripción de E/S de la placa y el editor de mapeo de E/S de ZPLC.'
tags: [how-to, io, boards, mapping]
---

# Asignar variables a pines

Un programa lee entradas y escribe salidas mediante direcciones de la imagen de proceso, como `%IX0.0` y `%QX0.0`. La placa decide a qué pin llega cada dirección. Esta página muestra cómo ubicar una variable en una dirección, cómo ver qué pin es, y qué hacen la compilación y la carga cuando la dirección es incorrecta.

:::note Dónde está la verdad
Cada placa tiene una descripción de E/S en `firmware/app/boards/boards.json`: sus canales, la dirección IEC y el pin de cada uno, sus notas eléctricas y el valor seguro de cada salida. ZPLC, la compilación, el firmware y la documentación leen ese único archivo, así que la tabla de pines de [Placas compatibles](../reference/boards.md) es el mismo dato que comprueba la compilación. Ningún pin se ha medido en un banco de pruebas: vea [Compatibilidad de hardware](../reference/capabilities-evidence.md).
:::

## 1. Encontrar los canales de su placa

Abra [Placas compatibles](../reference/boards.md) y vaya a su placa. Cada fila es un canal:

- su dirección (`%QX0.0` para una salida digital, `%IW4` para una entrada analógica);
- el pin o el borne impreso en la placa;
- si el devicetree de la placa demuestra el pin (`devicetree`) o lo elige el perfil (`profile`);
- el valor seguro de una salida.

## 2. Ubicar las variables

En texto estructurado, dé a una variable su dirección después del nombre con `AT`:

```st runnable expect="LED_Output=TRUE" scans=1 scan_ms=10
PROGRAM Light
VAR_INPUT
    Start AT %IX0.0 : BOOL;
END_VAR
VAR_OUTPUT
    LED_Output AT %QX0.0 : BOOL;
END_VAR

LED_Output := NOT Start;
END_PROGRAM
```

Nada fija la entrada, así que es `FALSE` y la salida es `TRUE`. En una placa cuya entrada tiene resistencia pull-up, como habilita el perfil de la Raspberry Pi Pico, un interruptor a tierra lee `FALSE` mientras está pulsado. Las notas eléctricas del canal dicen cómo se cablea el pin.

## 3. Leer una dirección

Una dirección es un área, un tamaño y una posición: `%` + `I` (entrada), `Q` (salida) o `M` (memoria) + `X` (bit), `B` (byte), `W` (palabra, 16 bits) o `D` (palabra doble, 32 bits) + el índice.

| Dirección | Cubre                                                      |
| --------- | ---------------------------------------------------------- |
| `%IX0.0`  | El bit 0 del byte 0 de la imagen de entrada                |
| `%IB1`    | El byte 1                                                  |
| `%IW1`    | La palabra 1: los bytes 2 y 3                              |
| `%QD1`    | La palabra doble 1: los bytes 4 a 7 de la imagen de salida |

El índice de una palabra o de una palabra doble cuenta palabras, pero el índice de un bit y de un byte cuenta bytes. Así, de `%IX0.0` a `%IX1.7` caen dentro de los bytes de `%IW0`, y `%IW1` empieza en el byte 2.

:::warning Las direcciones de bit y de palabra se superponen
El compilador no avisa cuando una dirección de bit y una de palabra cubren el mismo byte. Ambas variables leen y escriben la misma memoria, y gana la última escritura. Aquí `Flag` se activa y la escritura de la palabra la borra de nuevo:
:::

```st runnable expect="Flag=FALSE Word=4" scans=1 scan_ms=10
PROGRAM Overlap
VAR_OUTPUT
    Flag AT %QX0.0 : BOOL;
    Word AT %QW0 : WORD;
END_VAR

Flag := TRUE;
Word := 16#0004;
END_PROGRAM
```

Mantenga las direcciones de bit y las de palabra de un área en bytes distintos. El área `%M` se comporta igual: `%MX0.0` y `%MW0` comparten un byte.

## 4. Asignarlas en el proyecto

La misma ubicación se registra en `zplc.json` bajo `io`. En ZPLC, abra **Configuración del proyecto**. La sección **Mapeo de E/S** enumera los canales de la placa seleccionada con los nombres de pin impresos en ella, y cada fila ofrece solo los canales de esa placa, así que una fila no puede quedar donde la placa no tiene nada.

![La sección I/O Mapping de la configuración del proyecto (interfaz en inglés)](/img/screens/guide-io-mapping.png)

```json zplc-fragment board=rpi_pico
{
  "io": {
    "inputs": [{ "name": "Start", "address": "%IX0.0", "type": "BOOL", "pin": 15, "description": "Push button between GP15 and ground" }],
    "outputs": [
      { "name": "LED_Output", "address": "%QX0.0", "type": "BOOL", "pin": 0, "description": "LED with a series resistor on GP0" }
    ],
    "virtual": [{ "name": "SpareFlag", "address": "%QX0.6", "type": "BOOL", "description": "A bit of the output image that no pin drives" }]
  }
}
```

La comprobación de la documentación contrasta cada dirección de `inputs` y `outputs` de un fragmento con los canales de su placa, incorpora el fragmento a un proyecto y lo compila.

Una dirección que ningún pin controla no es un canal. Enumérela en `io.virtual` (en ZPLC: **Mantener como virtual (sin pin)**) cuando quiera un bit o una palabra de la imagen de proceso que solo lea una prueba o el depurador.

## 5. Qué pasa cuando una dirección es incorrecta

- **En ZPLC**, se marca una fila con una dirección que la placa no tiene. El mensaje nombra la placa, la dirección y los canales que la placa tiene.
- **En la compilación**, una variable ubicada donde la placa no tiene canal es un error que nombra la placa y la variable, salvo que la dirección esté en `io.virtual`.
- **Al cargar**, se rechaza un programa que toca una dirección sin canal, con un mensaje que nombra la placa. También se rechaza una carga a un firmware que informa otra descripción que aquella para la que se compiló el proyecto.

## 6. Agregar un canal a una placa

Agregue el alias al overlay de devicetree de la placa y una entrada a su descripción de E/S en `firmware/app/boards/boards.json`. La tabla de E/S del firmware se genera a partir de la descripción al compilar, así que no cambia ningún código fuente en C, y la compilación falla cuando la descripción y el devicetree discrepan.

## Qué está verificado y qué no

| Parte                                                                             | Verificado                                                                                | Nivel           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- |
| Las descripciones son coherentes con el devicetree de cada placa                  | La compilación del firmware falla si no                                                   | Compilación     |
| Una dirección sin asignar es un error en el editor, la compilación y la carga     | Pruebas unitarias, y el recorrido 40 en la aplicación real                                | Host            |
| Un bit y una palabra en un mismo byte lo comparten, y el compilador no lo rechaza | El ejemplo de arriba se ejecuta en el runtime nativo; `zplc-cli check` acepta el programa | Host            |
| El escalado analógico de un canal, y la tabla de E/S del firmware                 | Pruebas en `native_sim`                                                                   | Destino emulado |
| Que un pin controle la señal que dice la descripción, y el nivel de una salida    | Sin probar                                                                                | Ninguno         |

## Vea también

- [Placas compatibles](../reference/boards.md): los canales, pines, valores seguros y huella de cada placa.
- [Forzar un valor](./force-values.md) y [Escribir y ejecutar pruebas de escenario](./scenario-tests.md).
- [Archivo de proyecto](../reference/project-file.md): cada campo de `io`.
