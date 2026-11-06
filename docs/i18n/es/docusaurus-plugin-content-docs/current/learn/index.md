---
slug: /learn
id: index
title: Aprender
sidebar_label: Aprender
description: 'El curso de ZPLC: 68 lecciones en 12 módulos, una ruta de escalera para quien nunca programó un PLC, páginas de lectura con un laboratorio para probar, solo simulación y una ruta de hardware opcional.'
tags: [learn, lessons, examples]
---

# Aprender

Aprender es un curso de programación de PLC que se ejecuta dentro de la aplicación ZPLC, en español y en inglés. No necesita ninguna placa, ninguna red ni conocimientos previos: todas las lecciones se ejecutan en el simulador de su equipo y ninguna inicia una operación física. Si tiene una placa de aprendizaje compatible, una [ruta de hardware](./hardware-track.md) opcional repite la mayoría de las lecciones en ella.

## Qué es el curso

| | |
| --- | --- |
| Lecciones | 68, en 12 módulos (del 0 al 11), unas 26 horas en total |
| Niveles | Base 27, intermedias 29 y avanzadas 12 |
| Lenguajes | Texto estructurado, diagrama de escalera, diagrama de bloques de función, diagrama funcional secuencial y lista de instrucciones, cada uno presentado por una lección |
| Rutas | Simulación, que ofrecen 67 de ellas, y Hardware, que ofrecen 34 de ellas |
| Práctica | Cada lección tiene seis etapas, dos niveles de pista, una solución de referencia a petición y un escenario que califica su programa |

El [esquema del curso](./course-outline.md) enumera cada módulo y cada lección con sus lenguajes, rutas y duración. Los [módulos del curso](./modules/index.md) y las [plantas de las lecciones](./plants.md) describen las máquinas simuladas.

## Empiece desde cero: la ruta de escalera

Si nunca programó un PLC, tome la ruta de escalera, *Diagrama de escalera desde cero*. Se compone de 21 de las lecciones, desde qué es un PLC hasta el programa probado de una máquina, y termina con un proyecto final y una mirada a los otros cuatro lenguajes. El diagrama de escalera se lee como los circuitos de relés que reemplazó, y por eso la mayoría de las personas empieza con él.

Cada lección de la ruta abre con una **página de lectura**. La página cubre el área principal del espacio de trabajo, y los paneles laterales e inferiores siguen visibles a su alrededor. Explica una idea con palabras sencillas, muestra figuras de escalera y diagramas de tiempos, y tiene preguntas **Compruebe lo aprendido** que no se califican ni se guardan. Donde una idea se ve mejor que se lee, la página tiene un **laboratorio para probar**: un programa de escalera pequeño que corre en vivo junto a su diagrama. Mantenga pulsado un botón o cambie un interruptor, pulse **Ejecutar** y observe las lámparas y el peldaño. **Pausar** y **Reiniciar** le permiten empezar de nuevo. El laboratorio corre en su propia simulación dentro de la página y nunca toca su proyecto.

Cuando esté listo, elija **Practicar**: la página se cierra y el panel de la lección se abre junto al editor. **Volver a leer** devuelve la página. La ruta también está en el inicio de Aprender, con cuántas de sus lecciones ha aprobado y un botón para continuar donde se quedó.

## Tome el curso

1. En la pantalla de bienvenida elija **Aprender**. Se abre el inicio de Aprender, sin proyecto y sin red, y enumera los módulos en orden con su nivel, lo que requiere cada uno y cuánto dura.
2. Elija **Comenzar el curso**. ZPLC crea el espacio de trabajo de la primera lección en su propia carpeta y lo abre. No hay carpeta que elegir ni paso de copia, y la lección sigue visible junto al editor, también cuando pasa a la vista de Proyecto.
3. Recorra las seis etapas de la lección: Objetivo, Prediga, Edite, Ejecute, Observe y Reflexione. Edite el espacio de trabajo, guárdelo y pulse **Comprobar**. ZPLC ejecuta su programa guardado con el escenario de la lección y enumera cada aserción que falló, con el tiempo, el valor esperado y el valor que vio. La lección está completa cuando todas las aserciones pasaron.

