---
description: Cree un diagrama funcional secuencial en el editor de ZPLC con pasos, transiciones y acciones con calificador, y evite los errores más comunes.
tags: [languages, sfc]
---

# Escribir un diagrama funcional secuencial

Esta guía muestra cómo crear un diagrama funcional secuencial (SFC) en el editor de ZPLC: cómo se combinan pasos, transiciones y acciones, qué hace cada calificador de acción, cómo recorre el diagrama un ciclo y qué diagramas rechaza la compilación. La lista completa de elementos, con la prueba de cada uno, está en la [referencia generada del diagrama funcional secuencial](../reference/language-sfc.md).

Un archivo SFC es un modelo de pasos, transiciones y acciones, no texto. La compilación lo valida y lo traduce a texto estructurado, que es una salida de solo lectura; después el compilador lo trata como cualquier otro programa ([Flujo del compilador](../ide/compiler.md)).

## Armar un diagrama

1. Abra un archivo SFC del proyecto, o cree uno con **Nuevo archivo**. Un diagrama nuevo empieza con un paso inicial llamado `Init`.
2. Inserte una transición después del paso seleccionado y luego un paso después de esa transición. Pulse un elemento de la paleta (Paso, Paso inicial, Transición), arrástrelo al lienzo o use las teclas: `T` inserta una transición debajo del paso seleccionado y `S` un paso debajo de la transición seleccionada, cada uno conectado al que lo precede.
3. Pulse `F2`, o haga doble clic, para nombrar un paso y escribir la condición de una transición.
4. Defina las acciones que ejecuta el diagrama. Una acción tiene un nombre y un cuerpo escrito en texto estructurado.
5. Asocie cada acción con los pasos que la ejecutan y elija un calificador para cada asociación. `L` y `D` necesitan además un tiempo como `T#2s`.
6. Compile el proyecto (`Ctrl+B`) y lea la pestaña Problemas. Un problema nombra el paso, la transición o la acción a la que se refiere, y al activarlo se selecciona ese elemento.

Cada acción también se puede hacer con el teclado; la [referencia de teclado](../reference/visual-editor-keyboard.md) lista las teclas.

## Los elementos de la paleta

| Elemento | Qué es |
| --- | --- |
| Paso inicial | El paso que está activo cuando arranca el programa. |
| Paso | Un estado de la máquina. Puede ejecutar acciones mientras está activo. |
| Transición | La condición que lleva el diagrama de los pasos que la preceden a los pasos que la siguen. |

La condición de una transición es una expresión `BOOL` en texto estructurado. Dentro de una condición o del cuerpo de una acción, `Paso.X` es TRUE mientras el paso llamado `Paso` está activo, y `Paso.T` es el tiempo que lleva activo. Una divergencia de selección son varias transiciones que salen de un paso; una divergencia o convergencia simultánea es una transición que entra en varios pasos o sale de ellos.

## Calificadores de acción

| Calificador | La acción se ejecuta |
| --- | --- |
| `N` | mientras el paso está activo |
| `S` | desde el primer ciclo del paso hasta que un paso con `R` la desactiva, también después de salir del paso |
| `R` | ya no, una vez activo este paso: borra el estado que `S` guardó para la acción |
| `L` | mientras el paso está activo, durante el tiempo indicado como máximo |
| `D` | mientras el paso está activo, una vez transcurrido el tiempo indicado |
| `P`, `P1` | durante un ciclo, cuando el paso se activa |
| `P0` | durante un ciclo, cuando se sale del paso |

Los calificadores `SD`, `DS` y `SL` no se admiten: la compilación los rechaza con un mensaje.

## Cómo recorre el diagrama un ciclo

Un ciclo se ejecuta en este orden, de modo que una secuencia cruza como máximo una transición por ciclo y todo paso que se activó ejecuta sus acciones durante al menos un ciclo.

1. Se actualiza el tiempo `.T` de cada paso.
2. Las acciones se ejecutan con el estado con el que empezó el ciclo.
3. Todas las transiciones se evalúan con ese mismo estado. Entre las transiciones que salen de un paso, gana la primera que se cumple; su orden es el número de prioridad si lo tiene, y el orden del archivo en caso contrario.
4. Las transiciones que se dispararon se aplican juntas: todos los pasos que dejan quedan inactivos y después todos los pasos en que entran quedan activos.

Un diagrama de más de 14 pasos se compila y se ejecuta en el runtime nativo.

## Errores comunes

| Error | Qué ocurre | Qué hacer |
| --- | --- | --- |
| Dos pasos con el mismo nombre | La compilación lo rechaza, porque `Paso.T` sería ambiguo. | Dé a cada paso un nombre distinto. |
| Una variable con el nombre de un paso | La compilación lo rechaza por el mismo motivo. | Cambie el nombre de la variable o del paso. |
| `L` o `D` sin tiempo | La compilación dice que el calificador necesita un tiempo, como `T#2s`. | Escriba un literal `TIME`. |
| Un tiempo en `N`, `S`, `R` o `P` | La compilación dice que el calificador no admite tiempo. | Deje el tiempo vacío. |
| Un nombre de acción que no se resuelve | La compilación nombra el paso y la acción. | Defina la acción, o corrija el nombre. |
| Una condición de transición vacía | La compilación la rechaza. | Escriba una expresión `BOOL`; `TRUE` se dispara siempre. |
| Una transición que no referencia un paso conocido | La compilación la rechaza y nombra la transición. | Vuelva a conectarla a pasos existentes. |
| Un cuerpo de acción en un lenguaje distinto de texto estructurado | Solo se admiten acciones en texto estructurado. | Escriba el cuerpo en texto estructurado. |
| Un paso en el que no entra ninguna transición | Un punto de parada no tiene dónde detenerse. | Ponga el punto de parada en un paso en el que entre una transición. |

## Verlo en ejecución

Mientras un programa se ejecuta en la simulación, el editor muestra qué pasos están activos y durante cuánto tiempo, y de cada transición si su condición se cumple y si se disparó en este ciclo. Un punto de parada en un paso detiene la ejecución donde entra una transición, y uno en una transición, donde se dispara; `F9` lo alterna en el elemento seleccionado. Un estado que el mapa de depuración no da se muestra como no disponible, nunca como inactivo. Vea [Editores de texto y visuales](../ide/editors.md) para los detalles.

Nivel de evidencia: host. Los casos de conformidad de la referencia ejecutan pasos, calificadores, ramas y un diagrama de más de 14 pasos en el runtime nativo, y `packages/zplc-ide/src/transpiler/transpiler.test.ts` cubre la traducción y sus rechazos. No se usó ninguna placa.
