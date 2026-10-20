---
slug: /guides/force-values
id: force-values
title: Forzar un valor
sidebar_label: Forzar valores
description: "Mantenga una entrada o una variable en un valor mientras un programa se ejecuta, y vea qué hace un forzado y qué lo borra."
tags: [how-to, debugging, force, simulation]
---

# Forzar un valor

Un forzado mantiene una variable en un valor que usted elige, sin importar lo que el
programa le asigne. Úselo en el simulador para probar una rama de la lógica sin un
escenario, y para ver qué hace el programa cuando una entrada tiene un valor difícil
de producir.

:::warning Un forzado en una máquina
En el simulador un forzado es inofensivo. En un controlador conectado a una planta
un forzado puede arrancar un motor: lo necesita una persona con la autoridad para
hacerlo y un procedimiento del sitio. Los asistentes de IA y el servidor MCP no
pueden forzar un valor ([IA, privacidad y revisión humana](../ide/ai-privacy.md)).
:::

## En el simulador

1. Compile el proyecto, elija **Simular**, presione **Conectar** y luego **Ejecutar**.
2. Abra la pestaña **Observación** y agregue la variable: presione **+** e ingrese su
   nombre.
3. Marque **Forzar** en la fila de la variable. El estado del panel dice
   `1 active force`.
4. Haga doble clic en la celda **Value** de la fila, escriba el valor y presione
   Enter. El programa lee el valor forzado a partir del siguiente ciclo.
5. Desmarque **Forzar** para liberar la variable.

En el panel **E/S en vivo**, al comienzo de la pestaña Watch, cada entrada que
declara el programa en ejecución tiene un interruptor (**Poner TRUE** y **Poner FALSE**)
o un cuadro numérico con **Aplicar**. **Forzar** allí mantiene la entrada en su valor
actual, y **Aplicar** cambia entonces el valor forzado. En el simulador, una entrada que
usted forzó conserva su último valor forzado cuando libera el forzado, hasta que
usted la fija de nuevo.

## Qué hace un forzado

| Acción | Forzados |
| --- | --- |
| El programa asigna la variable | Gana el valor forzado |
| Un mensaje Modbus, MQTT o de nube escribe la variable | El valor forzado permanece |
| Pausa, paso y reanudación | Se conservan |
| Detención | Se borran, y la imagen de salida se pone en cero |
| Una falla del runtime | Se borran, como con la detención |
| Carga de un programa nuevo | Se borran: una carga es un arranque en frío |

Un forzado admite los tipos de hasta 32 bits. Liberarlo devuelve la variable al
programa. [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada)
tiene la tabla completa, con las pruebas que la respaldan, incluido lo que hace una
salida forzada en la primera confirmación después de una reanudación.

## En un controlador

Los forzados en una placa conectada los hace una persona desde la tabla Watch, y la
consola del dispositivo tiene las mismas operaciones para una persona ante la
consola:

```bash
zplc dbg force list
zplc dbg force set <addr> <hexbytes>
zplc dbg force clear <addr>
zplc dbg force clear_all
```

`zplc dbg force set` mantiene una dirección en los bytes que usted da, en
hexadecimal, y anula las propias asignaciones del programa. `zplc stop` borra la
tabla de forzados. No deje un forzado en un controlador que nadie vigila.

## Qué está verificado y qué no

Una fuerza siempre pertenece a una sesión (COM-020). Una fuerza escrita en la
consola abre la sesión del enlace de la consola, o se une a la que la aplicación ZPLC tiene en
él, y termina con ella: cuando la sesión se cierra o se toma, después del tiempo
de inactividad (`CONFIG_ZPLC_PROTO_SESSION_IDLE_S`, 30 s por omisión; otro comando
de fuerza cuenta como actividad), y al instante cuando se pierde el enlace. En una
consola USB CDC ACM (la Raspberry Pi Pico) el dispositivo ve que el enlace se va
cuando cae DTR, lo que ocurre cuando la computadora cierra el puerto o se
desconecta el cable. Una consola que no informa la línea (el puerto USB-Serial/JTAG
del ESP32-S3, una UART simple) se libera por el tiempo de inactividad. Cuando otro
enlace tiene la sesión, la fuerza se rechaza. Una fuerza liberada devuelve a cada
byte el valor que el programa le dio por última vez, o el que tenía antes de la
fuerza si el programa nunca lo escribió, de modo que las salidas siguen al
programa.

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Un forzado mantiene un valor frente al programa y frente a una escritura externa | Pruebas en C y Zephyr, y un recorrido en la aplicación real | Host y `native_sim` |
| Los forzados se conservan con pausa y paso, y se borran con detención y con una falla | Pruebas del planificador | Host y `native_sim`, QEMU |
| Una fuerza de la consola termina con su sesión: cierre, toma, tiempo de inactividad, caída de la línea; la salida sigue al programa | Pruebas del motor y del núcleo; la prueba del enlace del dispositivo con la imagen real (allí no se puede bajar DTR) | Host y `native_sim` |
| DTR en el puerto USB de la Pico termina la sesión | No se ejecutó en una placa | Ninguno |
| Una entrada de un programa puede fijarse o forzarse por su propio nombre | Recorrido 37 en la aplicación real | Host |
| El efecto de un forzado en un pin físico | No probado | Ninguno |

## Vea también

- [Banco de trabajo de ZPLC](../ide/features.md#es-en-vivo): el faceplate de E/S en vivo y el límite de la depuración.
- [La consola de ZPLC](../operations/shell.md): todos los comandos de depuración.
- [Seguridad y limitaciones](../safety-and-limitations.md).
