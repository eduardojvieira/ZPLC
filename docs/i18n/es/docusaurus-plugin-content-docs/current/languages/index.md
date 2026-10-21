---
slug: /languages
id: index
title: Lenguajes y modelo de programación
sidebar_label: Generalidades
description: Panorama de los flujos de lenguajes IEC 61131-3 en ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y modelo de programación

El texto estructurado (ST) es el frontend de lenguaje central de ZPLC. El repositorio también tiene flujos para LD, FBD, SFC e IL. Su edición, conversión, depuración y cobertura en destino varían, por lo que conviene elegir el flujo según su evidencia actual y no suponer cobertura IEC completa ni paridad total.

## Flujos disponibles

| Lenguaje                                 | Ruta actual                                       |
| ---------------------------------------- | ------------------------------------------------- |
| **Texto estructurado (ST)**              | Frontend textual central del compilador.          |
| **Lista de instrucciones (IL)**          | Se analiza y se transpila a ST antes de compilar. |
| **Diagrama de escalera (LD)**            | Flujo de editor y transpilador visual.            |
| **Diagrama de bloques de función (FBD)** | Flujo de editor y transpilador visual.            |
| **Diagrama funcional secuencial (SFC)**  | Flujo de editor y transpilador visual.            |

## Qué puede hacer hoy cada lenguaje

Cada fila nombra el recorrido de la aplicación ZPLC que muestra la capacidad de extremo a extremo, en una ventana real; la integración continua los ejecuta todos, y la tabla se genera a partir de esa lista, no se escribe a mano. Al generar la página se rechaza una celda sin recorrido, o con solo una prueba unitaria o un caso de conformidad. Compilar, simular y cargar de cada lenguaje salen de una misma cadena: se crea un programa en un proyecto nuevo, se edita un ejemplo, se guarda, se reabre y se compila, se simula con una pausa y un solo paso, y se observa; luego se pulsa Cargar y se confirma contra el runtime nativo detrás del intérprete de comandos de una placa emulada, y allí se observa que el mismo valor cambia. La placa es emulada y nada se ejecuta en una física: lo que una persona ejecutó en placas reales está en la página de evidencia de hardware. Los puntos de parada están en las filas de depuración, y la pausa, el paso de ciclo y la reanudación, en las filas de pausa; el perfil de capacidades que informa el runtime decide cuáles habilita la aplicación ZPLC.

{/* >>> GENERATED (tools/docs/generate_language_capabilities.ts): language-capabilities. Do not edit. >>> */}

