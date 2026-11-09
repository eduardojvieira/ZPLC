---
slug: /languages
id: index
title: Lenguajes y modelo de programación
sidebar_label: Generalidades
description: Elija entre los cinco lenguajes IEC 61131-3 de ZPLC y vea qué puede hacer hoy cada uno.
tags: [languages, iec61131-3]
---

# Lenguajes y modelo de programación

ZPLC ofrece cinco lenguajes IEC 61131-3 en un mismo proyecto: texto estructurado, lista de instrucciones, diagrama de escalera, diagrama de bloques de función y diagrama funcional secuencial. Todos se compilan al mismo bytecode `.zplc`, de modo que puede elegir el lenguaje que mejor convenga a cada programa. Esta página ayuda a elegir uno y muestra qué puede hacer hoy cada lenguaje, con la prueba que lo respalda.

## Elegir un lenguaje

| Lenguaje                             | Se escribe en                   | Sirve para                                                                                                               | Guía                                       |
| ------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Texto estructurado (ST)              | Un editor de texto              | Cálculos, manejo de datos, bucles, todo lo que se lee mejor como código. El lenguaje al que se traducen todos los demás. | [Texto estructurado](./st.md)              |
| Lista de instrucciones (IL)          | Un editor de texto              | Lógica IL existente y secuencias de bajo nivel sobre un acumulador.                                                      | [Lista de instrucciones](./il.md)          |
| Diagrama de escalera (LD)            | Un editor de peldaños           | Enclavamientos, lógica al estilo de relés y condiciones que una persona electricista lee de un vistazo.                  | [Diagrama de escalera](./ld.md)            |
| Diagrama de bloques de función (FBD) | Un editor de diagramas          | Flujo de señales entre temporizadores, contadores, comparaciones y aritmética.                                           | [Diagrama de bloques de función](./fbd.md) |
| Diagrama funcional secuencial (SFC)  | Un editor de diagramas de pasos | Máquinas que avanzan por pasos, como una secuencia de arranque, marcha y paro.                                           | [Diagrama funcional secuencial](./sfc.md)  |

El texto estructurado va directamente al compilador. Los otros cuatro se traducen primero a texto estructurado, y ese texto generado es una salida de solo lectura. Los lenguajes no son intercambiables: un editor, un depurador o un bloque de biblioteca puede admitir una construcción en un lenguaje y no en otro, y un programa no se convierte de vuelta de texto estructurado a un diagrama. Las [referencias generadas de los lenguajes](../reference/language-st.md) indican qué funciona en cada uno.

## Qué puede hacer hoy cada lenguaje

Cada fila nombra un recorrido de la aplicación ZPLC que muestra la capacidad de principio a fin, en una ventana real; la integración continua los ejecuta todos, y la tabla se genera a partir de esa lista, no se escribe a mano. Al generar la página se rechaza una capacidad sin recorrido, o con solo una prueba unitaria o un caso de conformidad.

La compilación, la simulación y la carga salen de una sola cadena por lenguaje: se crea un programa en un proyecto nuevo, se edita un ejemplo, se guarda, se reabre y se compila, se simula con una pausa y un solo paso, y se observa. Después se pulsa Cargar y se confirma contra el runtime nativo detrás del shell de una placa emulada, y se observa cómo cambia allí el mismo valor. La placa es emulada y nada se ejecuta en una física: lo que se ejecutó en placas reales está en la [página de evidencia de hardware](../reference/capabilities-evidence.md). El perfil de capacidades que informa el runtime decide cuáles de estas capacidades habilita la aplicación.

{/* >>> GENERATED (tools/docs/generate_language_capabilities.ts): language-capabilities. Do not edit. >>> */}

