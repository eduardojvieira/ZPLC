# Editores de texto y visuales

ZPLC edita los cinco lenguajes en un solo entorno de trabajo. El texto estructurado y la lista de instrucciones son texto. La escalera, el diagrama de bloques de función y el diagrama funcional secuencial son modelos visuales, y cada uno conserva su propio modelo. Esta página cubre lo que los editores comparten: el servicio de lenguaje, las paletas, el teclado, deshacer, los diagnósticos, los puntos de parada y los valores en línea. Para aprender a escribir en un lenguaje, use su guía: [texto estructurado](../languages/st.md), [lista de instrucciones](../languages/il.md), [diagrama de escalera](../languages/ld.md), [diagrama de bloques de función](../languages/fbd.md) o [diagrama funcional secuencial](../languages/sfc.md).

| Lenguaje | Editor | Límite |
| --- | --- | --- |
| ST | El editor de texto principal, con diagnósticos y navegación por el código fuente. | El subconjunto IEC admitido es el contrato del compilador. |
| IL | Un editor de texto. | Lo que acepta depende del subconjunto del compilador. |
| LD | Peldaños, contactos, bobinas, ramas, deshacer y validación visual. | El ST generado es solo una salida de lectura. |
| FBD | Puertos con tipo, bloques, conexiones, deshacer y validación visual. | El ST generado es solo una salida de lectura. |
| SFC | Pasos, transiciones, acciones, deshacer y validación visual. | El ST generado es solo una salida de lectura. |

Los modelos visuales se validan y se traducen antes de la compilación canónica ([Flujo del compilador](./compiler.md)). Un backend compartido no da a todos los lenguajes las mismas funciones ni la misma depuración, así que compile y ejecute el proyecto para saber qué obtiene.

## El servicio de lenguaje del texto estructurado

El editor de texto estructurado lee todo el proyecto, no solo el archivo que tiene delante.

| Función | Qué hace |
| --- | --- |
| Diagnósticos | Cada error de sintaxis y semántico de cada archivo de texto estructurado del proyecto, mientras escribe (tras una pausa de 0,3 s), con el rango que dio el propio front end del compilador. Aparecen como subrayados en los archivos abiertos y en **Problemas**, y desaparecen la próxima vez que se comprueba el proyecto y el error ya no está. No son evidencia de compilación; la **compilación** sí lo es. |
| Autocompletado | Las variables, parámetros y métodos del ámbito; tras un punto, los miembros del tipo de lo que lo precede; los bloques, funciones y tipos de todos los archivos; los parámetros de una llamada como `Name := `. Los nombres del proyecto van antes que la biblioteca estándar. |
| Ayuda emergente | Qué es un nombre, su tipo y dónde se declara, también en otro archivo. |
| Ir a la definición, buscar referencias | En todos los archivos del proyecto. Un nombre se encuentra por lo que es, no por cómo se escribe: el `Count` de un programa no es el `Count` de otro. |
| Esquema | Las declaraciones del archivo como un árbol. |
| Ayuda de firma | Los parámetros de la función, el método o el bloque a que se llama, y aquel en el que está el cursor, también cuando los argumentos tienen nombre. |
| Renombrar símbolo (`F2`) | Renombra lo que representa un nombre en todos los archivos del proyecto, por ámbito y por tipo, nunca como texto. Se rechaza, con el motivo, cuando el nombre nuevo ya está declarado donde se usa el antiguo, cuando un archivo del proyecto tiene un error de sintaxis, cuando el nombre se menciona en un archivo de escalera, FBD, SFC o IL (renómbrelo también allí), o cuando el nombre es un programa, porque las tareas de `zplc.json` lo ejecutan por su nombre. Los archivos que cambian se abren como pestañas modificadas; usted los guarda. |
| Dar formato al documento (`Mayús+Alt+F`) | Sangra cada línea según la profundidad de sus bloques y recorta los finales de línea. Cambia solo el espacio en blanco al principio y al final de una línea: no se agrega ni se quita ninguna línea, ningún token se mueve, y un comentario queda como está escrito. Dar formato dos veces da el mismo texto. |

