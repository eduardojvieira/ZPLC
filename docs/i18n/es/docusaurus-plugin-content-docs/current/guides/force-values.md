---
slug: /guides/force-values
id: force-values
title: Forzar un valor
sidebar_label: Forzar valores
description: 'Mantenga una entrada o una variable en un valor mientras un programa se ejecuta, y vea qué hace un forzado y qué lo borra.'
tags: [how-to, debugging, force, simulation]
---

# Forzar un valor

Un forzado mantiene una variable en un valor que usted elige, sin importar lo que el programa le asigne. Úselo en el simulador para probar una rama de la lógica sin escribir un escenario, y para ver cómo reacciona el programa ante una entrada difícil de producir.

:::danger Forzar es una acción humana
En el simulador un forzado es inofensivo. En un controlador conectado a una planta, un forzado puede arrancar un motor. Lo necesita una persona con la autoridad para hacerlo y un procedimiento del sitio.

Los asistentes de IA y el servidor MCP nunca fuerzan un valor, ni en un simulador ni en un dispositivo (regla 7 de AGENTS.md). Un forzado siempre parte del clic de una persona o de su comando en la consola. Vea [IA, privacidad y revisión humana](../ide/ai-privacy.md).
:::

## En el simulador

1. Compile el proyecto, elija **Simular**, pulse **Conectar** y luego **Ejecutar**.
2. Abra la pestaña **Observación**, pulse **+** y escriba el nombre de la variable.
3. Marque **Forzar** en la fila de la variable. El estado del panel dice `1 active force`.
4. Haga doble clic en la celda **Valor**, escriba el valor y pulse Enter. El programa lee el valor forzado a partir del siguiente ciclo.
5. Desmarque **Forzar** para devolver la variable al programa.

El panel **E/S en vivo**, al comienzo de la pestaña Observación, enumera cada entrada que declara el programa en ejecución. Cada una tiene un interruptor (**Poner TRUE** y **Poner FALSE**) o un cuadro numérico con **Aplicar**. **Forzar** allí mantiene la entrada en su valor actual, y **Aplicar** cambia entonces el valor forzado. En el simulador, una entrada que usted forzó conserva su último valor forzado cuando libera el forzado, hasta que usted la fija de nuevo.

## Qué hace un forzado

| Evento | Forzados |
| --- | --- |
| El programa asigna la variable | Gana el valor forzado |
| Un mensaje Modbus, MQTT o de nube escribe la variable | El valor forzado permanece |
| Pausa, paso y reanudación | Se conservan |
| Detención | Se borran, y la imagen de salida se pone en cero |
| Una falla del runtime | Se borran, como con la detención |
| Carga de un programa nuevo | Se borran: una carga es un arranque en frío |
| Una prueba de escenario | Se rechaza mientras haya un forzado activo: libérelo antes |

Un forzado admite los tipos de hasta 32 bits. [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada) tiene la tabla completa y sus pruebas, incluido lo que hace una salida forzada en la primera confirmación después de una reanudación.

## En un controlador

En una placa conectada, una persona fuerza desde la tabla de observación. Una persona ante la consola del dispositivo tiene las mismas operaciones en el shell:

```bash
zplc dbg force list
zplc dbg force set <addr> <hexbytes>
zplc dbg force clear <addr>
zplc dbg force clear_all
```

`zplc dbg force set` mantiene una dirección en los bytes que usted indica, en hexadecimal, y prevalece sobre las asignaciones del propio programa. `zplc stop` borra la tabla de forzados. Nunca deje un forzado en un controlador que nadie vigila.

Un forzado siempre pertenece a una sesión (COM-020). Un forzado escrito en la consola abre la sesión del enlace de la consola, o se une a la que la aplicación ZPLC mantiene en él, y termina con esa sesión:

- cuando la sesión se cierra o se toma;
- tras el tiempo de inactividad (`CONFIG_ZPLC_PROTO_SESSION_IDLE_S`, 30 s por defecto; otro comando de forzado cuenta como actividad);
- de inmediato cuando se pierde el enlace.

En una consola USB CDC ACM (la Raspberry Pi Pico), el dispositivo ve caer el enlace cuando baja DTR, lo que ocurre cuando el computador cierra el puerto o se desconecta el cable. Una consola que no informa de la línea (el puerto USB-Serial/JTAG del ESP32-S3, una UART simple) se libera por el tiempo de inactividad. Mientras otro enlace mantenga la sesión, el forzado se rechaza. Un forzado liberado da a cada byte el valor que el programa le dio por última vez, o el valor que tenía antes del forzado si el programa nunca lo escribió, de modo que las salidas siguen al programa.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Un forzado mantiene un valor frente al programa y frente a una escritura externa | Pruebas de C y de Zephyr, y un recorrido en la aplicación real | Host y `native_sim` |
| La pausa y el paso conservan los forzados, y la detención y una falla los borran | Pruebas del planificador | Host, `native_sim` y QEMU |
| Un forzado de consola termina con su sesión: cierre, toma, tiempo de inactividad, línea caída; la salida sigue al programa | Pruebas del motor y del núcleo; la prueba del enlace del dispositivo con la imagen real (allí no se puede bajar DTR) | Host y `native_sim` |
| DTR en el puerto USB de la Pico termina la sesión | No se ejecutó en una placa | Ninguno |
| Una entrada de un programa se puede fijar o forzar por su propio nombre | Recorrido 37 en la aplicación real | Host |
| El efecto de un forzado en un pin físico | Sin probar | Ninguno |

## Vea también

- [Banco de trabajo de ZPLC](../ide/features.md#es-en-vivo): el panel de E/S en vivo y el límite de la depuración.
- [El shell de ZPLC](../operations/shell.md): todos los comandos de depuración.
- [Seguridad y limitaciones](../safety-and-limitations.md).
