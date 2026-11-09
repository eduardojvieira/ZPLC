---
slug: /learn/glossary
id: glossary
title: Course glossary
sidebar_label: Course glossary
description: 'The English and Spanish terms the Learn course uses for PLC concepts, and the Spanish register of its lessons, hints and plant labels.'
tags: [learn, lessons, glossary, spanish]
---

# Course glossary

Use this page when you write or review a lesson, a hint or a plant label, in either language. It fixes the word each language uses for every concept the Learn course teaches, so a lesson, its hints, the plant labels and the ZPLC controls it names all say the same thing.

## The Spanish register

- **Variety.** Neutral Latin American Spanish, as in industrial manuals.
- **Address.** The learner is addressed as _usted_ or with impersonal forms ("Pulse Comprobar", "se pulsa Start"), never with _tú_ or _vos_.
- **Parity.** English and Spanish lessons have the same stages, the same hints and the same quoted times and values.
- **Signals.** `ON`, `OFF`, `TRUE` and `FALSE` are written as the program writes them. A Spanish sentence says "pasa a ON" or "queda en OFF".
- **Code.** Variable names, file names, block names and code stay in English in both languages, because they are what the program contains.

## Terms

| English                                 | Spanish                                                      | Note                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| scan cycle                              | ciclo de escaneo                                             | One pass of the program is "un ciclo".                                                                                          |
| rung                                    | peldaño                                                      | The Ladder editor of ZPLC uses the same word.                                                                                   |
| contact, normally open, normally closed | contacto, normalmente abierto (NA), normalmente cerrado (NC) |                                                                                                                                 |
| coil                                    | bobina                                                       |                                                                                                                                 |
| seal-in                                 | autorretención                                               |                                                                                                                                 |
| latch (an SR or RS block)               | biestable                                                    | To latch a value is "retener" it.                                                                                               |
| interlock                               | enclavamiento                                                | The Interlocks tab of ZPLC is "Enclavamientos".                                                                                 |
| permissive                              | permisivo                                                    |                                                                                                                                 |
| set, reset                              | set, reset (activar, desactivar)                             | The SET and RESET coils keep their names.                                                                                       |
| on-delay timer                          | temporizador con retardo a la conexión (TON)                 |                                                                                                                                 |
| off-delay timer                         | temporizador con retardo a la desconexión (TOF)              |                                                                                                                                 |
| preset                                  | valor preestablecido                                         |                                                                                                                                 |
| rising edge, falling edge               | flanco ascendente, flanco descendente                        |                                                                                                                                 |
| counter                                 | contador                                                     |                                                                                                                                 |
| function block                          | bloque de función                                            |                                                                                                                                 |
| function box                            | caja de función                                              | A function (ADD, MUL, LIMIT...) drawn as a box in a Ladder rung. The generic "function block" row above is a block with memory. |
| EN, ENO                                 | EN, ENO                                                      | The enable input and the enable output of a function box. Both letters stay in English.                                         |
| comparison box                          | caja de comparación                                          | A box such as GT or EQ whose output conducts when the comparison holds.                                                         |
| analog input                            | entrada analógica                                            | A word such as `%IW0`, not a bit.                                                                                               |
| raw counts                              | cuentas, valor crudo                                         | The integer the converter gives, before scaling.                                                                                |
| scaling                                 | escalado                                                     | Turning counts into engineering units (millimetres, percent).                                                                   |
| structured text                         | texto estructurado (ST)                                      |                                                                                                                                 |
| ladder diagram                          | diagrama de escalera (LD)                                    |                                                                                                                                 |
| function block diagram                  | diagrama de bloques de función (FBD)                         |                                                                                                                                 |
| sequential function chart               | diagrama funcional secuencial (SFC)                          | An SFC step is "paso".                                                                                                          |
| instruction list                        | lista de instrucciones (IL)                                  |                                                                                                                                 |
| fault                                   | falla                                                        |                                                                                                                                 |
| trace                                   | traza                                                        |                                                                                                                                 |
| sample                                  | muestra                                                      |                                                                                                                                 |
| assertion                               | aserción                                                     |                                                                                                                                 |
| scenario                                | escenario                                                    |                                                                                                                                 |
| starter, starting program               | proyecto inicial, programa inicial                           |                                                                                                                                 |
| reference solution                      | solución de referencia                                       |                                                                                                                                 |
| hint                                    | pista                                                        |                                                                                                                                 |
| track (of the course)                   | ruta                                                         |                                                                                                                                 |
| plant                                   | planta                                                       |                                                                                                                                 |
| request                                 | solicitud                                                    |                                                                                                                                 |
| command                                 | orden                                                        |                                                                                                                                 |
| target (device)                         | dispositivo de destino                                       |                                                                                                                                 |
| holding register                        | registro de retención                                        |                                                                                                                                 |
| topic (MQTT)                            | tema                                                         |                                                                                                                                 |
| payload                                 | contenido                                                    |                                                                                                                                 |
| wiring                                  | cableado                                                     |                                                                                                                                 |
| pin map                                 | mapa de pines                                                |                                                                                                                                 |
| bill of materials                       | lista de materiales                                          |                                                                                                                                 |
| breadboard                              | protoboard                                                   |                                                                                                                                 |
| scheduler                               | planificador                                                 | The runtime terms the technical pages use.                                                                                      |
| timer (de hardware)                     | temporizador                                                 |                                                                                                                                 |
| lock                                    | cerrojo                                                      |                                                                                                                                 |
| batch (de tareas)                       | lote                                                         |                                                                                                                                 |
| snapshot (de la imagen de proceso)      | instantánea                                                  |                                                                                                                                 |
| program store                           | almacén de programas                                         |                                                                                                                                 |
| slot                                    | ranura                                                       |                                                                                                                                 |
| issue (del repositorio)                 | incidencia                                                   |                                                                                                                                 |

Rows from "function box" to "scaling" are the words the Ladder lessons use; the other rows are older. The ZPLC controls that a lesson names are written as ZPLC shows them: **Check** is **Comprobar**, and the Tests panel is **Pruebas**.

## How the course keeps to it

A test reads the Spanish of every lesson, hint and Learn label and fails on a _tú_ or _vos_ form, or on a known wrong variant of a term in the table: "ciclo de scan", an untranslated "rung" or "starter", or "fallo" for a fault. The list of wrong variants is short and explicit. When a review finds a new one, add it to the test, which is `packages/zplc-ide/src/learn/lessonLanguage.test.ts`. The Spanish documentation pages are held to the same terms by `tools/docs/docs_structure.test.ts`.
