---
slug: /ide/tests
id: tests
title: Pruebas y resultados de las pruebas
sidebar_label: Pruebas y resultados
description: La actividad Pruebas, la pestaña Resultados de las pruebas, la cobertura de enclavamientos, la repetición y los comandos de pruebas de ZPLC.
tags: [ide, user-guide, testing]
---

# Pruebas y resultados de las pruebas

Una prueba de un proyecto de ZPLC es un archivo de escenario en la carpeta `tests` del proyecto: entradas escritas a lo largo del tiempo simulado y las salidas que el programa debe mostrar. Esta página explica dónde se listan las pruebas, cómo se ejecutan y cómo se lee un resultado. Cómo escribir un escenario está en [Escribir y ejecutar pruebas de escenario](../guides/scenario-tests.md), y cada campo del archivo está en el [formato del archivo de escenario](../reference/scenario-file.md).

## La actividad Pruebas

Elija **Pruebas** en la barra de actividades. La barra lateral principal lista las pruebas del proyecto, una fila por archivo de escenario, con las expectativas de cada una y su último resultado: **Sin ejecutar**, **Pasó**, **Falló** o **Anterior a las fuentes**. Un resultado pasa a ser anterior a las fuentes en cuanto cambia un programa; sigue en la lista, marcado, hasta que la prueba se ejecuta de nuevo. Un archivo que no es un escenario válido aparece con "Este archivo no es una prueba válida." Al elegir la actividad Pruebas también se muestra la pestaña **Resultados de las pruebas** del panel de resultados.