Cada función se responde desde un solo índice del proyecto, construido con el analizador léxico y sintáctico del compilador, con el texto del editor en lugar de su archivo. Un archivo que todavía no se analiza sigue aportando las declaraciones que dan sus tokens, así que el autocompletado funciona en mitad de una línea.

No cubierto: un nombre usado solo en un archivo de escalera, FBD, SFC o IL no forma parte del índice; la búsqueda de símbolos en todo el espacio de trabajo; las acciones de código.

Nivel de evidencia: host. `packages/zplc-compiler/src/compiler/check.test.ts` ejecuta los diagnósticos contra los errores de la compilación para los mismos proyectos, las pruebas de `packages/zplc-ide/src/langsvc/` cubren el índice, el renombrado, el autocompletado, la ayuda de firma, el esquema y el formato (sobre cada proyecto de ejemplo, token por token), y el recorrido 4c de `bun run test:journeys` escribe una variable no declarada en el editor real y la ve con su rango.

## Bloques del proyecto en las paletas

La paleta de bloques de diagrama de bloques de función y de escalera muestra, además de los bloques estándar, un grupo **Proyecto** con los bloques de función y las funciones que declaran los archivos de texto estructurado del proyecto. Un bloque del grupo tiene los puertos de su declaración: en un bloque de función, sus `VAR_INPUT` y `VAR_IN_OUT` son entradas y sus `VAR_OUTPUT` son salidas, y en una función las entradas son las entradas y el resultado es la salida `OUT`. El texto estructurado generado llama al bloque con argumentos con nombre, así que el orden en que conecta las entradas no importa.

