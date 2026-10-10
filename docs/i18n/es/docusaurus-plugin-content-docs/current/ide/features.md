---
slug: /ide/features
id: features
title: Entorno de trabajo de Studio
sidebar_label: Entorno de trabajo
description: El editor, el panel inferior, la simulación y el flujo de pruebas de ZPLC Studio 2.0.
tags: [ide, user-guide]
---

# Entorno de trabajo de Studio

El entorno de trabajo mantiene la edición en el centro y reúne Explorer,
Inspector, Output, Problems, Tests, Lab, Learn, Changes, Agent, Trace, Watch y
Terminal en un solo panel inferior.

## Flujo diario

1. Trabaje en una carpeta de proyecto que usted elija.
2. Compile y resuelva los diagnósticos.
3. Ejecute una prueba temporal o un escenario POSIX nativo y revise su trace.
4. Verifique el origen de los resultados antes de sacar una conclusión.

## Editores

ST es la vía principal con servicio de lenguaje. LD, FBD y SFC abren, editan,
guardan, copian y deshacen sus modelos; el ST que generan es un artefacto, no una
fuente de la que se pueda volver al modelo. IL es una vía de compatibilidad, en
la medida en que el compilador la acepta.

## Simulación y hardware

La simulación POSIX nativa es la forma de ejecutar un programa en su equipo.
Requiere la aplicación de escritorio, que incluye el runtime nativo; en esta
versión no hay un simulador WebAssembly en el navegador. Las acciones de hardware
están separadas: compilar el firmware del runtime, grabarlo, desplegar un
programa compilado y, después, ejecutar o depurar. Una persona inicia cada una.

## Límite de la depuración

Los watches, los traces, los breakpoints y los forces solo muestran lo que el
adaptador conectado puede informar. Un trace en host no es evidencia de hardware
ni de HIL; forzar un valor o cambiar RUN/STOP en un sistema físico exige la
autorización expresa de una persona y un procedimiento de seguridad del sitio.
Las herramientas de IA y MCP no pueden forzar valores ni cambiar RUN/STOP;
consulte [IA y privacidad](./ai-privacy.md).

## Pausa, reanudación, paso y Stop

La pausa, la reanudación y el paso conservan donde está el estado lógico del programa, y Stop lo descarta. La tabla vale para la simulación nativa y para el scheduler de Zephyr de una placa conectada.

| Acción | Imagen de salidas | Forzados | El scan |
|---|---|---|---|
| Pausa | Se conserva | Se conservan | Pausa entre scans. |
| Paso | Se conserva y muestra el scan ejecutado | Se conservan | Ejecuta un scan completo, o termina el scan detenido en un breakpoint. |
| Reanudación | Se conserva | Se conservan | Un scan detenido en un breakpoint continúa desde ahí. |
| Stop | Se pone a cero | Se borran | Cada tarea vuelve a su punto de entrada, y se descarta un scan que un breakpoint interrumpió. |

Una falla borra la imagen y los forzados igual que Stop. En una placa, la pausa, el paso y Stop además llevan las salidas físicas a su estado seguro, apagadas. [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada) tiene la tabla completa y las pruebas de Zephyr que la respaldan, ejecutadas en `native_sim` y QEMU sin medición en una placa. Para la simulación nativa, las verificaciones están en `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, donde Stop además pone a cero la imagen de entradas.
