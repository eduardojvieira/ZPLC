---
slug: /guides/modbus
id: modbus
title: Usar Modbus RTU y TCP
sidebar_label: Modbus RTU y TCP
description: "Haga que un controlador responda a un maestro Modbus y lea o escriba otro dispositivo Modbus desde el programa, con el contrato que existe hoy."
tags: [how-to, modbus, communication]
---

# Usar Modbus RTU y TCP

ZPLC usa Modbus en dos roles. Como **servidor**, el controlador responde a un
maestro (un sistema SCADA, un HMI, una herramienta de prueba) y expone variables de
su programa. Como **cliente**, su programa pide registros a otro dispositivo con
bloques de función. Esta página cubre ambos con el contrato que está documentado
hoy.

:::warning Estado de esta página
Verificado solo en el host y en `native_sim`: el entramado y el mapeo del servidor,
y los manejadores de los bloques de función contra sustitutos. No se ha registrado
ningún intercambio Modbus con un dispositivo real, un cable serie ni un maestro de
terceros. Dos partes se están reelaborando y se marcan como **inestables** más
abajo: el protocolo común de los bloques de comunicación y la separación de las
cuatro áreas de datos. Consulte las [notas de la versión](../release-notes/index.md)
antes de depender de ellas.
:::

## Qué necesita

- Una placa con la interfaz que quiere: Modbus TCP necesita una interfaz de red
  (Wi-Fi o Ethernet), y Modbus RTU necesita una interfaz serie que ofrezca el perfil
  de la placa. [Soporte de hardware](../reference/capabilities-evidence.md) enumera
  las placas y su clase de red.
- Un proyecto, en Studio o a mano. El simulador de su equipo no tiene servidor ni
  dispositivo Modbus: un programa que usa Modbus se escribe y se revisa allí, y el
  intercambio en sí solo es posible en una placa.

## Convierta el controlador en servidor

### 1. Vincule variables a direcciones Modbus

Marque una variable del programa con `{modbus:<dirección>}` después de su tipo. El
maestro lee y escribe la variable en esa dirección.

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

Una variable de 32 bits (`REAL`, `DINT`, `UDINT`, `DWORD`) ocupa dos registros
consecutivos; las demás ocupan uno. Indique una dirección, `40001` y superiores para
registros y `1` y superiores para bobinas, y mantenga separados los rangos de dos
variables.

En Studio puede hacer los mismos vínculos sin editar el código: la sección
**Communication** de **Project Settings** los enumera como **Communication Tags**, y
cada uno es una entrada `communication.bindings` de `zplc.json`.

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

La verificación de la documentación combina este fragmento con un proyecto y lo
compila, por lo que es una configuración que Studio acepta. `unitId` es el
identificador de unidad Modbus, de 1 a 247. Active solo las interfaces que use.

### 3. Lleve los ajustes a la placa

Aprovisionar una placa es una acción humana en Studio: envía los ajustes del
proyecto al dispositivo por el enlace serie. Estos son los comandos que envía para
el fragmento anterior, que también puede escribir en la consola del dispositivo:

```bash
zplc config set modbus_id 1
zplc config set modbus_tcp_enabled 1
zplc config set modbus_tcp_port 502
zplc config save
```

`zplc config save` escribe los ajustes en el almacén del dispositivo; una placa cuyo
almacén no puede montarse informa un error en lugar de `OK`
([Conectividad](../runtime/connectivity.md#ajustes-guardados)). Para RTU las claves
son `modbus_rtu_enabled`, `modbus_rtu_baud` y `modbus_rtu_parity`, donde la paridad
es `0` ninguna, `1` par y `2` impar.

### 4. Qué puede y qué no puede hacer un maestro

Una escritura de un maestro pasa por la interfaz que respeta forzados y por el
intercambio del runtime: una variable que usted forzó conserva su valor forzado, y
la escritura la aplica el siguiente ciclo. Ningún mensaje Modbus puede iniciar ni
detener el programa, fijar ni borrar un forzado, ni descargar un programa
([Qué puede hacer un mensaje de la red](../runtime/connectivity.md#qué-puede-hacer-un-mensaje-de-la-red)).

**Inestable:** el servidor responde una variable vinculada en el área que nombra la
solicitud; todavía no mantiene bobinas, entradas discretas, registros de entrada y
registros de retención como cuatro espacios de direcciones separados. Use registros
de retención para valores y bobinas para bits, y no cuente con que un área esté
separada de otra.

## Lea o escriba otro dispositivo (cliente)

Use los bloques `MB_READ_HREG`, `MB_WRITE_HREG`, `MB_READ_COIL` y `MB_WRITE_COIL`.
Cada uno recibe el transporte (`PROTO` 0 para RTU, 1 para TCP), el identificador de
unidad, la dirección, la cantidad y, para TCP, el host y el puerto; y cada uno
informa `BUSY`, `DONE`, `ERROR` y un código `STATUS`.

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

En el simulador de su equipo no hay ningún dispositivo que responda, así que el
bloque termina con `ERROR` en TRUE y `STATUS` 3 (sin manejador). Eso demuestra que
el bloque compila, se ejecuta e informa un estado; el intercambio con un
dispositivo es posible en una placa. Lea `STATUS` después de `ERROR`: 0 es correcto,
2 tiempo de espera agotado, 4 sin conexión, 5 cola de solicitudes llena, 6 dirección
inválida, y el resto está en la
[referencia de bloques de función](../reference/function-blocks.md#mb_read_hreg).

Una solicitud se ejecuta fuera del ciclo, mediante una cola acotada, de modo que un
bloque nunca bloquea el ciclo. No inicie una solicitud nueva mientras `BUSY` sea TRUE.

**Inestable:** el momento de `BUSY`, `DONE` y `ERROR` a lo largo de los ciclos, y lo
que hace un reinicio o una desactivación a una solicitud en curso, se están fijando
como un único protocolo documentado para los doce bloques de comunicación. Escriba
el programa para que funcione tanto si `DONE` dura un ciclo como si dura más: actúe
en el primer ciclo en que sea TRUE.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Entramado y mapeo del servidor de cada código de función, longitudes erróneas, rangos sin mapear | Pruebas que ponen tramas frente al servidor | Host y `native_sim` |
| Una escritura de un maestro no puede cambiar el estado de ejecución, los forzados ni el programa cargado | Comprobación a nivel de enlace y una prueba de autoridad | Host y `native_sim` |
| Una variable forzada conserva su valor ante una escritura de un maestro | Una prueba con un intercambio que registra | Host y `native_sim` |
| Manejadores de los bloques de función: disposición, límites, reinicio con una solicitud en curso | Pruebas con un cliente sustituto | Host y `native_sim` |
| Un intercambio con un dispositivo real, un cable serie, un maestro de terceros | No probado | Ninguno |
| Tiempos de una solicitud, comportamiento ante errores de línea | No probado | Ninguno |

## Vea también

- [Conectividad](../runtime/connectivity.md): protocolos, valores seguros por defecto y lo que puede hacer un mensaje.
- [Bloques de función de comunicación](../runtime/communication-function-blocks.md) y la [referencia de bloques de función](../reference/function-blocks.md).
- [Archivo de proyecto](../reference/project-file.md): cada campo de `communication.modbus`.
- [Seguridad y limitaciones](../safety-and-limitations.md).
