---
slug: /languages
id: index
title: Lenguajes y modelo de programación
sidebar_label: Generalidades
description: Panorama de los flujos de lenguajes IEC 61131-3 en ZPLC.
tags: [languages, iec61131-3]
---

# Lenguajes y modelo de programación

Structured Text (ST) es el frontend central de lenguaje de ZPLC. El repositorio también tiene flujos para LD, FBD, SFC e IL. Su edición, conversión, depuración y cobertura en target varían, por lo que conviene elegir el flujo según su evidencia actual y no suponer cobertura IEC completa ni paridad total.

## Flujos disponibles

| Lenguaje | Ruta actual |
|---|---|
| **Structured Text (ST)** | Frontend textual central del compilador. |
| **Instruction List (IL)** | Se parsea y transpila a ST antes de compilar. |
| **Ladder Diagram (LD)** | Flujo de editor/transpilador visual. |
| **Function Block Diagram (FBD)** | Flujo de editor/transpilador visual. |
| **Sequential Function Chart (SFC)** | Flujo de editor/transpilador visual. |

## Qué puede hacer hoy cada lenguaje

Cada fila nombra la prueba que muestra la capacidad: un recorrido de Studio, una prueba en el runtime nativo o un caso de conformidad, todos ejecutados por la integración continua y ninguno en una placa. Una fila que dice que aún no tiene prueba de extremo a extremo no cuenta con esa prueba todavía; no es una promesa de que la capacidad funcione. Todo lo que solo una placa puede mostrar lo dice así. La pausa, la reanudación, el paso de ciclo y los puntos de interrupción están en las filas de depuración; el perfil de capacidades que informa el runtime decide cuáles habilita Studio.

{/* >>> GENERATED (tools/docs/generate_language_capabilities.ts): language-capabilities. Do not edit. >>> */}

