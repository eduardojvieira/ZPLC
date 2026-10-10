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
una sola familia de números (un entero entra en un `REAL`, un `REAL` en un `LREAL`, nunca al revés), y `BOOL`,
`TIME`, `DATE`, `TOD`, `DT` y las cadenas aceptan solo su propio tipo. Un bloque de variable tiene el tipo con que se
declaró su variable y una constante el tipo con que está escrita (`T#2s` es un `TIME`, `0.5` un `REAL`); un pin
declarado `ANY` no se juzga. Por eso una salida `BOOL` no puede alimentar una entrada numérica, un `REAL` no puede
alimentar una entrada `BOOL` ni entera, y un número no puede alimentar una entrada `TIME`; conviértalo antes de forma
explícita con una función de conversión como `REAL_TO_INT`. Una entrada tiene una sola fuente: un segundo cable hacia
ella también se rechaza. Un cable puede iniciarse en cualquiera de sus dos extremos.

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
