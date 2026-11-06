---
slug: /guides/modbus
id: modbus
title: Usar Modbus RTU y TCP
sidebar_label: Modbus RTU y TCP
description: 'Haga que un controlador responda a un maestro Modbus, y lea o escriba otro dispositivo Modbus desde el programa, con el nivel de evidencia de cada parte.'
tags: [how-to, modbus, communication]
---

# Usar Modbus RTU y TCP

ZPLC usa Modbus en dos funciones. Como **servidor**, el controlador responde a un maestro (un sistema SCADA, una HMI, una herramienta de prueba) y expone variables de su programa. Como **cliente**, su programa pide registros a otro dispositivo con bloques de función. Esta página cubre ambas y dice, para cada parte, qué se ejercitó.

:::warning Nivel de evidencia: host y `native_sim`
El encuadre y el mapeo del servidor, los manejadores de los bloques de función contra sustitutos y el cliente Modbus TCP contra un servidor escrito para la prueba en un socket de loopback se ejercitaron en el host y en `native_sim`. No hay registro de un intercambio Modbus con un dispositivo real, un cable serie o un maestro de terceros, y el cliente RTU se comprobó solo en sus parámetros de interfaz. La evidencia de banco y la manual siguen abiertas.
:::

## Qué necesita

- Una placa con la interfaz que quiere. Modbus TCP necesita una interfaz de red (Wi-Fi o Ethernet), y Modbus RTU necesita una interfaz serie que provea el perfil de la placa. [Placas](../reference/boards.md) lista la clase de red de cada una.
- Un proyecto. En el simulador de ZPLC puede escribir y comprobar el programa, y la aplicación y `zplc-cli test` ([línea de comandos](./command-line.md)) también inician un servidor Modbus TCP en la interfaz de loopback, de modo que un bloque cliente puede hacer una solicitud ([En simulación](../runtime/communication-function-blocks.md#en-simulación)). El tráfico Modbus real necesita una placa.

## Haga que el controlador sea un servidor

### 1. Vincule variables a direcciones Modbus

Ponga `{modbus:<dirección>}` después del tipo de una variable. El maestro lee y escribe la variable en esa dirección.

```st runnable expect="Pressure=1.5 PumpRun=TRUE" scans=2 scan_ms=10
PROGRAM Plant
VAR
    Pressure : REAL {modbus:40001};
    PumpRun : BOOL {modbus:1};
    Level : INT;
END_VAR

Level := 250;
PumpRun := Level > 100;
Pressure := 1.5;
END_PROGRAM
```

Una variable de 32 bits (`REAL`, `DINT`, `UDINT`, `DWORD`) ocupa dos registros consecutivos, y las demás ocupan uno. El número de la etiqueta dice el área, con la notación del mundo Modbus:

| `N`                              | Área                  | Dirección en el cable | Un maestro puede                           |
| -------------------------------- | --------------------- | --------------------- | ------------------------------------------ |
| 10001 a 19999                    | Entrada discreta      | `N - 10001`           | leerla (función 2)                         |
| 30001 a 39999                    | Registro de entrada   | `N - 30001`           | leerlo (función 4)                         |
| 40001 a 49999                    | Registro de retención | `N - 40001`           | leerlo (función 3) y escribirlo (6, 16)    |
| cualquier otro número, un `BOOL` | Bobina                | `N`                   | leerla (función 1) y escribirla (5, 15)    |
| cualquier otro número, otro tipo | Registro de retención | `N`                   | leerlo (función 3) y escribirlo (6, 16)    |

En el ejemplo, `Pressure` es el registro de retención en la dirección 0 y `PumpRun` es la bobina en la dirección 1. Mantenga separados los rangos de dos variables de la misma área.

Puede hacer los mismos vínculos sin editar el código fuente. La sección **Comunicación** de **Configuración del proyecto** los lista como **Etiquetas de comunicación**, y cada una es una entrada `communication.bindings` de `zplc.json`. Una etiqueta tiene un área y una dirección en el cable, y la compilación escribe el número de la tabla: un registro de retención en la dirección 5 es `{modbus:40006}`.

### 2. Configure el servidor en el proyecto

```json zplc-fragment
{
  "communication": {
    "modbus": {
      "enabled": true,
      "unitId": 1,
      "tcpEnabled": true,
      "tcpPort": 502,
      "rtuEnabled": false,
      "rtuBaud": 19200,
      "rtuParity": "even",
      "pollIntervalMs": 100
    },
    "bindings": [
      { "name": "Pressure", "symbol": "Pressure", "type": "REAL", "mode": "modbus", "modbusAddress": 40001 },
      { "name": "PumpRun", "symbol": "PumpRun", "type": "BOOL", "mode": "modbus", "modbusAddress": 1 }
    ]
  }
}
```

La comprobación de la documentación mezcla este fragmento en un proyecto y lo compila, así que ZPLC lo acepta. `unitId` es el identificador de unidad Modbus, de 1 a 247. Active solo las interfaces que use.

### 3. Cargue los ajustes en la placa

Cargar los ajustes en una placa es una acción humana: ZPLC envía los ajustes del proyecto al dispositivo por el enlace serie. Estos son los comandos que envía para el fragmento de arriba, y puede escribirlos en la consola del dispositivo:

```bash
zplc config set modbus_id 1
zplc config set modbus_tcp_enabled 1
zplc config set modbus_tcp_port 502
zplc config save
```

`zplc config save` escribe los ajustes en el almacén del dispositivo. Una placa cuyo almacén no se puede montar informa un error en lugar de `OK` ([Conectividad](../runtime/connectivity.md#ajustes-guardados)). Para RTU las claves son `modbus_rtu_enabled`, `modbus_rtu_baud` y `modbus_rtu_parity`, donde la paridad es `0` para ninguna, `1` para par y `2` para impar.

### 4. Qué puede y qué no puede hacer un maestro

Una escritura de un maestro pasa por la interfaz que respeta los forzados y por el intercambio del runtime. Una variable que usted forzó conserva su valor forzado, y el ciclo siguiente aplica la escritura. Ningún mensaje Modbus puede iniciar ni detener el programa, definir ni quitar un forzado, ni descargar un programa ([Qué puede hacer un mensaje de la red](../runtime/connectivity.md#qué-puede-hacer-un-mensaje-de-la-red)).

Las cuatro áreas son cuatro espacios de direcciones, y una variable se sirve en un solo área. Una solicitud de una dirección que ninguna variable tiene en el área solicitada recibe la excepción 2 (dirección de datos ilegal). Las entradas discretas y los registros de entrada se pueden leer y no escribir. Toda variable de WORK y RETAIN se puede vincular, y el servidor sirve todo el rango del cable hasta la dirección 65535 para las direcciones que tienen una variable ([Áreas y direcciones Modbus](../runtime/connectivity.md#áreas-y-direcciones-modbus)).

## Leer o escribir otro dispositivo (cliente)

Use `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL` y `MB_WRITE_COIL`. Cada uno recibe el transporte (`PROTO` 0 para RTU, 1 para TCP), el identificador de unidad, la dirección, la cantidad y, para TCP, el host y el puerto. Cada uno informa `BUSY`, `DONE`, `ERROR` y un código `STATUS`.

```st runnable expect="Failed=TRUE Code=3" scans=3 scan_ms=10
PROGRAM Poll
VAR
    Link : MB_READ_HREG;
    Failed : BOOL;
    Code : DINT;
END_VAR

Link(EN := TRUE, PROTO := 1, SLAVE_ID := 1, ADDR := 0, COUNT := 1, HOST := '192.168.1.50', PORT := 502);
Failed := Link.ERROR;
Code := Link.STATUS;
END_PROGRAM
```

La comprobación de la documentación ejecuta este programa en el runtime nativo sin configurar, que no tiene manejador para el bloque, así que termina con `ERROR` en TRUE y `STATUS` 3. Eso muestra que el bloque compila, se ejecuta e informa un estado. En una sesión de ZPLC la misma solicitud llega al servidor Modbus de loopback, porque la sesión enciende los bloques de comunicación. Lea `STATUS` después de `ERROR`: 0 es OK, 2 tiempo agotado, 4 no conectado, 5 todas las ranuras de solicitud en uso, 6 dirección no válida, 8 error de protocolo y 10 no disponible. El resto está en los [códigos de estado](../runtime/communication-function-blocks.md#códigos-de-estado).

El bloque sigue el único handshake de los doce bloques de comunicación ([Bloques de función de comunicación](../runtime/communication-function-blocks.md#el-handshake)):

- Un flanco de subida de `EN` hace una solicitud. Mientras `EN` sigue en TRUE después del resultado, el resultado se mantiene y nada se repite. Deje que `EN` baje un ciclo para pedir de nuevo.
- Una solicitud en curso termina aunque `EN` baje, y un flanco de subida mientras `BUSY` es TRUE no inicia nada.
- Solo el runtime escribe `BUSY`, `DONE`, `ERROR` y `STATUS`. Llame al bloque en cada ciclo, porque solo avanza cuando se lo llama.
- Una solicitud corre fuera del ciclo. El cliente espera como máximo el doble del tiempo límite configurado, y el bloque informa `ERROR` con `STATUS` 2 a más tardar `(2 x tiempo límite + 100 ms) x 8` después de la solicitud: 8,8 s con el tiempo límite por defecto de 500 ms.
- `COUNT` es 1. Una solicitud de más registros o bobinas se rechaza con `STATUS` 6.

Una solicitud Modbus RTU en simulación no tiene dispositivo serie y responde `STATUS` 10.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Encuadre y mapeo del servidor de cada código de función, longitudes erróneas, rangos sin mapear | Pruebas que ponen tramas frente al servidor | Host y `native_sim` |
| Una escritura de un maestro no puede cambiar el estado de ejecución, los forzados ni el programa cargado | Comprobación a nivel de enlace y una prueba de autoridad | Host y `native_sim` |
| Una variable forzada conserva su valor ante una escritura de un maestro | Una prueba con un intercambio que registra | Host y `native_sim` |
| Las cuatro áreas son cuatro espacios de direcciones, y se sirve todo WORK y RETAIN | Una prueba del firmware que carga un programa con las etiquetas de las cuatro áreas, los bordes de WORK y RETAIN y la dirección 65535, y las lee y escribe por las costuras en que terminan ambos servidores | `native_sim` |
| Manejadores de los bloques de función: pines, handshake, códigos de estado, reinicio con una solicitud en curso | Pruebas con un cliente sustituto | Host y `native_sim` |
| El cliente Modbus TCP: éxito, una respuesta en partes, excepción, silencio, una conexión cerrada, un puerto rechazado, reinicio con el bloque ocupado | Su código de transacción es un solo archivo compilado en el controlador y en el runtime de simulación, y corre contra un servidor escrito para la prueba en loopback en ambos | `native_sim` y host |
| El cliente Modbus RTU | Solo se comprueban sus parámetros de interfaz (el tiempo límite está en la unidad que lee el cliente Modbus de Zephyr); no se usa ningún dispositivo serie | `native_sim` |
| Un intercambio con un dispositivo real, un cable serie, un maestro de terceros | No probado | Ninguno |
| Temporización de una solicitud en una línea real, comportamiento ante errores de línea | No probado | Ninguno |

## Vea también

- [Conectividad](../runtime/connectivity.md): protocolos, valores por defecto seguros y qué puede hacer un mensaje.
- [Bloques de función de comunicación](../runtime/communication-function-blocks.md) y la [referencia de bloques de función](../reference/function-blocks.md).
- [Archivo de proyecto](../reference/project-file.md): cada campo de `communication.modbus`.
- [Seguridad y limitaciones](../safety-and-limitations.md).