- **El diagrama de bloques de función** coloca tanto bloques de función (con un nombre de instancia) como funciones. Una función cuyo resultado no usa nada se llama de todos modos.
- **La escalera** coloca bloques de función en un peldaño, como un temporizador: el elemento nombra el tipo y la instancia, y los parámetros nombran las entradas de la declaración. Una función no se coloca en un peldaño; llámela desde un diagrama de bloques de función o desde texto estructurado.
- Un bloque que ningún archivo declara se rechaza por su nombre cuando se compila el diagrama. Una declaración del proyecto prevalece sobre un bloque estándar del mismo nombre, como en el compilador.
- La paleta lista los bloques de los archivos de texto estructurado de `src`, de los archivos de una carpeta de biblioteca (vea [Declaraciones y carpetas de biblioteca](./features.md#declaraciones-y-carpetas-de-biblioteca)) y de cualquier archivo abierto en el editor. La compilación lee los archivos de `src` y los que están directamente en las carpetas de biblioteca que lista `libraries` en `zplc.json`.

## Qué ofrecen las paletas

Una paleta ofrece solo lo que su traductor traduce, y cada elemento que ofrece se ejecuta en el conjunto de pruebas: se coloca en un programa, se compila, se carga en la máquina virtual y se ejecuta un ciclo.

- **La escalera** ofrece cuatro contactos (normalmente abierto, normalmente cerrado, flanco ascendente y descendente), seis bobinas (normal, negada, de activación, de desactivación, flanco ascendente y descendente), la rama, los bloques de función de la biblioteca y del proyecto, y las quince cajas de función IEC del grupo **Funciones**. Los bloques de comunicación `COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE` y `COMM_MODBUS` no se ofrecen: ningún archivo de escalera puede declarar una instancia de ellos.
- **El diagrama de bloques de función** ofrece las compuertas, las comparaciones, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `MAX`, `MIN`, `LIMIT` y `SEL`, los bloques de función de la biblioteca y del proyecto, y los bloques que transportan un valor (`constant`, `variable`, `input`, `output`). Las funciones de la biblioteca (`SQRT`, `SIN`, `LEN`, `CONCAT`, las conversiones) no se ofrecen: un diagrama no puede llamarlas, y la compilación las rechaza por su nombre.
- **El diagrama funcional secuencial** ofrece el paso, el paso inicial y la transición.

## Archivos visuales en disco

Un archivo de escalera, FBD o SFC es JSON. ZPLC lo comprueba contra la forma que su editor lee cuando lo abre. Un archivo que no es JSON, o que es JSON de otra forma, muestra un panel de error que nombra el archivo y sus cinco primeras infracciones por ruta (`rungs[0].grid[1][2].element.type: ...`), cuenta el resto, y deja la ventana y todas las demás pestañas como estaban. Corrija el archivo y ábralo otra vez; la compilación rechaza el mismo archivo por el mismo motivo.

Abrir un archivo visual y guardarlo sin cambios lo deja byte a byte como estaba, sea cual sea la disposición con que se escribió. Un cambio que termina donde empezó, como arrastrar un elemento y devolverlo, tampoco reescribe el archivo. La primera edición real escribe el archivo entero en la única forma que usa ZPLC: JSON con dos espacios de sangría y un salto de línea al final.

## Edición con el teclado

Cada acción de edición de los editores de escalera, de diagrama de bloques de función y de diagrama funcional secuencial se puede hacer con el teclado: mover un cursor, insertar un elemento, asociar una variable de los símbolos declarados, conectar y eliminar. La [referencia de teclado](../reference/visual-editor-keyboard.md) lista todas las teclas. Se genera a partir de la tabla de la que los editores leen sus teclas, así que una tecla que está en ella funciona, y una tecla que funciona está en ella.

- **El cursor.** En la escalera es una celda de un peldaño, dibujada como un marco azul; un clic en una celda lo coloca allí. En los editores de bloques de función y de diagramas de pasos es el bloque o el elemento seleccionado, y `Alt` con una flecha lo mueve al más cercano en esa dirección. Las flechas sin `Alt` desplazan el bloque seleccionado en el lienzo.
- **Insertar.** Una letra inserta los elementos comunes en el cursor: `C` un contacto, `N` un contacto invertido y `O` una bobina en la escalera, `T` una transición y `S` un paso en un diagrama de pasos. `Insert` o `I` abre la paleta como una lista de búsqueda: escriba para buscar, Arriba y Abajo eligen, Enter inserta. A la caja de herramientas se llega con Tab, sus elementos son botones que insertan en el cursor, y tiene un cuadro de búsqueda. Arrastrar un elemento sigue funcionando e inserta mediante el mismo comando que la tecla.
- **Asociar.** `F2` pide la variable del elemento que está bajo el cursor, de la lista de símbolos que declara el archivo. A un contacto se le ofrecen las variables `BOOL` y las salidas `BOOL` de los bloques declarados (`Delay.Q`); a una bobina, las variables `BOOL` que no son entradas; a la instancia de un bloque de función, las variables de su tipo; a la condición de una transición, las variables `BOOL`. Donde una lista lo permite, se puede escribir un nombre no declarado y se ofrece tal como se escribió.
- **Conectar.** `C` sobre un bloque lista los cables que puede tener, cada uno desde una salida hasta una entrada que lo acepta; se aplican las reglas de tipos de los pines, y no se ofrece una entrada que ya tiene un cable. `Mayús+C` lista los cables del bloque y quita el elegido. En un diagrama de pasos, `T` inserta una transición debajo del paso seleccionado y `S` un paso debajo de la transición seleccionada, cada uno conectado al que lo precede.
- **Eliminar.** `Supr` quita el elemento que está bajo el cursor en la escalera, y los bloques y cables seleccionados en un diagrama o un diagrama de pasos, junto con los cables que había en un bloque.

Un comando que cambia el archivo es un paso del historial de deshacer, y lo que hizo cada comando, o por qué se rechazó, se escribe en una región viva cortés que lee un lector de pantalla. Un contacto o una bobina soltados desde la caja de herramientas quedan sin asociar y muestran `???` hasta que se asocian. Un bloque de función soltado o insertado recibe un nombre de instancia que ningún otro tiene, y la instancia se declara como variable local de su tipo. El panel de propiedades de la escalera se abre cuando se hace clic en un elemento o se pulsa Enter sobre él, y un doble clic sobre un bloque de un diagrama de bloques de función pregunta qué contiene, como hace `F2`.

Nivel de evidencia: host, y la aplicación real en el host de desarrollo. Las pruebas `packages/zplc-ide/src/editors/ld/keyboard.test.ts`, `packages/zplc-ide/src/editors/fbd/keyboard.test.ts` y `packages/zplc-ide/src/editors/sfc/keyboard.test.ts` pulsan teclas sobre un modelo y comprueban el documento, el cursor, las listas que se ofrecen y que la compilación lee lo que se escribió, y los recorridos 28f, 28g y 28h de `bun run test:journeys` arman un peldaño, editan un diagrama y editan un diagrama de pasos con eventos de teclado reales. No cubierto: un lector de pantalla real (la región viva está probada, no su voz), y una forma de colocar con el teclado un bloque en una coordenada exacta.

## Deshacer, rehacer y selección

Un gesto suyo es un paso de deshacer: un arrastre, un pegado, una eliminación (los nodos y los cables que se fueron con ellos), un elemento soltado desde la paleta, un cable dibujado, o una edición de un nombre o una condición. Un arrastre de 300 píxeles llega al lienzo como unos treinta cambios de posición, pero el archivo se escribe, y el historial recibe una entrada, una sola vez, cuando suelta el nodo. Las letras escritas en un mismo campo con menos de un segundo entre ellas son un solo paso. El historial conserva los últimos 100 gestos de cada archivo durante la sesión; los botones Deshacer y Rehacer, `Ctrl+Z` y `Ctrl+Mayús+Z` (`Ctrl+Y`) lo usan.

La selección no forma parte del archivo, y sobrevive a la edición. Deshacer y rehacer devuelven la selección junto con el contenido: deshacer una eliminación devuelve los bloques eliminados y los selecciona, y deshacer un pegado selecciona lo que estaba seleccionado antes de pegar.

Nivel de evidencia: host. `packages/zplc-ide/src/editors/gesture.test.ts` y `packages/zplc-ide/src/editors/visualHistory.test.ts` cubren la regla de confirmación, la fusión y la selección de cada paso, y el recorrido 28j de `bun run test:journeys` arrastra un bloque con eventos reales del puntero y deshace todo el arrastre con un solo `Ctrl+Z`.

## Tipos de pin en FBD

El lienzo del diagrama de bloques de función rechaza un cable entre pines cuyos tipos no coinciden, y explica el motivo en un mensaje sobre el lienzo. Las reglas son las que el compilador aplica a una asignación: los enteros, las cadenas de bits y `REAL` son una sola familia de números (un entero entra en un `REAL` o un `LREAL`, un `REAL` y un `LREAL` entran uno en el otro con la advertencia de compilación cuando se estrecha un `LREAL`, y un `REAL` nunca entra en un entero), y `BOOL`, `TIME`, `DATE`, `TOD`, `DT` y las cadenas aceptan solo su propio tipo. Un bloque de variable tiene el tipo con que se declara su variable y una constante el tipo con que está escrita (`T#2s` es un `TIME`, `0.5` un `REAL`); un pin declarado `ANY` no se juzga. Una salida `BOOL` no puede, por tanto, alimentar una entrada numérica, un `REAL` no puede alimentar una entrada `BOOL` ni entera, y un número no puede alimentar una entrada `TIME`; conviértalo antes con una función de conversión como `REAL_TO_INT`. Una entrada tiene un solo origen, así que un segundo cable hacia ella se rechaza, y un cable puede empezar por cualquiera de sus extremos.

## Ajustar, acercar y alinear

La escalera, FBD y SFC comparten estos gestos. Cada uno es un comando de la tabla de teclas, así que también está en la lista de comandos (`F1`) del editor, y cada uno dice qué hizo mediante el anunciador compartido.

- **Ajustar a la vista** (`Ctrl+Alt+0`, o el botón Ajustar a la vista). FBD y SFC ajustan todo el diagrama a la ventana con un margen y nunca acercan más allá del 100 %. La escalera no tiene zoom: sus peldaños ya usan el ancho de la vista, así que ajustar muestra cada peldaño desde su borde izquierdo.
- **Rango de zoom.** FBD y SFC se acercan del 10 % al 400 %. Al 10 %, un diagrama nueve veces más ancho que la ventana sigue entero en pantalla; al 400 %, un pin es tan grande como un botón.
- **Alineación y distribución** en FBD y SFC, sobre los bloques, pasos y transiciones seleccionados: a la izquierda (`Alt+Mayús+Izquierda`), a la derecha (`Alt+Mayús+Derecha`), arriba (`Alt+Mayús+Arriba`), abajo (`Alt+Mayús+Abajo`), centrar sobre una línea vertical (`Alt+Mayús+H`), centrar sobre una línea horizontal (`Alt+Mayús+V`), y un espacio uniforme entre tres o más elementos, de izquierda a derecha (`Ctrl+Alt+Mayús+H`) o de arriba abajo (`Ctrl+Alt+Mayús+V`). Un comando es un paso de deshacer. Alinear necesita dos elementos seleccionados y distribuir necesita tres; con menos, el comando no cambia nada y dice por qué.
- **Menús contextuales** en el lienzo, en un bloque, paso o transición, en un cable y en un peldaño de escalera. El clic derecho, la tecla de menú contextual o `Mayús+F10` abren el menú de lo que tiene el foco, y el elemento se selecciona primero. Cada elemento del menú muestra la tecla del mismo comando de la tabla de teclas. Un elemento que no puede ejecutarse se muestra deshabilitado con su motivo bajo su nombre, por ejemplo "Seleccione al menos dos elementos para alinearlos". Un bloque de función ofrece además el monitor de instancia en su menú.
- **Los peldaños de escalera usan el ancho de la vista.** Un peldaño es tan ancho como la vista cuando la vista es más ancha que su contenido; cuando el contenido es más ancho, el peldaño se desplaza hacia los lados, y solo entonces.

Nivel de evidencia: host. `packages/zplc-ide/src/editors/arrange.test.ts`, `packages/zplc-ide/src/editors/viewBounds.test.ts` y `packages/zplc-ide/src/editors/contextMenus.test.ts` comprueban la aritmética, el rango y los elementos del menú, y el recorrido 51c mide un peldaño contra su vista, ajusta y acerca con los botones reales y abre menús con `Mayús+F10`. Alinear dos elementos seleccionados lo comprueban las pruebas de los comandos y no un recorrido.

## A dónde apunta un diagnóstico

Un diagnóstico de un archivo visual o IL nombra el elemento al que se refiere, no una línea del texto estructurado generado que usted nunca escribió. La compilación lo informa en el campo `element`, junto a `path`, y el panel Problemas lo selecciona cuando usted activa el problema:

| Lenguaje | Elemento | Seleccionado |
| --- | --- | --- |
| IL | `line:12`, una línea del código fuente IL. Un hallazgo sobre el código generado se pone en la línea IL de la que vino. | La línea. |
| LD | `rung:rung_1`, o `rung:rung_1/cell:0,3` para la celda de la fila 0, columna 3 (`rung:rung_1/element:c1` para un peldaño guardado como lista de elementos). | El peldaño y el elemento de la celda, desplazado hasta quedar a la vista. |
| FBD | `block:and_1`, o `connection:w3` para un cable. Un bloque que solo lee una variable o contiene una constante no tiene instrucción: un hallazgo sobre su nombre se pone en el bloque con el que se escribe. | El bloque o el cable. |
| SFC | `step:s1`, `transition:t1` (su condición) y `action:a1` (su cuerpo). | El paso o la transición; una acción se muestra en el primer paso que la usa. |

La línea y la columna de un diagnóstico de un diagrama siguen siendo las del texto estructurado generado, y el mensaje lo dice. Un diagrama que no es válido da un diagnóstico por cada elemento erróneo, no uno por todo el archivo. El elemento viaja con el diagnóstico desde la compilación hasta el panel Problemas, de modo que el problema selecciona el elemento que nombró la compilación incluso cuando el archivo del editor cambió desde que se ejecutó la compilación.

Nivel de evidencia: host. `packages/zplc-ide/src/editors/diagnosticElement.test.ts` cubre la elección entre el elemento transportado y el archivo abierto, y el recorrido 25 de `bun run test:journeys` devuelve el cable al disco tras una compilación fallida y aun así obtiene el bloque que nombró la compilación.

## Puntos de parada en un diagrama

Un punto de parada se puede poner en el elemento del diagrama o en la línea IL que usted editó. El mapa de depuración relaciona cada rango de instrucciones con ese elemento, y el runtime se detiene en la primera instrucción de él. Como el punto de una línea de un archivo de texto, se puede poner antes de cargar el programa y se arma cuando el programa se carga con Ejecutar o con Cargar.

| Lenguaje | Dónde | Cómo |
| --- | --- | --- |
| IL | La línea IL. El mapa indica líneas del código fuente IL, como espera un editor de texto. | El margen del editor. |
| LD | El peldaño: la primera instrucción de su código. | El punto a la izquierda del peldaño, o `F9` sobre el peldaño seleccionado. |
| FBD | El bloque: la primera instrucción que genera. Una constante o una lectura de variable no la tienen. | `F9` sobre el bloque seleccionado. |
| SFC | Un paso se detiene donde entra una transición; una transición se detiene donde se dispara. Un paso en el que no entra ninguna transición no tiene dónde detenerse. | `F9` sobre el paso o la transición seleccionados. |

Un punto de parada se guarda en el elemento, no en una línea generada, así que sigue a su peldaño, bloque o paso cuando el diagrama cambia y se vuelve a compilar. Uno cuyo elemento se eliminó se olvida, y uno en un elemento sin instrucción se rechaza una vez cargado un programa. El elemento donde está el programa detenido se perfila en amarillo. Los contadores de programa son los que toman el runtime de la simulación y el de una placa; aquí no se ha comprobado la detención en una placa.

## Valores en línea desde el mapa de depuración

Mientras un programa se ejecuta en ZPLC, cada editor muestra lo que contiene el programa, leído a través del mapa de depuración de la compilación de su archivo. La compilación registra, para cada elemento de un código fuente de escalera, FBD o SFC, qué variable del programa generado guarda su estado, así que ningún editor adivina un nombre. Un estado que el mapa no da se muestra como no disponible (un guion, `UNAVAILABLE`), nunca como FALSE o IDLE.

| Lenguaje | Qué se muestra | De dónde viene |
| --- | --- | --- |
| ST | El valor de cada variable que nombra una línea, después de la línea (`Count=7  Ready=TRUE`). Un miembro de una instancia de bloque o de una estructura se lee a través de su instancia. | El servicio de lenguaje resuelve qué es un nombre; el mapa del programa del archivo da su dirección y su tipo. Una función o un bloque de función no muestran nada: sus nombres pertenecen a todas las instancias. |
| IL | El valor de cada variable declarada que usa una instrucción, después de la línea. | El analizador de IL, y el mapa del programa del archivo. |
| LD | Energía: un elemento se ilumina cuando le llega energía, por caminos en serie y en paralelo y por ramas, y después de un bloque es la salida del propio bloque. El valor de un contacto o una bobina, y las salidas de un bloque, debajo. | El flujo de energía del peldaño como una expresión de las variables de que está hecho, evaluada con los valores leídos. |
| FBD | El valor de cada cable y las salidas de cada bloque; un bloque de variable muestra el valor de su variable. | La variable temporal que recibió cada salida consumida, o el miembro de la instancia. |
| SFC | Qué pasos están activos y durante cuánto tiempo; de cada transición, si su condición se cumple y si se disparó en este ciclo. | El estado generado del diagrama: el indicador y el temporizador de cada paso, y los indicadores de condición y de disparo de cada transición. |

Un valor se lee en el programa de su propio archivo: dos programas que tienen cada uno un `_rung1_result` tienen dos valores. Las variables que muestra un editor se leen con el sondeo de la tabla de observación, y solo se vuelven a dibujar las regiones que muestran un valor.

No cubierto: el cable entre dos elementos de un peldaño no se ilumina, solo los elementos; un elemento de un arreglo en ST no tiene valor en línea; los valores en una placa y el avance paso a paso en hardware.

Nivel de evidencia: host, contra el runtime real. `packages/zplc-ide/src/monitoring/runtime.test.ts` arma una escalera, un FBD y un SFC, los carga en el runtime nativo, los ejecuta con entradas y lee las variables que nombra el mapa, y comprueba el estado de cada elemento. Los recorridos 28b a 28e de `bun run test:journeys` muestran los valores en la aplicación real.

## Un solo vocabulario para los estados de señal

Todos los lugares que muestran el valor de una señal usan los mismos cinco estados: los valores en línea del editor de código, la tabla de observación, la escalera, FBD, SFC, el monitor de instancia, la vista del controlador y los escenarios registrados del Laboratorio. El color nunca transmite un estado por sí solo.

| Estado | Color | Glifo | También se muestra como |
| --- | --- | --- | --- |
| TRUE | Verde: un TRUE confirmado, o RUN, y nada más | `●` | La palabra TRUE, `T` en una insignia de escalera; el flujo de energía es un cable más grueso |
| FALSE | Gris neutro, nunca rojo | `○` | La palabra FALSE, `F` en una insignia de escalera |
| Desconocido | Gris neutro, contorno discontinuo | `◌` | Un guion o la palabra UNAVAILABLE; un valor que no se leyó nunca se muestra como FALSE |
| Forzado | Ámbar | `◆` | La palabra FORCED; un valor forzado se dibuja como forzado, no como el valor que contiene |
| Falla | Rojo, solo para una falla | `▲` | La palabra FAULT, que un lector de pantalla lee como "Fault" |

Un número no es un estado: se dibuja con el color de valor normal y sin glifo. Un cable en FBD es más grueso para los valores TRUE, forzados y de falla, y discontinuo para un valor que no se leyó.

### Estados forzado y falla en los diagramas

Una variable se dibuja como forzada en la escalera, FBD y SFC cuando la tabla de forzados la contiene en la dirección que el mapa de depuración da a esa variable en el archivo que se muestra; una variable del mismo nombre en otro programa no se marca. Se dibuja como falla cuando el sondeo del depurador la pidió al runtime y no obtuvo ningún valor, o la lectura falló, y sigue siendo una falla hasta que un sondeo posterior la lee.

| Editor | Qué lleva la señal |
| --- | --- |
| Escalera | El contacto o la bobina que nombra la variable. |
| FBD | El pin de un bloque cuya variable está forzada o no se puede leer (un pin de entrada toma el estado de la salida conectada a él), el cable desde ese pin, y un bloque de variable, que además dice FORCED o FAULT con palabras. |
| SFC | Un paso cuyo indicador está forzado o no se puede leer; una transición cuando su propia variable de condición lo está, o cuando una variable nombrada en su condición está forzada. |

Nada en los editores visuales, la vista del controlador, la tabla de observación ni la lista de notificaciones brilla, pulsa ni se anima de forma continua. Un indicador de carga puede girar, y se detiene con el movimiento reducido.

Nivel de evidencia: host. `packages/zplc-ide/src/editors/signalVocabulary.test.tsx` renderiza cada estado en cada editor y comprueba el token y el glifo, y los recorridos 51 y 51b fuerzan una variable desde la tabla de observación contra el simulador nativo y leen la señal en el FBD y en el SFC. En el simulador no se puede provocar una falla de lectura, así que la señal de falla solo la comprueban las pruebas de renderizado.

## Aspecto de los editores

Los tres editores visuales y el editor de código siguen los temas claro, oscuro y de alto contraste, el modo de colores forzados del sistema y el ajuste de movimiento reducido. Se dibujan solo con los tokens del tema, y un nodo, una arista, un botón de la caja de herramientas y el campo que edita un nombre muestran el mismo anillo de foco que cualquier otro control: dos píxeles en los temas claro y oscuro, tres en alto contraste, y el color de resalte del sistema en el modo de colores forzados. Con el movimiento reducido, cada transición se acorta, la cámara de un diagrama no se anima y un cable no se anima nunca.

El minimapa del editor de código está desactivado hasta que usted lo activa en Configuración, Preferencias, "Mostrar el minimapa en el editor de código", y la elección se conserva para su usuario. Mientras depura, el estado está en la barra de estado bajo la barra de herramientas, como "Depuración: en pausa en la línea N" o "Depuración: conectado, sin pausa", y no se dibuja nada sobre el código. Los puntos de parada permanecen en el margen.

Nivel de evidencia: host, en la aplicación real. El recorrido 46 abre un archivo de escalera, uno de FBD, uno de SFC y uno de texto estructurado, cambia el tema y lee los colores calculados frente a los tokens de ese tema. Emula colores forzados y movimiento reducido, y da el foco a un nodo con el teclado para leer el contorno calculado. No se compara ninguna captura de pantalla.

## Edición con IA

Un asistente de IA edita los modelos visuales mediante operaciones con tipo, nunca con JSON sin procesar. El cambio candidato resultante queda aislado en la pestaña **Cambios** hasta que usted lo revise, lo compile y lo pruebe, y lo guarde. Vea [IA y privacidad](./ai-privacy.md).