| Lenguaje | Capacidad | Evidencia | Prueba que lo muestra |
| --- | --- | --- | --- |
| Texto Estructurado | Editar | Recorrido de Studio en la simulación nativa | `3 Edit Structured Text, save, reopen` |
| Texto Estructurado | Compilar | Recorrido de Studio en la simulación nativa | `5 Build successfully` |
| Texto Estructurado | Simular | Recorrido de Studio en la simulación nativa | `6 Simulate: connect, run, watch a value change` |
| Texto Estructurado | Depurar (punto de parada, pausa, paso) | Recorrido de Studio en la simulación nativa | `16 Debug details: stop, trace, resume mid-scan` |
| Texto Estructurado | Observar valores en línea | Recorrido de Studio en la simulación nativa | `28e Inline values in Structured Text come from the debug map` |
| Texto Estructurado | Forzar | Recorrido de Studio en la simulación nativa | `8 Force an input and release it` |
| Texto Estructurado | Cargar en una placa | Solo en una placa | Una persona lo carga y lo ejecuta en una placa; la página de evidencia de hardware lista los registros |
| Lista de Instrucciones | Editar | Recorrido de Studio en la simulación nativa | `54 Instruction List is edited, saved and reopened` |
| Lista de Instrucciones | Compilar | Caso de conformidad en el runtime del equipo | `lng-018-il-jump-runs-every-scan` |
| Lista de Instrucciones | Simular | Caso de conformidad en el runtime del equipo | `lng-018-il-jump-runs-every-scan` |
| Lista de Instrucciones | Depurar (punto de parada, pausa, paso) | Recorrido de Studio en la simulación nativa | `28kc A breakpoint on an IL line stops execution` |
| Lista de Instrucciones | Observar valores en línea | Recorrido de Studio en la simulación nativa | `54b Instruction List values are watched and a variable is forced and released` |
| Lista de Instrucciones | Forzar | Recorrido de Studio en la simulación nativa | `54b Instruction List values are watched and a variable is forced and released` |
| Lista de Instrucciones | Cargar en una placa | Solo en una placa | Una persona lo carga y lo ejecuta en una placa; la página de evidencia de hardware lista los registros |
| Diagrama de Escalera | Editar | Recorrido de Studio en la simulación nativa | `28f A rung is built from the keyboard` |
| Diagrama de Escalera | Compilar | Prueba en el runtime nativo | `Blinky visual languages on native POSIX` |
| Diagrama de Escalera | Simular | Prueba en el runtime nativo | `Blinky visual languages on native POSIX` |
| Diagrama de Escalera | Depurar (punto de parada, pausa, paso) | Recorrido de Studio en la simulación nativa | `28 A breakpoint on a rung stops execution` |
| Diagrama de Escalera | Observar valores en línea | Recorrido de Studio en la simulación nativa | `28b Online values of a rung come from the debug map` |
| Diagrama de Escalera | Forzar | Recorrido de Studio en la simulación nativa | `51d A forced variable is shown as forced in the Ladder` |
| Diagrama de Escalera | Cargar en una placa | Solo en una placa | Una persona lo carga y lo ejecuta en una placa; la página de evidencia de hardware lista los registros |
| Diagrama de Bloques de Función | Editar | Recorrido de Studio en la simulación nativa | `28g A function block diagram is edited from the keyboard` |
| Diagrama de Bloques de Función | Compilar | Prueba en el runtime nativo | `Blinky visual languages on native POSIX` |
| Diagrama de Bloques de Función | Simular | Prueba en el runtime nativo | `Blinky visual languages on native POSIX` |
| Diagrama de Bloques de Función | Depurar (punto de parada, pausa, paso) | Recorrido de Studio en la simulación nativa | `28ka A breakpoint on an FBD block stops execution` |
| Diagrama de Bloques de Función | Observar valores en línea | Recorrido de Studio en la simulación nativa | `28c Online values of an FBD come from the debug map` |
| Diagrama de Bloques de Función | Forzar | Recorrido de Studio en la simulación nativa | `51 A forced variable is shown as forced in the function block diagram` |
| Diagrama de Bloques de Función | Cargar en una placa | Solo en una placa | Una persona lo carga y lo ejecuta en una placa; la página de evidencia de hardware lista los registros |
| Diagrama Funcional Secuencial | Editar | Recorrido de Studio en la simulación nativa | `28h A sequential function chart is edited from the keyboard` |
| Diagrama Funcional Secuencial | Compilar | Prueba en el runtime nativo | `Blinky visual languages on native POSIX` |
| Diagrama Funcional Secuencial | Simular | Prueba en el runtime nativo | `Blinky visual languages on native POSIX` |
| Diagrama Funcional Secuencial | Depurar (punto de parada, pausa, paso) | Recorrido de Studio en la simulación nativa | `28kb A breakpoint on an SFC step stops execution` |
| Diagrama Funcional Secuencial | Observar valores en línea | Recorrido de Studio en la simulación nativa | `28d Online state of an SFC comes from the debug map` |
| Diagrama Funcional Secuencial | Forzar | Recorrido de Studio en la simulación nativa | `51b A forced variable is shown as forced in the sequential function chart` |
| Diagrama Funcional Secuencial | Cargar en una placa | Solo en una placa | Una persona lo carga y lo ejecuta en una placa; la página de evidencia de hardware lista los registros |

{/* <<< END GENERATED: language-capabilities <<< */}

## Modelo de compilación

Los flujos de lenguaje soportados convergen en la ruta del compilador que produce bytecode `.zplc`. Ese destino común no promete round trips arbitrarios entre representaciones, funciones de editor idénticas, cobertura completa de la biblioteca estándar ni el mismo rendimiento en cada runtime.

Valide como un único flujo el lenguaje fuente, la representación generada, los diagnósticos y el perfil de destino elegido.

## Depuración y evidencia de runtime

El IDE expone inspección, simulación y depuración según el perfil de capacidades del runtime activo. POSIX nativo es un runtime lógico de host, no evidencia de timing de hardware ni de comportamiento en target. Los puntos de parada de hardware, los forzados, la carga y los controles de ejecución son específicos de capacidades y requieren evidencia separada.

En la simulación nativa de un host Linux, los recorridos del IDE detienen el programa en un punto de parada sobre una línea de Structured Text, una línea de Instruction List, un peldaño de Ladder, un bloque de un diagrama de bloques de función y un paso de un gráfico de funciones secuenciales, y marcan el elemento donde se detuvo. Estas ejecuciones no son evidencia de un punto de parada en una placa: eso requiere una ejecución con hardware en el lazo en esa placa.

## Biblioteca estándar

La biblioteca estándar se implementa mediante rutas de compilador y runtime. Consulte [Biblioteca estándar](./stdlib.md) y compile el flujo de lenguaje elegido para saber qué está disponible hoy.

## Continúe leyendo

- [Structured Text (ST)](./st.md)
- [Instruction List (IL)](./il.md)
- [Suite de ejemplos de lenguajes](./examples/v1-5-language-suite.md)
