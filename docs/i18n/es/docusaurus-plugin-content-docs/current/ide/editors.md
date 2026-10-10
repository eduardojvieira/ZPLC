# Editores de texto y visuales

Studio tiene un solo entorno de trabajo para ST, IL, LD, FBD y SFC, pero cada
lenguaje visual conserva su propio modelo.

## Vías de edición actuales

| Lenguaje | Vía | Límite |
| --- | --- | --- |
| ST | Editor de texto principal, con diagnósticos y navegación por el código. | El subconjunto de IEC admitido es el que define el compilador. |
| IL | Vía de texto de compatibilidad. | Depende del subconjunto que acepte el compilador. |
| LD | Rungs, contactos, bobinas, ramas, deshacer y validación visual. | El ST generado es una salida de solo lectura. |
| FBD | Puertos con tipo, bloques, conexiones, deshacer y validación visual. | El ST generado es una salida de solo lectura. |
| SFC | Pasos, transiciones, acciones, deshacer y validación visual. | El ST generado es una salida de solo lectura. |

## Bloques del proyecto

La paleta de bloques de FBD y LD muestra, además de los bloques estándar, un grupo **Project** con los bloques de
función y las funciones que declaran los archivos Structured Text del proyecto (LNG-008). Un bloque del grupo tiene los
puertos de su declaración: en un bloque de función, sus `VAR_INPUT` y `VAR_IN_OUT` son entradas y sus `VAR_OUTPUT` son
salidas; en una función, sus entradas son las entradas y su resultado es la salida `OUT`. El Structured Text generado
llama al bloque con argumentos por nombre, de modo que el orden en que se conectan las entradas no importa.

- **FBD** coloca bloques de función (con un nombre de instancia) y funciones. Una función cuyo resultado nadie usa se
  llama de todos modos.
- **LD** coloca bloques de función en un rung, igual que un temporizador: el elemento nombra el tipo y la instancia, y
  los parámetros nombran las entradas de la declaración. Una función no se coloca en un rung; llámela desde un archivo
  FBD o ST.
- Un bloque que ningún archivo declara se rechaza por su nombre al compilar el diagrama. Una declaración del proyecto
  tiene prioridad sobre un bloque estándar del mismo nombre, como en el compilador.
- La paleta lista los archivos que están cargados en el editor; la compilación lee todos los archivos Structured Text
  del proyecto.

## Archivos visuales en disco

Un archivo Ladder, FBD o SFC es JSON. Studio lo comprueba contra la forma que lee su editor cuando usted lo abre
(LNG-011): un archivo que no es JSON, o que es JSON de otra forma, muestra un panel de error que nombra el archivo y
sus cinco primeras violaciones por ruta (`rungs[0].grid[1][2].element.type: ...`), cuenta las demás y deja la ventana y
las otras pestañas como estaban. Corrija el archivo y ábralo de nuevo; la compilación rechaza el mismo archivo por el
mismo motivo.

Abrir un archivo visual y guardarlo sin cambios lo deja byte por byte como estaba (LNG-014), con el formato en que se
haya escrito. Un cambio que termina donde empezó, como arrastrar un elemento y devolverlo, tampoco reescribe el archivo.
La primera edición real escribe el archivo completo en la única forma que usa Studio: JSON con dos espacios y un salto
de línea al final (un número escrito `2.0` se escribe `2`; un rung escrito como lista de elementos se escribe como
cuadrícula).

## Tipos de pin en FBD

El lienzo FBD rechaza un cable entre pines cuyos tipos no coinciden y explica el motivo en un mensaje sobre el lienzo
(LNG-013). Las reglas son las que aplica el compilador a una asignación: los enteros, las cadenas de bits y `REAL` son
una sola familia de números (un entero entra en un `REAL` o un `LREAL`, un `REAL` y un `LREAL` entran uno en otro y la compilación avisa cuando un `LREAL` se estrecha, y un `REAL` nunca entra en un entero), y `BOOL`,
`TIME`, `DATE`, `TOD`, `DT` y las cadenas aceptan solo su propio tipo. Un bloque de variable tiene el tipo con que se
declaró su variable y una constante el tipo con que está escrita (`T#2s` es un `TIME`, `0.5` un `REAL`); un pin
declarado `ANY` no se juzga. Por eso una salida `BOOL` no puede alimentar una entrada numérica, un `REAL` no puede
alimentar una entrada `BOOL` ni entera, y un número no puede alimentar una entrada `TIME`; conviértalo antes de forma
explícita con una función de conversión como `REAL_TO_INT`. Una entrada tiene una sola fuente: un segundo cable hacia
ella también se rechaza. Un cable puede iniciarse en cualquiera de sus dos extremos.

## A dónde apunta un diagnóstico