| Lenguaje | Capacidad | Evidencia | Prueba que lo muestra |
| --- | --- | --- | --- |
| Texto estructurado | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `3 Edit Structured Text, save, reopen` |
| Texto estructurado | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64a Structured Text from a new project to a deployed program that is watched` |
| Texto estructurado | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64a Structured Text from a new project to a deployed program that is watched` |
| Texto estructurado | Depurar (punto de interrupción) | Recorrido de la aplicación ZPLC en la simulación nativa | `7 Breakpoint stops execution` |
| Texto estructurado | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53e Pause, step one cycle and resume a Structured Text program` |
| Texto estructurado | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28e Inline values in Structured Text come from the debug map` |
| Texto estructurado | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `8 Force an input and release it` |
| Texto estructurado | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64a Structured Text from a new project to a deployed program that is watched` |
| Lista de instrucciones | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `54 Instruction List is edited, saved and reopened` |
| Lista de instrucciones | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64b Instruction List from a new project to a deployed program that is watched` |
| Lista de instrucciones | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64b Instruction List from a new project to a deployed program that is watched` |
| Lista de instrucciones | Depurar (punto de interrupción) | Recorrido de la aplicación ZPLC en la simulación nativa | `28kc A breakpoint on an IL line stops execution` |
| Lista de instrucciones | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53d Pause, step one cycle and resume an Instruction List program` |
| Lista de instrucciones | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `54b Instruction List values are watched and a variable is forced and released` |
| Lista de instrucciones | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `54b Instruction List values are watched and a variable is forced and released` |
| Lista de instrucciones | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64b Instruction List from a new project to a deployed program that is watched` |
| Diagrama de escalera | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `28f A rung is built from the keyboard` |
| Diagrama de escalera | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Diagrama de escalera | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Diagrama de escalera | Depurar (punto de interrupción) | Recorrido de la aplicación ZPLC en la simulación nativa | `28 A breakpoint on a rung stops execution` |
| Diagrama de escalera | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53a Pause, step one cycle and resume a Ladder program` |
| Diagrama de escalera | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28b Online values of a rung come from the debug map` |
| Diagrama de escalera | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `51d A forced variable is shown as forced in the Ladder` |
| Diagrama de escalera | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Diagrama de bloques de función | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `28g A function block diagram is edited from the keyboard` |
| Diagrama de bloques de función | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Diagrama de bloques de función | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Diagrama de bloques de función | Depurar (punto de interrupción) | Recorrido de la aplicación ZPLC en la simulación nativa | `28ka A breakpoint on an FBD block stops execution` |
| Diagrama de bloques de función | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53b Pause, step one cycle and resume a function block diagram` |
| Diagrama de bloques de función | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28c Online values of an FBD come from the debug map` |
| Diagrama de bloques de función | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `51 A forced variable is shown as forced in the function block diagram` |
| Diagrama de bloques de función | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Diagrama funcional secuencial | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `28h A sequential function chart is edited from the keyboard` |
| Diagrama funcional secuencial | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64e Sequential Function Chart from a new project to a deployed program that is watched` |
| Diagrama funcional secuencial | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64e Sequential Function Chart from a new project to a deployed program that is watched` |
| Diagrama funcional secuencial | Depurar (punto de interrupción) | Recorrido de la aplicación ZPLC en la simulación nativa | `28kb A breakpoint on an SFC step stops execution` |
| Diagrama funcional secuencial | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53c Pause, step one cycle and resume a sequential function chart` |
| Diagrama funcional secuencial | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28d Online state of an SFC comes from the debug map` |
| Diagrama funcional secuencial | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `51b A forced variable is shown as forced in the sequential function chart` |
| Diagrama funcional secuencial | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64e Sequential Function Chart from a new project to a deployed program that is watched` |

{/* <<< END GENERATED: language-capabilities <<< */}

## Modelo de compilación

Los flujos de lenguaje soportados convergen en la ruta del compilador que produce bytecode `.zplc`. Ese destino común no promete conversiones de ida y vuelta arbitrarias entre representaciones, funciones de editor idénticas, cobertura completa de la biblioteca estándar ni el mismo rendimiento en cada runtime.

Valide como un único flujo el lenguaje fuente, la representación generada, los diagnósticos y el perfil de destino elegido.

## Depuración y evidencia de runtime

La aplicación ZPLC expone inspección, simulación y depuración según el perfil de capacidades del runtime activo. POSIX nativo es un runtime lógico de host, no evidencia de tiempos de hardware ni de comportamiento en destino. Los puntos de parada de hardware, los forzados, la carga y los controles de ejecución son específicos de capacidades y requieren evidencia separada.

En la simulación nativa de un host Linux, los recorridos de la aplicación ZPLC detienen el programa en un punto de parada sobre una línea de texto estructurado, una línea de lista de instrucciones, un peldaño de un diagrama de escalera, un bloque de un diagrama de bloques de función y un paso de un diagrama funcional secuencial, y marcan el elemento donde se detuvo. Estas ejecuciones no son evidencia de un punto de parada en una placa: eso requiere una ejecución de hardware en el lazo en esa placa.

## Biblioteca estándar

La biblioteca estándar se implementa mediante rutas de compilador y runtime. Consulte [Biblioteca estándar](./stdlib.md) y compile el flujo de lenguaje elegido para saber qué está disponible hoy.

## Continúe leyendo

- [Texto estructurado (ST)](./st.md)
- [Lista de instrucciones (IL)](./il.md)
- [Suite de ejemplos de lenguajes](./examples/v1-5-language-suite.md)