| Lenguaje | Capacidad | Evidencia | Prueba que lo muestra |
| --- | --- | --- | --- |
| Texto estructurado | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `3 Edit Structured Text, save, reopen` |
| Texto estructurado | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64a Structured Text from a new project to a deployed program that is watched` |
| Texto estructurado | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64a Structured Text from a new project to a deployed program that is watched` |
| Texto estructurado | Depurar (punto de parada) | Recorrido de la aplicación ZPLC en la simulación nativa | `7 Breakpoint stops execution` |
| Texto estructurado | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53e Pause, step one cycle and resume a Structured Text program` |
| Texto estructurado | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28e Inline values in Structured Text come from the debug map` |
| Texto estructurado | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `8 Force an input and release it` |
| Texto estructurado | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64a Structured Text from a new project to a deployed program that is watched` |
| Lista de instrucciones | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `54 Instruction List is edited, saved and reopened` |
| Lista de instrucciones | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64b Instruction List from a new project to a deployed program that is watched` |
| Lista de instrucciones | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64b Instruction List from a new project to a deployed program that is watched` |
| Lista de instrucciones | Depurar (punto de parada) | Recorrido de la aplicación ZPLC en la simulación nativa | `28kc A breakpoint on an IL line stops execution` |
| Lista de instrucciones | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53d Pause, step one cycle and resume an Instruction List program` |
| Lista de instrucciones | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `54b Instruction List values are watched and a variable is forced and released` |
| Lista de instrucciones | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `54b Instruction List values are watched and a variable is forced and released` |
| Lista de instrucciones | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64b Instruction List from a new project to a deployed program that is watched` |
| Diagrama de escalera | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `28f A rung is built from the keyboard` |
| Diagrama de escalera | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Diagrama de escalera | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Diagrama de escalera | Depurar (punto de parada) | Recorrido de la aplicación ZPLC en la simulación nativa | `28 A breakpoint on a rung stops execution` |
| Diagrama de escalera | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53a Pause, step one cycle and resume a Ladder program` |
| Diagrama de escalera | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28b Online values of a rung come from the debug map` |
| Diagrama de escalera | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `51d A forced variable is shown as forced in the Ladder` |
| Diagrama de escalera | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64c Ladder Diagram from a new project to a deployed program that is watched` |
| Diagrama de bloques de función | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `28g A function block diagram is edited from the keyboard` |
| Diagrama de bloques de función | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Diagrama de bloques de función | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Diagrama de bloques de función | Depurar (punto de parada) | Recorrido de la aplicación ZPLC en la simulación nativa | `28ka A breakpoint on an FBD block stops execution` |
| Diagrama de bloques de función | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53b Pause, step one cycle and resume a function block diagram` |
| Diagrama de bloques de función | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28c Online values of an FBD come from the debug map` |
| Diagrama de bloques de función | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `51 A forced variable is shown as forced in the function block diagram` |
| Diagrama de bloques de función | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64d Function Block Diagram from a new project to a deployed program that is watched` |
| Diagrama funcional secuencial | Editar | Recorrido de la aplicación ZPLC en la simulación nativa | `28h A sequential function chart is edited from the keyboard` |
| Diagrama funcional secuencial | Compilar | Recorrido de la aplicación ZPLC en la simulación nativa | `64e Sequential Function Chart from a new project to a deployed program that is watched` |
| Diagrama funcional secuencial | Simular | Recorrido de la aplicación ZPLC en la simulación nativa | `64e Sequential Function Chart from a new project to a deployed program that is watched` |
| Diagrama funcional secuencial | Depurar (punto de parada) | Recorrido de la aplicación ZPLC en la simulación nativa | `28kb A breakpoint on an SFC step stops execution` |
| Diagrama funcional secuencial | Pausar, avanzar un ciclo, reanudar | Recorrido de la aplicación ZPLC en la simulación nativa | `53c Pause, step one cycle and resume a sequential function chart` |
| Diagrama funcional secuencial | Observar valores en línea | Recorrido de la aplicación ZPLC en la simulación nativa | `28d Online state of an SFC comes from the debug map` |
| Diagrama funcional secuencial | Forzar | Recorrido de la aplicación ZPLC en la simulación nativa | `51b A forced variable is shown as forced in the sequential function chart` |
| Diagrama funcional secuencial | Cargar (pulsar Cargar y confirmar) | Recorrido de la aplicación ZPLC: Cargar pulsado contra una placa emulada | `64e Sequential Function Chart from a new project to a deployed program that is watched` |

{/* <<< END GENERATED: language-capabilities <<< */}

## Un solo modelo de compilación

Todos los lenguajes convergen en la ruta del compilador que produce bytecode `.zplc`. Ese destino común no promete conversiones de ida y vuelta entre representaciones, funciones de editor idénticas, cobertura completa de la biblioteca estándar ni un rendimiento idéntico en cada runtime. Valide el código fuente, la representación generada, los diagnósticos y el perfil del destino como un solo flujo ([Flujo del compilador](../ide/compiler.md)).

## Depuración y evidencia

La aplicación ofrece inspección, simulación y depuración según el perfil de capacidades que informa el runtime. En la simulación nativa sobre un host Linux, los recorridos detienen el programa en un punto de parada en una línea de texto estructurado, una línea de lista de instrucciones, un peldaño de escalera, un bloque de diagrama de bloques de función y un paso de diagrama funcional secuencial, y marcan el elemento donde se detuvo. Las mismas ejecuciones pulsan Pausa, Avanzar un ciclo y Reanudar en cada lenguaje y leen el contador de ciclos: se mantiene mientras está en pausa, avanza exactamente uno con cada paso y vuelve a correr después de Reanudar.

La simulación nativa es un runtime lógico del lado del host. No prueba el tiempo de hardware ni el comportamiento del destino, y un punto de parada en una placa necesita una ejecución con hardware en el lazo en esa placa.

## Leer a continuación

- [Texto estructurado](./st.md), el lenguaje que conviene aprender primero;
- [Biblioteca estándar](../runtime/stdlib.md), las funciones y bloques de función que puede llamar cualquier lenguaje;
- [Editores de texto y visuales](../ide/editors.md), para las funciones de edición de cada lenguaje.