El diagnóstico de un archivo visual o IL nombra el elemento del que trata (LNG-003, LNG-026), no una línea del
Structured Text generado que usted nunca escribió. La compilación lo informa en el campo `element`, junto a `path`, y
el panel Problems de Studio lo selecciona cuando usted activa el problema:

| Lenguaje | Elemento | Se selecciona |
| --- | --- | --- |
| IL | `line:12`, una línea de la fuente IL. Un hallazgo sobre el código generado se pone en la línea IL de la que salió. | La línea. |
| LD | `rung:rung_1`, o `rung:rung_1/cell:0,3` para la celda de la fila 0, columna 3 (`rung:rung_1/element:c1` para un rung guardado como lista de elementos). | El rung y el elemento de la celda, desplazado a la vista. |
| FBD | `block:and_1`, o `connection:w3` para un cable. Un bloque que solo lee una variable o tiene una constante no tiene sentencia: un hallazgo sobre su nombre queda en el bloque con el que se escribe. | El bloque o el cable. |
| SFC | `step:s1`, `transition:t1` (su condición) y `action:a1` (su cuerpo). | El paso o la transición; una acción se muestra en el primer paso que la usa. |

La línea y la columna de un diagnóstico de diagrama siguen siendo las del Structured Text generado, y el mensaje lo
dice. Un diagrama que no es válido da un diagnóstico por cada elemento incorrecto, no uno para todo el archivo.

## Breakpoints en un diagrama

Después de compilar, se puede poner un breakpoint en el elemento del diagrama o en la línea IL que usted editó
(LNG-004); el mapa de depuración relaciona cada rango de instrucciones con ese elemento y el runtime se detiene en su
primera instrucción.

| Lenguaje | Dónde | Cómo |
| --- | --- | --- |
| IL | La línea IL. El mapa indica líneas de la fuente IL, como espera un editor de texto. | El margen del editor. |
| LD | El rung: la primera sentencia de su código. | El punto a la izquierda del rung, o F9 con el rung seleccionado. |
| FBD | El bloque: la primera sentencia que genera. Una constante o la lectura de una variable no tiene. | F9 con el bloque seleccionado. |
| SFC | Un paso se detiene donde una transición entra en él; una transición, donde se dispara. Un paso en el que no entra ninguna transición no tiene dónde detenerse. | F9 con el paso o la transición seleccionados. |

El breakpoint se guarda en el elemento y no en una línea generada, de modo que sigue a su rung, bloque o paso cuando el
diagrama cambia y se compila de nuevo; si se borra el elemento, el breakpoint se olvida. El elemento en el que está
detenido el programa se resalta en amarillo. Antes de compilar no hay dónde detenerse, así que el punto está
deshabilitado. Los contadores de programa son los que toman el runtime de la simulación y el de una placa; detenerse en
una placa no se ha comprobado aquí.

## Qué ofrecen las paletas

Una paleta ofrece solo lo que su transpilador traduce (LNG-007), y cada elemento que ofrece se ejecuta en la suite de
pruebas: se coloca en un programa, se compila, se carga en la máquina virtual y se ejecuta un ciclo.

- **LD** ofrece cuatro contactos (normalmente abierto, normalmente cerrado, flanco de subida y de bajada), seis bobinas
  (normal, negada, set, reset, flanco de subida y de bajada), la rama y los bloques de función de la biblioteca del
  compilador y del proyecto. Los bloques de comunicación `COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE` y
  `COMM_MODBUS` no se ofrecen: ningún archivo Ladder puede declarar una instancia de ellos.
- **FBD** ofrece las compuertas, las comparaciones, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `MAX`, `MIN`, `LIMIT` y
  `SEL`, los bloques de función de la biblioteca y del proyecto con las entradas y salidas que declaran, y los bloques
  que llevan un valor (`constant`, `variable`, `input`, `output`). Las funciones de la biblioteca (`SQRT`, `SIN`,
  `LEN`, `CONCAT`, las conversiones...) todavía no se ofrecen: un diagrama no puede llamarlas y la compilación las
  rechaza por su nombre.
- **SFC** ofrece el paso, el paso inicial y la transición.

## Ruta de compilación

Los modelos visuales se validan y se transpilan antes de la compilación
canónica. Compartir el backend evita duplicar código, pero no garantiza que todos
los lenguajes tengan las mismas funciones ni el mismo comportamiento al depurar.
Compile y ejecute el proyecto y el escenario que le interesan para comprobar el
comportamiento que necesita.

## Edición con IA

La IA edita los modelos visuales mediante operaciones con tipo, nunca con JSON
sin procesar. El cambio candidato resultante queda aislado en la pestaña
**Changes** hasta que usted lo revisa, lo compila, lo prueba y lo guarda.
Consulte [IA y privacidad](./ai-privacy.md).
