---
slug: /guides/map-io
id: map-io
title: Vincular variables a pines
sidebar_label: Vincular E/S a pines
description: 'Conecte las variables de un programa a las entradas y salidas de una placa, con la descripción de E/S de la placa y el editor de mapeo de E/S de ZPLC.'
tags: [how-to, io, boards, mapping]
---

# Vincular variables a pines

Un programa lee entradas y escribe salidas a través de direcciones de la imagen de
proceso, como `%IX0.0` y `%QX0.0`. La placa decide a qué pin llega cada dirección.
Esta página muestra cómo ubicar una variable en una dirección, cómo ver de qué pin
se trata y qué hacen la compilación y el despliegue cuando la dirección es errónea.

:::note Dónde está la verdad
Cada placa tiene una descripción de E/S en `firmware/app/boards/boards.json`: sus
canales, la dirección IEC y el pin de cada uno, sus notas eléctricas y el valor
seguro de cada salida. La aplicación ZPLC, la compilación, el firmware y la documentación leen
ese único archivo, por lo que la tabla de pines de [Placas soportadas](../reference/boards.md)
contiene los mismos datos que comprueba la compilación. Ningún pin se ha medido en un
banco: [Compatibilidad de hardware](../reference/capabilities-evidence.md).
:::

## 1. Encuentre los canales de su placa

Abra [Placas soportadas](../reference/boards.md) y la sección de su placa. Cada fila
es un canal: su dirección (`%QX0.0` para una salida digital, `%IW4` para una entrada
analógica), el pin o borne impreso en la placa, si el pin lo demuestra el
devicetree de la placa (`devicetree`) o lo eligió el perfil (`profile`), y el valor
seguro de una salida.

## 2. Ubique las variables

En Structured Text, dé a una variable la dirección después de su nombre con `AT`:

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

La entrada de este programa es `FALSE` cuando nada la fija, así que la salida es
`TRUE`. En una placa cuya entrada tiene resistencia de pull-up, como habilita el
perfil de la Raspberry Pi Pico, un interruptor a tierra lee `FALSE` mientras está
pulsado: las notas eléctricas del canal dicen cómo se cablea el pin.

## 3. Vincúlelas en el proyecto

La misma ubicación se registra en `zplc.json` bajo `io`. En ZPLC, abra **Configuración del proyecto**: la sección **Mapeo de E/S** enumera los canales de la placa seleccionada
con los nombres de pin impresos en ella, y cada fila ofrece solo los canales de esa
placa, de modo que una fila no puede ponerse donde la placa no tiene nada.

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

La verificación de la documentación contrasta cada dirección de `inputs` y
`outputs` de un fragmento con los canales de su placa, y combina el fragmento con un
proyecto y lo compila.

Una dirección que ningún pin de la placa maneja no es un canal. Enumérela en
`io.virtual` (en ZPLC: **Mantener como virtual (sin pin)**) cuando quiera una palabra o un
bit de la imagen de proceso que solo lee una prueba o el depurador.

## 4. Qué ocurre cuando una dirección es errónea

- **En ZPLC**, una fila en una dirección que la placa no tiene se marca. El
  mensaje nombra la placa, la dirección y los canales que la placa tiene.
- **En la compilación**, una variable ubicada donde la placa no tiene canal es un
  error que nombra la placa y la variable, salvo que la dirección esté enumerada en
  `io.virtual`.
- **Al cargar**, se rechaza un programa que toca una dirección sin canal, con un
  mensaje que nombra la placa, y se rechaza también un despliegue a un firmware
  que informa una descripción distinta de aquella para la que se compiló el
  proyecto.

## 5. Agregue un canal a una placa

Agregue el alias al overlay de devicetree de la placa y una entrada a su descripción
de E/S en `firmware/app/boards/boards.json`. La tabla de E/S del firmware se genera
a partir de la descripción al compilar, de modo que no cambia ningún código C, y la
compilación falla cuando la descripción y el devicetree no coinciden.

## Qué está verificado y qué no

| Parte                                                                             | Verificado                                                 | Nivel           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- |
| Las descripciones son coherentes con el devicetree de cada placa                  | La compilación del firmware falla en caso contrario        | Compilación     |
| Una dirección sin mapear es un error en el editor, la compilación y el despliegue | Pruebas unitarias, y el recorrido 40 en la aplicación real | Host            |
| El escalado analógico de un canal y la tabla de E/S del firmware                  | Pruebas en `native_sim`                                    | Destino emulado |
| Que un pin maneje la señal que dice la descripción, y el nivel de una salida      | No probado                                                 | Ninguno         |

## Vea también

- [Placas soportadas](../reference/boards.md): los canales, pines, valores seguros y huella de cada placa.
- [Forzar un valor](./force-values.md) y [Ejecutar pruebas de escenario](./scenario-tests.md).
- [Archivo de proyecto](../reference/project-file.md): cada campo de `io`.
