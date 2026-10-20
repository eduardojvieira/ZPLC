---
slug: /learn/glossary
id: glossary
title: Glosario del curso
sidebar_label: Glosario del curso
description: "Los términos en inglés y en español que usa el curso de Aprender para los conceptos de PLC, y el registro del español de sus lecciones, pistas y etiquetas de planta."
tags: [learn, lessons, glossary, spanish]
---

# Glosario del curso

El curso existe en inglés y en español. Esta página fija la palabra que cada
idioma usa para cada concepto que enseñan las lecciones, de modo que una
lección, sus pistas, las etiquetas de las plantas y los controles de ZPLC que
nombra una lección digan lo mismo.

## El registro del español

El texto en español está en español latinoamericano neutro, como en los
manuales industriales. Se dirige a quien aprende con *usted* o con formas
impersonales ("Pulse Comprobar", "se pulsa Start"), nunca con *tú* ni con *vos*.
Las lecciones en inglés y en español tienen las mismas etapas, las mismas pistas
y los mismos tiempos y valores citados.

Los valores de las señales conservan la notación del programa: `ON`, `OFF`,
`TRUE` y `FALSE` se escriben tal cual, y una frase en español dice "pasa a ON" o
"queda en OFF". Los nombres de variables, de archivos y de bloques, y el código,
quedan en inglés en los dos idiomas, porque son lo que contiene el programa.

## Términos

| Inglés | Español | Nota |
|---|---|---|
| scan cycle | ciclo de escaneo | Una pasada del programa es "un ciclo". |
| rung | peldaño | El editor de diagrama de escalera de ZPLC usa la misma palabra. |
| contact, normally open, normally closed | contacto, normalmente abierto (NA), normalmente cerrado (NC) | |
| coil | bobina | |
| seal-in | autorretención | |
| latch (un bloque SR o RS) | biestable | Mantener un valor memorizado es "retenerlo". |
| interlock | enclavamiento | La pestaña Interlocks de ZPLC es "Enclavamientos". |
| permissive | permisivo | |
| set, reset | set, reset (activar, desactivar) | Las bobinas SET y RESET conservan su nombre. |
| on-delay timer | temporizador con retardo a la conexión (TON) | |
| off-delay timer | temporizador con retardo a la desconexión (TOF) | |
| preset | valor preestablecido | |
| rising edge, falling edge | flanco ascendente, flanco descendente | |
| counter | contador | |
| function block | bloque de función | |
| structured text | texto estructurado (ST) | |
| ladder diagram | diagrama de escalera (LD) | |
| function block diagram | diagrama de bloques de función (FBD) | |
| sequential function chart | diagrama funcional secuencial (SFC) | Una etapa de un SFC es un "paso". |
| instruction list | lista de instrucciones (IL) | |
| fault | falla | |
| trace | traza | |
| sample | muestra | |
| assertion | aserción | |
| scenario | escenario | |
| starter, starting program | proyecto inicial, programa inicial | |
| reference solution | solución de referencia | |
| hint | pista | |
| track (del curso) | ruta | |
| plant | planta | |
| request | solicitud | |
| command | orden | |
| target (device) | dispositivo de destino | |
| holding register | registro de retención | |
| topic (MQTT) | tema | |
| payload | contenido | |
| wiring | cableado | |
| pin map | mapa de pines | |
| bill of materials | lista de materiales | |
| breadboard | protoboard | |
| scheduler | planificador | Los términos del runtime que usan las páginas técnicas. |
| timer (de hardware) | temporizador | |
| lock | cerrojo | |
| batch (de tareas) | lote | |
| snapshot (de la imagen de proceso) | instantánea | |
| program store | almacén de programas | |
| slot | ranura | |
| issue (del repositorio) | incidencia | |

Los controles de ZPLC que nombra una lección se escriben como los muestra
ZPLC en español: **Check** es **Comprobar**, y el panel Tests es **Pruebas**.

## Cómo se mantiene

Una prueba de las lecciones lee el español de cada lección, pista y etiqueta de
Aprender, y falla ante una forma con *tú* o con *vos*, o ante una variante
incorrecta conocida de un término de la tabla, como "ciclo de scan", un "rung" o
un "starter" sin traducir, o "fallo" por una falla. La lista es corta y
explícita: cuando una revisión encuentra una forma incorrecta nueva, se agrega a
la prueba. La prueba es `packages/zplc-ide/src/learn/lessonLanguage.test.ts`.
