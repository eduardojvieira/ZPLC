---
description: Cree un diagrama de bloques de función en el editor de ZPLC, conecte pines con tipo y evite los errores más comunes.
tags: [languages, fbd]
---

# Escribir un diagrama de bloques de función

Esta guía muestra cómo crear un diagrama de bloques de función (FBD) en el editor de ZPLC: qué bloques ofrece la paleta, cómo conectarlos, cómo se comprueban los tipos de los pines y qué diagramas rechaza la compilación. La lista completa de elementos, con la prueba de cada uno, está en la [referencia generada del diagrama de bloques de función](../reference/language-fbd.md).

Un archivo FBD es un modelo de bloques y cables, no texto. La compilación lo valida y lo traduce a texto estructurado, que es una salida de solo lectura; después el compilador lo trata como cualquier otro programa ([Flujo del compilador](../ide/compiler.md)).

## Armar un diagrama

1. Abra un archivo FBD del proyecto, o cree uno con **Nuevo archivo**. Un proyecto nuevo también puede empezar con un programa en diagrama de bloques de función.
2. Pulse un bloque de la paleta para insertarlo junto al bloque seleccionado, o arrástrelo al lienzo. Busque en la paleta escribiendo en su cuadro de búsqueda.
3. Agregue un bloque **variable** por cada entrada y salida que el diagrama lee o escribe, y asócielo a una variable declarada. Agregue un bloque **constante** para un valor fijo (`T#2s` es un `TIME`, `0.5` un `REAL`).
4. Conecte un pin de salida con un pin de entrada. Arrastre desde cualquiera de los dos extremos, o pulse `C` sobre un bloque, elija el cable de la lista y pulse Enter. `Mayús+C` lista los cables del bloque y quita el que usted elija.
5. Nombre la instancia de cada bloque de función que coloque. El editor propone un nombre que ningún otro tiene y declara la instancia como variable local de su tipo; `F2` o un doble clic sobre un bloque pregunta qué contiene.
6. Compile el proyecto (`Ctrl+B`) y lea la pestaña Problemas. Un problema nombra el bloque o el cable al que se refiere, y al activarlo se selecciona ese elemento.

Cada acción también se puede hacer con el teclado; la [referencia de teclado](../reference/visual-editor-keyboard.md) lista las teclas.

## Los bloques de la paleta

| Grupo | Bloques |
| --- | --- |
| Grupos de la biblioteca, como Compuertas lógicas, Comparación, Matemáticas, Selección, Temporizadores, Contadores, Detección de flancos y Biestables | Las compuertas, las comparaciones, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `MAX`, `MIN`, `LIMIT`, `SEL` y los bloques de función de la biblioteca. Un grupo aparece solo cuando contiene un bloque que un diagrama puede colocar. |
| Proyecto | Los bloques de función y las funciones que declaran los archivos de texto estructurado del proyecto, con los pines de su declaración. |
| E/S | Los bloques que transportan un valor: `constant`, `variable`, `input`, `output`. |

Las funciones de la biblioteca, como `SQRT`, `SIN`, `LEN`, `CONCAT` y las conversiones, no se ofrecen, y la compilación las rechaza por su nombre; llámelas desde texto estructurado. Una función del proyecto sí se ofrece, y se llama aunque nadie use su resultado. Una declaración del proyecto prevalece sobre un bloque estándar del mismo nombre.

## Cómo se ejecuta el diagrama

La compilación ordena los bloques según sus dependencias de datos, de modo que un bloque se ejecuta después de los que lo alimentan, sea cual sea su posición en el lienzo. Cada salida que consume otro bloque recibe una variable temporal del tipo que calcula el bloque. Los bloques `ADD`, `SUB`, `MUL` y los demás bloques numéricos conservan el tipo de sus entradas, y una constante entera se adapta a él.

Un bloque del proyecto se llama con argumentos con nombre, así que el orden en que se conectan sus entradas no importa. En un bloque de función, las variables `VAR_INPUT` y `VAR_IN_OUT` son las entradas y las variables `VAR_OUTPUT` son las salidas; en una función, las entradas son sus parámetros y su resultado es la salida `OUT`.

## Tipos de los pines

El lienzo rechaza un cable entre pines cuyos tipos no coinciden, y explica el motivo en un mensaje sobre el lienzo.

| Tipos | Regla |
| --- | --- |
| Enteros, cadenas de bits, `REAL`, `LREAL` | Una sola familia de números. Un entero entra en un `REAL` o un `LREAL`, y un `REAL` y un `LREAL` entran uno en el otro (la compilación avisa cuando se estrecha un `LREAL`). Un `REAL` nunca entra en un entero. |
| `BOOL`, `TIME`, `DATE`, `TOD`, `DT`, cadenas | Cada uno acepta solo su propio tipo. |
| Un pin declarado `ANY` | No se juzga. |

Para llevar un `REAL` a una entrada entera, conviértalo antes con una función de conversión como `REAL_TO_INT` en un programa de texto estructurado. Una entrada tiene un solo origen: un segundo cable hacia la misma entrada se rechaza.

## Errores comunes

| Error | Qué ocurre | Qué hacer |
| --- | --- | --- |
| Un pin de entrada sin cable | La compilación lo rechaza con un mensaje que nombra el bloque. | Conéctelo, o agregue un bloque constante o variable. |
| Un lazo de realimentación, una salida conectada de vuelta a un bloque anterior | La compilación lo rechaza y nombra un bloque del lazo. | Reorganice la lógica para que los datos fluyan en un solo sentido, o escriba la realimentación en texto estructurado. |
| Una salida `BOOL` hacia una entrada numérica | El cable se rechaza. | Conviértala, o compare el valor. |
| Dos cables hacia una entrada | El segundo se rechaza. | Combine los orígenes con un bloque como `OR` o `SEL`. |
| EN y ENO en un bloque | No se admite. La compilación lo rechaza con un mensaje. | Use una caja de función de escalera cuando necesite EN y ENO ([Escribir un diagrama de escalera](./ld.md)). |
| Un bloque que ningún archivo declara | La compilación lo rechaza por su nombre. | Declárelo en un archivo de texto estructurado de `src` o de una carpeta de biblioteca. |

## Ordenar y leer el diagrama

Ajuste el diagrama a la ventana con `Ctrl+Alt+0`. El lienzo admite un zoom de 10 % a 400 %. Alinee los bloques seleccionados con `Alt+Mayús` y una tecla de flecha, y distribuya tres o más de forma uniforme con `Ctrl+Alt+Mayús+H` o `Ctrl+Alt+Mayús+V`; cada comando es un paso de deshacer. Mientras un programa se ejecuta en la simulación, el editor muestra el valor de cada cable y las salidas de cada bloque, y un valor que no se leyó se muestra como no disponible, nunca como FALSE. Vea [Editores de texto y visuales](../ide/editors.md) para los detalles.

Nivel de evidencia: host. `packages/zplc-ide/src/transpiler/transpiler.test.ts` y `packages/zplc-ide/src/models/pinTypes.test.ts` cubren la traducción, el orden y las reglas de los pines, y los casos de conformidad de la referencia ejecutan los diagramas en el entorno de ejecución nativo. No se usó ninguna placa.
