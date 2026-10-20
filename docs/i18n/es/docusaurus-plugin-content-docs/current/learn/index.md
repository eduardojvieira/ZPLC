---
slug: /learn
id: index
title: Aprender
sidebar_label: Aprender
description: "Dónde practicar programación de PLC con ZPLC hoy: las lecciones de Studio, los proyectos de ejemplo incluidos y las pruebas de escenario."
tags: [learn, lessons, examples]
---

# Aprender

Esta sección es para quien quiere practicar. No necesita ninguna placa: todos los
ejercicios se ejecutan en el simulador de su equipo y ninguno inicia una
operación física.

## Empiece con las lecciones de Studio

Studio tiene 29 lecciones en un curso, en español y en inglés. El [esquema del curso](course-outline.md) enumera cada módulo, las lecciones que existen y las que están planeadas. En la pantalla de
bienvenida, elija **Aprender**: se abre el inicio de Aprender, sin proyecto y sin red, y
enumera los módulos en orden con su nivel, lo que requiere cada uno y cuánto
dura. Elija **Comenzar el curso**: Studio crea el espacio de trabajo de la primera lección en su propia carpeta y lo abre; no hay carpeta que elegir ni paso de copia. La lección sigue visible junto al editor, también cuando usted cambia a la vista Proyecto.

Cada lección recorre seis etapas: Objetivo, Prediga, Edite, Ejecute, Observe y
Reflexione. Usted edita el espacio de trabajo, lo guarda y pulsa **Comprobar**. Studio
ejecuta el programa guardado con el escenario de la lección y enumera cada
aserción que falló, con el instante, el valor esperado y el valor observado. Una
lección está completa cuando pasan todas las aserciones de su escenario.

Cada lección ofrece dos niveles de pista, y Studio registra cada nivel que usted abre. La solución de referencia se abre solo si usted la pide, y el progreso registra que la vio. Un docente puede ocultar las soluciones: vea [Docentes](./educators.md). El [glosario del curso](glossary.md) reúne los términos que usa el curso en español y en inglés.

Una lección está bloqueada hasta que se aprueban las lecciones que requiere, y el
inicio dice cuáles. Si prefiere tomarlas en cualquier orden, active
**Desbloquear todas las lecciones** en el inicio. La
descripción completa de lo que hace Aprender y de lo que guarda está en
[Banco de trabajo de Studio](../ide/features.md#learn).

## Su primer parpadeo, sin hardware

La primera lección termina con una salida que parpadea en simulación, en menos de
diez minutos desde el primer inicio. Cuando **Comenzar el curso** la haya abierto,
elija **Compilación** y luego **Compilar** en la barra de herramientas, después
**Conectar** y **Ejecutar**: el programa se ejecuta en el simulador de su equipo.
**Ejecutar** permanece desactivado hasta que el programa se compila. Abra la
pestaña **Observación**: el [panel **E/S en vivo**](./faceplate.md) enumera las salidas del programa, y la
lámpara de la lección se enciende y se apaga.

Toda lección de nivel Fundamentos o Intermedio se puede completar de esta manera,
sin placa; el índice de lecciones rechaza una que no se pueda. Un recorrido del
entorno de desarrollo (el recorrido 57) sigue exactamente estos controles visibles
desde un perfil nuevo y ve cambiar la salida. Todavía no se mide cuánto tarda una
persona: eso requiere una prueba cronometrada con usuarios que lo usan por
primera vez.

## Sin conexión

La pista de simulación no necesita red. Eso incluye el módulo 10: sus bloques de
Modbus y MQTT se comunican con un servidor y un broker que la simulación inicia en
su equipo y detiene con ella. La ventana no carga ninguna fuente, script ni hoja de
estilos de otro equipo, y la única solicitud que Studio puede hacer por su cuenta,
la búsqueda de una versión más nueva, está desactivada hasta que usted la active en
las preferencias.

La evidencia es un recorrido del entorno de desarrollo en Linux (el recorrido 58),
que inicia, ejecuta y comprueba la primera lección y una lección de Comunicaciones
mientras se rechaza toda solicitud a otro equipo, y una prueba de la compilación de
producción que no encuentra en ella ninguna carga remota. No se ejecutó un paquete
instalado sin red.

## Abra un proyecto de ejemplo

Studio incluye proyectos de ejemplo en la pantalla de bienvenida, agrupados por tema (primeros pasos, motores, control de procesos, los cinco lenguajes y placas) y por nivel, y cada uno muestra su lenguaje y, si es de hardware, su placa. Un ejemplo de hardware trae un escenario o dice por qué no lo tiene. Están en `packages/zplc-ide/projects/`. Para copiar uno a una carpeta
propia, elíjalo en **Ejemplos**.

El tutorial [Blink sin hardware](../tutorials/blink-without-hardware.md) recorre
uno de ellos.

## Practique con pruebas de escenario

Un escenario es un guion corto que fija entradas, deja correr el programa durante
un tiempo definido y verifica las salidas. Escribir uno es la mejor manera de
descubrir lo que su programa hace realmente. [Escribir y ejecutar pruebas de escenario](../guides/scenario-tests.md)
muestra cómo, el [formato del archivo de escenario](../reference/scenario-file.md)
enumera cada campo, y la [línea de comandos](../reference/cli.md) los ejecuta sin
Studio.

## Lea los ejemplos de lenguajes

Los [ejemplos de lenguajes de compatibilidad](../languages/examples/v1-5-language-suite.md)
reúnen los mismos programas pequeños en los cinco lenguajes de IEC 61131-3, y la
[referencia de texto estructurado](../reference/language-st.md) dice, elemento por
elemento, qué funciona hoy.

## Lo que todavía falta

Cada lección enumera las rutas que admite y, para una ruta que no admite, dice por qué y qué hacer en su lugar. La [ruta de hardware](hardware-track.md) explica cómo elegir su placa y cómo se comprueba una ejecución en ella, y cada lección de hardware tiene una página de cableado por placa. En Studio, una lección de hardware muestra el cableado para su placa y una comprobación en la placa que usted inicia; todavía no se registró ninguna ejecución en una placa física. El [esquema del curso](course-outline.md) indica las rutas de cada lección. Las
lecciones y los ejemplos son ejercicios de host y de simulación: no muestran cómo
se comporta un programa en una placa física.
