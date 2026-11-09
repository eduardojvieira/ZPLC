---
slug: /learn/glossary
id: glossary
title: Glosario del curso
sidebar_label: Glosario del curso
description: 'Los términos en inglés y en español que usa el curso de Aprender para los conceptos de PLC, y el registro del español de sus lecciones, pistas y etiquetas de planta.'
tags: [learn, lessons, glossary, spanish]
---

# Glosario del curso

Use esta página al escribir o revisar una lección, una pista o una etiqueta de planta, en cualquiera de los dos idiomas. Fija la palabra que cada idioma usa para cada concepto que enseña el curso de Aprender, de modo que una lección, sus pistas, las etiquetas de las plantas y los controles de ZPLC que nombra digan lo mismo.

## El registro del español

- **Variedad.** Español latinoamericano neutro, como en los manuales industriales.
- **Trato.** A quien aprende se le trata de _usted_ o con formas impersonales ("Pulse Comprobar", "se pulsa Start"), nunca de _tú_ ni de _vos_.
- **Paridad.** Las lecciones en inglés y en español tienen las mismas etapas, las mismas pistas y los mismos tiempos y valores citados.
- **Señales.** `ON`, `OFF`, `TRUE` y `FALSE` se escriben como los escribe el programa. Una frase en español dice "pasa a ON" o "queda en OFF".
- **Código.** Los nombres de variables, de archivos y de bloques, y el código, quedan en inglés en los dos idiomas, porque son lo que contiene el programa.

## Términos

| Inglés                                  | Español                                                      | Nota                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| scan cycle                              | ciclo de escaneo                                             | Una pasada del programa es "un ciclo".                                                                                             |
| rung                                    | peldaño                                                      | El editor de diagrama de escalera de ZPLC usa la misma palabra.                                                                    |
| contact, normally open, normally closed | contacto, normalmente abierto (NA), normalmente cerrado (NC) |                                                                                                                                    |
| coil                                    | bobina                                                       |                                                                                                                                    |
| seal-in                                 | autorretención                                               |                                                                                                                                    |
| latch (un bloque SR o RS)               | biestable                                                    | Mantener un valor memorizado es "retenerlo".                                                                                       |
| interlock                               | enclavamiento                                                | La pestaña Interlocks de ZPLC es "Enclavamientos".                                                                                 |
| permissive                              | permisivo                                                    |                                                                                                                                    |
| set, reset                              | set, reset (activar, desactivar)                             | Las bobinas SET y RESET conservan su nombre.                                                                                       |
| on-delay timer                          | temporizador con retardo a la conexión (TON)                 |                                                                                                                                    |
| off-delay timer                         | temporizador con retardo a la desconexión (TOF)              |                                                                                                                                    |
| preset                                  | valor preestablecido                                         |                                                                                                                                    |
| rising edge, falling edge               | flanco ascendente, flanco descendente                        |                                                                                                                                    |
| counter                                 | contador                                                     |                                                                                                                                    |
| function block                          | bloque de función                                            |                                                                                                                                    |
| function box                            | caja de función                                              | Una función (ADD, MUL, LIMIT...) dibujada como caja en un peldaño. La fila "bloque de función" de arriba es un bloque con memoria. |
| EN, ENO                                 | EN, ENO                                                      | La entrada y la salida de habilitación de una caja de función. Las dos siglas quedan en inglés.                                    |
| comparison box                          | caja de comparación                                          | Una caja como GT o EQ cuya salida conduce cuando se cumple la comparación.                                                         |
| analog input                            | entrada analógica                                            | Una palabra como `%IW0`, no un bit.                                                                                                |
| raw counts                              | cuentas, valor crudo                                         | El entero que entrega el conversor, antes del escalado.                                                                            |
| scaling                                 | escalado                                                     | Convertir cuentas en unidades de ingeniería (milímetros, porcentaje).                                                              |
| structured text                         | texto estructurado (ST)                                      |                                                                                                                                    |
| ladder diagram                          | diagrama de escalera (LD)                                    |                                                                                                                                    |
| function block diagram                  | diagrama de bloques de función (FBD)                         |                                                                                                                                    |
| sequential function chart               | diagrama funcional secuencial (SFC)                          | Un step de un SFC es un "paso".                                                                                                    |
| instruction list                        | lista de instrucciones (IL)                                  |                                                                                                                                    |
| fault                                   | falla                                                        |                                                                                                                                    |
| trace                                   | traza                                                        |                                                                                                                                    |
| sample                                  | muestra                                                      |                                                                                                                                    |
| assertion                               | aserción                                                     |                                                                                                                                    |
| scenario                                | escenario                                                    |                                                                                                                                    |
| starter, starting program               | proyecto inicial, programa inicial                           |                                                                                                                                    |
| reference solution                      | solución de referencia                                       |                                                                                                                                    |
| hint                                    | pista                                                        |                                                                                                                                    |
| track (del curso)                       | ruta                                                         |                                                                                                                                    |
| plant                                   | planta                                                       |                                                                                                                                    |
| request                                 | solicitud                                                    |                                                                                                                                    |
| command                                 | orden                                                        |                                                                                                                                    |
| target (device)                         | dispositivo de destino                                       |                                                                                                                                    |
| holding register                        | registro de retención                                        |                                                                                                                                    |
| topic (MQTT)                            | tema                                                         |                                                                                                                                    |
| payload                                 | contenido                                                    |                                                                                                                                    |
| wiring                                  | cableado                                                     |                                                                                                                                    |
| pin map                                 | mapa de pines                                                |                                                                                                                                    |
| bill of materials                       | lista de materiales                                          |                                                                                                                                    |
| breadboard                              | protoboard                                                   |                                                                                                                                    |
| scheduler                               | planificador                                                 | Los términos del runtime que usan las páginas técnicas.                                                                            |
| timer (de hardware)                     | temporizador                                                 |                                                                                                                                    |
| lock                                    | cerrojo                                                      |                                                                                                                                    |
| batch (de tareas)                       | lote                                                         |                                                                                                                                    |
| snapshot (de la imagen de proceso)      | instantánea                                                  |                                                                                                                                    |
| program store                           | almacén de programas                                         |                                                                                                                                    |
| slot                                    | ranura                                                       |                                                                                                                                    |
| issue (del repositorio)                 | incidencia                                                   |                                                                                                                                    |

Las filas de "function box" a "scaling" son las palabras que usan las lecciones de escalera; las demás son anteriores. Los controles de ZPLC que nombra una lección se escriben como ZPLC los muestra: **Check** es **Comprobar** y el panel Tests es **Pruebas**.

## Cómo lo hace cumplir el curso

Una prueba lee el español de cada lección, pista y etiqueta de Aprender y falla ante una forma de _tú_ o de _vos_, o ante una variante incorrecta conocida de un término de la tabla: "ciclo de scan", un "rung" o un "starter" sin traducir, o "fallo" para una falla. La lista de variantes incorrectas es corta y explícita. Cuando una revisión encuentre una nueva, se agrega a la prueba, que es `packages/zplc-ide/src/learn/lessonLanguage.test.ts`. Las páginas de la documentación en español se someten a los mismos términos con `tools/docs/docs_structure.test.ts`.