| Acción                        | Qué hace                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Ejecutar** en una fila      | Ejecuta esa prueba sola y deja como estaba el resultado de las demás.                                      |
| **Ejecutar todas**            | Ejecuta todas las pruebas del proyecto.                                                                    |
| **Ejecutar las que fallaron** | Vuelve a ejecutar las pruebas cuyo último resultado falló. Si no hay ninguna, lo indica y no ejecuta nada. |
| **Nueva prueba**              | Escribe una primera prueba para el primer programa del proyecto y la abre (vea [Nueva prueba](#new-test)). |
| **Cancelar**                  | Detiene una ejecución en curso, con su simulación.                                                         |

Nada pregunta qué `zplc.json` usar: la ejecución toma el proyecto abierto. Un documento modificado no impide la ejecución. La preferencia **Antes de ejecutar y compilar** decide qué ocurre con él: **Guardar el proyecto primero** lo guarda, y **Preguntar antes de guardar** pregunta. Ejecutar pruebas requiere la aplicación de escritorio.

El teclado alcanza todas las acciones: Tab recorre los botones, y Enter o la barra espaciadora pulsa el que tiene el foco.

### Enclavamientos

Una segunda vista de la actividad Pruebas, **Enclavamientos** (**Mostrar los enclavamientos** en la paleta de comandos), comprueba los enclavamientos que el proyecto declara en `safety.incompatibleOutputs` de `zplc.json`. **Comprobar los enclavamientos** lista cada par de salidas como **Cubierto** o **Falta la cobertura exacta de NEVER**, y la respuesta aparece en la pestaña Resultados de las pruebas bajo su propio título, **Cobertura de enclavamientos**. **Ejecutar todas** no inicia esta comprobación. Comprueba los escenarios, no la máquina.

### Nueva prueba {#new-test}

**Nueva prueba** escribe `tests/<Program>.scenario.json`, con el nombre del programa, para el primer programa del proyecto: crea la carpeta `tests` si falta, agrega un número cuando el nombre ya está en uso y nunca escribe sobre un archivo. La prueba comprueba que la primera salida `BOOL` del programa empieza apagada, así que pasa hasta que usted la cambie. Rechaza un proyecto sin programa, un programa sin salida `BOOL` y un programa que no compila, y en cada caso indica qué hacer.

## La pestaña Resultados de las pruebas

La pestaña se abre en la última ejecución, en este orden:

1. **El veredicto, en una oración**: "3 de 3 pruebas pasaron", o "1 de 3 pruebas pasaron" cuando dos fallaron.
2. **Pruebas que fallaron.** Para cada expectativa que falló: qué exige (por ejemplo "Las señales deben cumplirse en un instante"), su tiempo y, para cada señal, el valor esperado y el valor observado, como en `BeltCommand: se esperaba verdadero, se observó falso`. La siguen dos enlaces: **Paso de la prueba** abre el archivo de escenario en esa expectativa, y **Ese instante en la traza** abre Detalles con esa muestra marcada.
3. **Pruebas que pasaron**, plegadas bajo **Pruebas que pasaron (N)**.
4. **Detalles**, cerrado: el registro completo de la ejecución, con las muestras de la traza registrada, los hash del programa y de la traza (los primeros 8 dígitos, con **Copiar el hash** para el valor completo) y la compilación que usó la ejecución.

El veredicto lleva una insignia que indica el límite del resultado: **Resultado en simulación**. Su descripción emergente dice que un resultado en simulación no es evidencia de una lámpara física, de tiempos del hardware, de HIL ni de certificación. La pestaña lo indica allí y en ningún otro lugar.

Un resultado anterior a las fuentes conserva su lugar, bajo el aviso "Este resultado es anterior a las fuentes." y un botón **Ejecutar de nuevo**. Un resultado que registró una planta ofrece **Repetición**, que abre el documento de la planta sobre la grabación. El botón **Ejecutar escenarios en el host** de la pestaña vuelve a ejecutar todas las pruebas del proyecto, como **Ejecutar todas**.

Cuando una ejecución no puede empezar, la pestaña y la notificación dicen por qué y qué hacer, por ejemplo "Las pruebas no se ejecutaron porque no se pudo guardar src/main.st". El veredicto lista primero las pruebas que fallaron y como mucho ocho: con ocho fallas o más dice "Al menos 8 de N pruebas fallaron".

## Los comandos de pruebas

Cada acción anterior es un comando de la paleta, y las que se usan a menudo tienen un atajo. Ninguna actúa sobre una placa: una prueba siempre se ejecuta en la simulación de esta computadora.

| Comando                                   | Atajo                      | Qué hace                                                                                                  |
| ----------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Mostrar las pruebas**                   | ninguno                    | Muestra la actividad Pruebas.                                                                             |
| **Mostrar los resultados de las pruebas** | ninguno                    | Muestra la pestaña Resultados de las pruebas.                                                             |
| **Ejecutar todas las pruebas**            | `Ctrl+Alt+T` (`Cmd+Alt+T`) | Ejecuta todas las pruebas.                                                                                |
| **Ejecutar las pruebas que fallaron**     | ninguno                    | Ejecuta las pruebas cuyo último resultado falló.                                                          |
| **Ejecutar la prueba seleccionada**       | ninguno                    | Ejecuta el archivo de escenario del documento activo o, si no, la prueba elegida en la actividad Pruebas. |
| **Nueva prueba**                          | ninguno                    | Escribe una primera prueba para el primer programa.                                                       |
| **Comprobar los enclavamientos**          | ninguno                    | Ejecuta la comprobación de cobertura de enclavamientos.                                                   |

Un escenario se ejecuta completo, así que **Ejecutar la prueba seleccionada** nunca ejecuta una sola expectativa. Sin un archivo de escenario abierto y sin una prueba elegida, dice "No hay una prueba que ejecutar aquí" y no ejecuta nada.

## El mismo resultado en todas partes

La actividad Pruebas, `zplc-cli test`, `zplc-cli scenario-run` y las herramientas MCP `tests_run` y `scenario_run` llaman a la misma Tool API sobre el mismo runtime con el mismo reloj virtual, así que una prueba pasa o falla de la misma manera desde cada una. Una expectativa que falló también lleva los valores esperado y observado en el resultado que imprimen la línea de comandos y el servidor MCP. Vea [Un resultado desde la aplicación, la CLI y las herramientas MCP](./features.md#un-resultado-desde-la-aplicación-la-cli-y-las-herramientas-mcp).

## Qué está verificado

Nivel de evidencia: simulación en esta computadora. `packages/zplc-ide/src/shell/TestsView.dom.test.tsx`, `packages/zplc-ide/src/components/TestResultsTab.dom.test.tsx`, `packages/zplc-ide/src/components/TestVerdict.dom.test.tsx`, `packages/zplc-ide/src/components/BoundaryBadge.dom.test.tsx` y `packages/zplc-ide/src/projectTests/newTest.test.ts` cubren la lista, el veredicto, la insignia y Nueva prueba. Recorridos de `bun run test:journeys` ejecutan una prueba y todas en la aplicación real, rompen el programa y siguen una expectativa que falló hasta su paso del escenario y su instante en la traza. Ninguna prueba se ejecuta en una placa, y la ventana se midió solo en Linux.