Cada lección ofrece dos niveles de pista, y ZPLC registra cada nivel que usted abre. La solución de referencia solo se abre a petición, y su progreso registra que la vio. Un docente puede ocultar las soluciones: véase [Docentes](./educators.md). Una lección permanece bloqueada hasta aprobar las que requiere; para tomarlas en cualquier orden, active **Desbloquear todas las lecciones** en el inicio. La descripción completa de lo que Aprender hace y conserva está en [Banco de trabajo de ZPLC](../ide/features.md#learn), y el [glosario del curso](./glossary.md) fija los términos en inglés y en español.

## Su primer parpadeo, sin hardware

La primera lección termina en una salida que parpadea en simulación. Cuando **Comenzar el curso** la haya abierto, elija **Compilación** y luego **Compilar** en la barra de herramientas, después **Conectar** y **Ejecutar**. **Ejecutar** permanece desactivado hasta que el programa está compilado. Abra la pestaña **Observación**: el [panel **E/S en vivo**](./faceplate.md) enumera las salidas del programa, y la lámpara de la lección se enciende y se apaga.

Todas las lecciones menos una se pueden completar así, sin placa: el índice de lecciones rechaza una lección de base o intermedia que no pueda. La excepción, *Verificar mi placa*, existe para comprobar una placa. Nivel de evidencia: host. Una ejecución guionada de la aplicación en el host de desarrollo (el recorrido 57 de `packages/zplc-ide/scripts/journeys.ts`) sigue exactamente estos controles visibles desde un perfil nuevo y ve cambiar la salida. No se mide cuánto tarda una persona: eso requiere una prueba cronometrada con personas que lo usan por primera vez.

## Sin conexión

La ruta de simulación no necesita red, y eso incluye el módulo 10: sus bloques Modbus y MQTT hablan con un servidor y un broker que la simulación inicia en su equipo y detiene con ella. La ventana no carga ninguna fuente, script ni hoja de estilo de otro host, y la única solicitud que ZPLC puede hacer por su cuenta, la comprobación de una versión más nueva, está desactivada hasta que usted la active en las preferencias.

Nivel de evidencia: host. Una ejecución guionada de la aplicación en el host de desarrollo en Linux (el recorrido 58 del mismo archivo) inicia, ejecuta y comprueba la primera lección y una lección de Comunicaciones mientras se rechaza toda solicitud a otro host, y una prueba de la compilación de producción no encuentra en ella ninguna carga remota. No se ejecutó un paquete instalado sin red.

## Más allá de las lecciones

- **Proyectos de ejemplo.** La pantalla de bienvenida incluye 81 ejemplos, agrupados por tema (primeros pasos, motores, control de procesos, los cinco lenguajes y placas) y por nivel, cada uno con su lenguaje y, si es de hardware, su placa. Un ejemplo de hardware trae un escenario o dice por qué no lo tiene. Están en `packages/zplc-ide/projects/`. Elija uno en **Ejemplos** para copiarlo a una carpeta propia, o siga [Blink sin hardware](../tutorials/blink-without-hardware.md).
- **Pruebas de escenario.** Un escenario es un guion corto que fija entradas, deja correr el programa un tiempo fijo y comprueba las salidas. [Escribir y ejecutar pruebas de escenario](../guides/scenario-tests.md) explica cómo, el [formato del archivo de escenario](../reference/scenario-file.md) enumera cada campo y la [línea de comandos](../reference/cli.md) las ejecuta sin la aplicación ZPLC.
- **Referencia de lenguajes.** La [referencia de texto estructurado](../reference/language-st.md) dice, elemento por elemento, qué funciona hoy, y las [guías de lenguaje](../languages/index.md) cubren los cinco lenguajes de IEC 61131-3.

## Lo que el curso no muestra

Las lecciones y los ejemplos son ejercicios de host y de simulación: no muestran cómo se comporta un programa en una placa física. Cada lección enumera las rutas que admite y, para una ruta que no admite, dice por qué y qué hacer en su lugar. En la ruta de hardware, una lección muestra el cableado de su placa y una comprobación en la placa que usted inicia; todavía no se ha registrado ninguna ejecución en una placa física. Véase la [ruta de hardware](./hardware-track.md) para saber cómo se elige una placa y cómo se comprueba una ejecución en ella.
