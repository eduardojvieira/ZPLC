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
- La paleta lista los bloques de los archivos Structured Text de `src`, de los archivos de una carpeta de biblioteca
  (vea [Declaraciones y carpetas de biblioteca](./features.md#declaraciones-y-carpetas-de-biblioteca)) y de cualquier
  archivo abierto en el editor. La compilación lee los archivos de `src` y los que están directamente en las carpetas de
  biblioteca que `libraries` de `zplc.json` lista.

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

## Deshacer, rehacer y selección en los editores visuales

Un gesto tuyo es un paso de deshacer (LNG-010): un arrastre, un pegado, un borrado (los nodos y los cables que se fueron con
ellos), un soltar desde la paleta, un cable trazado o la edición de un nombre o de una condición. Un arrastre de 300 píxeles
llega al lienzo como unos treinta cambios de posición; el archivo se escribe, y el historial recibe una entrada, una sola
vez, cuando sueltas el nodo. Las letras escritas en un campo con menos de un segundo entre una y otra son un solo paso. El
historial guarda los últimos 100 gestos de cada archivo durante la sesión; lo usan los botones Deshacer y Rehacer, `Ctrl+Z` y
`Ctrl+Shift+Z` (`Ctrl+Y`).

La selección no es parte del archivo, y sobrevive a la edición: lo que está seleccionado sigue seleccionado cuando el lienzo
se reconstruye desde el archivo tras un cambio. Deshacer y rehacer devuelven la selección junto con el contenido: deshacer
un borrado devuelve los bloques y los selecciona, deshacer un pegado selecciona lo que estaba seleccionado antes de pegar.

Nivel de evidencia: host. `src/editors/gesture.test.ts` ejercita la regla de commit con un arrastre de 30 pasos, un borrado
y una serie de cambios de selección, y `src/editors/visualHistory.test.ts` guarda 100 gestos, la fusión de ediciones y la
selección de cada paso. El recorrido 28j de `bun run test:journeys` arrastra un bloque con eventos de puntero reales, y un solo `Ctrl+Z` deshace todo el arrastre.

## El servicio de lenguaje de Structured Text

El editor de Structured Text lee todo el proyecto, no solo el archivo que tienes delante (LNG-015, LNG-016).

| Función | Qué hace |
| --- | --- |
| Diagnósticos | Cada error de sintaxis y cada error semántico de cada archivo Structured Text del proyecto, mientras escribes (con una pausa de 0,3 s), con el rango que dio el propio front end del compilador. Aparecen como subrayados en los archivos abiertos y en **Problemas** (Diagnósticos ST en vivo), y desaparecen la siguiente vez que se comprueba el proyecto y el error ya no está. No son evidencia de compilación; la evidencia es **Build**. |
| Autocompletado | Las variables, parámetros y métodos en el ámbito; tras un punto, los miembros del tipo de lo que está antes (un bloque, una estructura, un elemento de un arreglo de estructuras, un bloque estándar); los bloques, funciones y tipos de todos los archivos; los tipos donde va un tipo; los parámetros de una llamada como `Nombre := `. Los nombres del proyecto van antes que la biblioteca estándar. |
| Hover | Qué es un nombre, su tipo y dónde se declara, también en otro archivo. |
| Ir a la definición, buscar referencias | En todos los archivos del proyecto. Un nombre se encuentra por lo que es, no por cómo se escribe: el `Count` de un programa no es el `Count` de otro. |
| Esquema | Las declaraciones del archivo como un árbol (un bloque contiene sus entradas, salidas, variables y métodos). |
| Ayuda de firma | Los parámetros de la función, método o bloque que se llama, y el parámetro en el que está el cursor, también con argumentos con nombre. |
| Renombrar símbolo (`F2`) | Renombra lo que un nombre representa en todos los archivos del proyecto, por ámbito y por tipo, nunca como texto. Se rechaza, con el motivo, cuando el nombre nuevo ya está declarado donde se usa el anterior, cuando un archivo del proyecto tiene un error de sintaxis (podría contener un uso que no se encontró), cuando el nombre aparece en un archivo Ladder, FBD, SFC o IL (renómbralo también allí) o cuando el nombre es un programa (las tareas de `zplc.json` lo ejecutan por su nombre). Los archivos que cambian se abren como pestañas modificadas; tú las guardas. |
| Formatear documento (`Shift+Alt+F`) | Sangra cada línea según la profundidad de sus bloques y recorta los extremos de las líneas. Solo cambia espacios al principio y al final de una línea: no añade ni quita líneas (un breakpoint es una línea), no mueve ningún token y deja los comentarios como están. Formatear dos veces da el mismo texto. |

Cada función se responde desde un solo índice del proyecto, construido con el lexer y el parser del compilador, con el
texto del editor en lugar de su archivo; un archivo que aún no analiza sintácticamente sigue aportando las declaraciones
que dan sus tokens, así que el autocompletado funciona a mitad de una línea.

No cubierto: un nombre que solo se usa en un archivo Ladder, FBD, SFC o IL no forma parte del índice (renombrar no lo
adivina, como dice la tabla); la búsqueda de símbolos en todo el espacio de trabajo; las acciones de código.

Nivel de evidencia: host. `packages/zplc-compiler/src/compiler/check.test.ts` compara los diagnósticos con los errores
de la compilación para los mismos proyectos; `src/langsvc/*.test.ts` cubren el índice, renombrar, autocompletado, ayuda
de firma, esquema, formato (sobre cada proyecto de ejemplo, token a token), los marcadores y los proveedores de Monaco; el journey 4c
de `bun run test:journeys` escribe una variable sin declarar en el editor real, la ve con su rango y la deshace.

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

El elemento viaja con el diagnóstico desde la compilación hasta el panel Problems (la compilación corre en su propio
proceso y lo envía, verificado, junto con el código, la ruta y la posición). Por eso el problema selecciona el
elemento que la compilación nombró, también cuando el archivo del editor cambió después de compilar; un diagnóstico
que llegó sin elemento (un host más antiguo, un texto que no es un id de elemento) se ubica desde el archivo abierto,
como antes.

Nivel de evidencia: host. `electron/workspaceCompileFailure.test.ts` y `src/components/workspaceTestPresentation.test.ts`
cubren el elemento entre los dos procesos, `src/editors/diagnosticElement.test.ts` la elección entre el elemento
transportado y el archivo abierto, y el recorrido 25 de `bun run test:journeys` devuelve el cable al disco después de
una compilación fallida y aun así obtiene el bloque que la compilación nombró.

## Breakpoints en un diagrama

Se puede poner un breakpoint en el elemento del diagrama o en la línea IL que usted editó (LNG-004); el mapa de
depuración relaciona cada rango de instrucciones con ese elemento y el runtime se detiene en su primera instrucción.
Como el punto de una línea de un archivo de texto, se puede poner antes de cargar el programa y se arma cuando Run o
Deploy lo carga.

| Lenguaje | Dónde | Cómo |
| --- | --- | --- |
| IL | La línea IL. El mapa indica líneas de la fuente IL, como espera un editor de texto. | El margen del editor. |
| LD | El rung: la primera sentencia de su código. | El punto a la izquierda del rung, o F9 con el rung seleccionado. |
| FBD | El bloque: la primera sentencia que genera. Una constante o la lectura de una variable no tiene. | F9 con el bloque seleccionado. |
| SFC | Un paso se detiene donde una transición entra en él; una transición, donde se dispara. Un paso en el que no entra ninguna transición no tiene dónde detenerse. | F9 con el paso o la transición seleccionados. |

El breakpoint se guarda en el elemento y no en una línea generada, de modo que sigue a su rung, bloque o paso cuando el
diagrama cambia y se compila de nuevo; si se borra el elemento, el breakpoint se olvida, y uno en un elemento que no
tiene sentencia se rechaza una vez cargado un programa. El elemento en el que está detenido el programa se resalta en
amarillo. Los contadores de programa son los que toman el runtime de la simulación y el de una placa; detenerse en una
placa no se ha comprobado aquí.

## Valores en línea desde el mapa de depuración

Mientras un programa corre bajo Studio, cada editor muestra lo que el programa contiene (LNG-006), leído a través del mapa
de depuración de la compilación de su archivo. La compilación registra, para cada elemento de una fuente Ladder, FBD o
SFC, qué variable del programa generado guarda su estado, de modo que ningún editor adivina un nombre a partir del que ve:
un estado que el mapa no da se muestra como no disponible (un guion, `UNAVAILABLE`), nunca como FALSE o IDLE.

| Lenguaje | Qué se muestra | De dónde sale |
| --- | --- | --- |
| ST | El valor de cada variable que nombra una línea, tras la línea (`Count=7  Ready=TRUE`). Un miembro de una instancia de bloque o de una estructura se lee a través de su instancia. | El servicio de lenguaje resuelve qué es un nombre; el mapa del programa del archivo da su dirección y su tipo. Una función o un bloque de función no muestra nada: sus nombres pertenecen a cada instancia. |
| IL | El valor de cada variable declarada que usa una instrucción, tras la línea. | El parser de IL y el mapa del programa del archivo. |
| LD | Energía: un elemento se ilumina cuando le llega energía, por caminos en serie y en paralelo y por ramas, y tras un bloque es la salida del propio bloque. El valor de un contacto o una bobina, y las salidas de un bloque, debajo. | El flujo de energía del rung como una expresión de las variables que lo forman (`rung:r/cell:fila,col`), evaluada con los valores leídos. |
| FBD | El valor de cada cable y las salidas de cada bloque; un bloque de variable muestra el valor de su variable. | El temporal que se dio a cada salida consumida, o el miembro de la instancia. |
| SFC | Qué pasos están activos y desde cuándo; de cada transición, si su condición se cumple y si disparó en este escaneo. | El estado generado del gráfico: el indicador y el temporizador de cada paso, `_C_` y `_F_` de cada transición. |

Un valor se lee en el programa de su propio archivo: dos programas que tienen cada uno un `_rung1_result` tienen dos
valores. Las variables que muestra un editor se leen con el sondeo de la tabla Watch, y solo las regiones que muestran un
valor lo dibujan de nuevo ([Qué se vuelve a dibujar cuando cambia un valor](#qué-se-vuelve-a-dibujar-cuando-cambia-un-valor)).

No cubierto: el cable entre dos elementos de un rung no se ilumina, solo los elementos; un elemento de un arreglo en ST no
tiene valor en línea; los valores en una placa, la ejecución paso a paso en hardware. El runtime de la simulación es lo
que leen las pruebas del host.

Nivel de evidencia: host, contra el runtime real. `src/monitoring/runtime.test.ts` compila un Ladder, un FBD y un SFC, los
carga en el runtime nativo, los escanea con entradas y lee las variables que nombra el mapa, y comprueba el estado de cada
elemento: la energía por la rama de enclavamiento, los pines de los temporizadores, el paso activo y la transición
disparada. `src/monitoring/elementStates.test.ts` comprueba que cada variable que nombra una entrada del monitor existe
en el mapa para cada diagrama de ejemplo. Los journeys 28b a 28e de `bun run test:journeys` muestran los valores en la
aplicación real.

## Un solo vocabulario para los estados de señal

Todo lugar que muestra el valor de una señal usa los mismos cinco estados, definidos una sola vez en `src/theme/signalTone.ts` con los tokens `--signal-*` de `src/theme/tokens.ts`: los valores en línea del editor de código, la tabla Watch, Ladder, FBD, SFC, el monitor de instancia, la vista del controlador y los escenarios grabados del Lab. El color nunca indica un estado por sí solo.

| Estado | Color | Glifo | También se muestra como |
| --- | --- | --- | --- |
| TRUE | Verde: un TRUE confirmado, o RUN, y nada más | `●` | La palabra TRUE, `T` en la insignia de Ladder; el flujo de energía es un cable más grueso |
| FALSE | Gris neutro, nunca rojo | `○` | La palabra FALSE, `F` en la insignia de Ladder |
| Desconocido | Gris neutro, contorno discontinuo | `◌` | Un guion o la palabra UNAVAILABLE; un valor que no se leyó nunca se muestra como FALSE |
| Forzado | Ámbar | `◆` | La palabra FORCED; un valor forzado se dibuja como forzado, no como el valor que tiene |
| Falla | Rojo, solo para una falla | `▲` | La palabra FAULT, que un lector de pantalla lee como "Fault" |

Un número no es un estado: se dibuja en el color de valor simple y sin glifo. Un cable en FBD es más grueso para los valores TRUE, forzados y con falla, y discontinuo para un valor que no se leyó; un número distinto de cero no se dibuja como TRUE.

### Estados forzado y falla en los diagramas

Una variable se dibuja como forzada en Ladder, FBD y SFC cuando la tabla de forzados la contiene (la fila de forzado de la tabla Watch) en la dirección que el mapa de depuración da a esa variable en el archivo que se muestra; una variable del mismo nombre en otro programa no se marca. Se dibuja como falla cuando el sondeo del depurador pidió la variable al entorno de ejecución y no obtuvo valor, o la lectura falló, y sigue como falla hasta que un sondeo posterior la lee. Los tres editores toman ambos estados de `Monitor.flagsOf` (`src/monitoring/signalFlags.ts`), así que no pueden discrepar.

| Editor | Qué lleva la señal |
| --- | --- |
| Ladder | El contacto o la bobina que nombra la variable. |
| FBD | El pin de un bloque cuya variable está forzada o no se pudo leer (un pin de entrada toma el estado de la salida conectada), el cable que sale de ese pin y un bloque de variable, que además dice FORCED o FAULT con palabras y muestra la variable misma y no lo que se le conecta. |
| SFC | Un paso cuyo indicador está forzado o no se pudo leer; una transición cuando su propia variable de condición lo está, o cuando una variable nombrada en su condición está forzada (solo cuentan las palabras que el mapa de depuración resuelve a una variable del archivo, así que una palabra clave, un literal o un nombre desconocido nunca marca una transición). |

Forzado es ámbar con `◆` y falla es rojo con `▲`; el rojo significa falla y nada más. Nivel de evidencia: host. `src/editors/monitorFlagsWiring.test.tsx` entrega un ciclo registrado de los ejemplos FBD y SFC, con una entrada forzada y un elemento ilegible, a las funciones puras con las que cada editor construye sus nodos y dibuja los nodos; `src/monitoring/signalFlags.test.ts` comprueba la coincidencia con la tabla de forzados por dirección y el conjunto de variables ilegibles. Los recorridos 51 y 51b fuerzan una variable desde la tabla Watch contra el simulador nativo y leen la señal en el FBD y en el SFC; en el simulador no se puede provocar una falla de lectura, así que la señal de falla solo la comprueban las pruebas de dibujo.

Nada en los editores visuales, la vista del controlador, la tabla Watch ni la lista de notificaciones brilla, pulsa o se anima de forma continua. Un indicador de carga puede girar, y se detiene con el movimiento reducido. `bun tools/ci/ui-kit-guard.ts` falla cuando un archivo agrega una animación o una sombra ahí (UX-010), y su lista de infractores existentes solo puede disminuir.

Nivel de evidencia: host. `src/editors/signalVocabulary.test.tsx` dibuja un contacto y una bobina de Ladder, un bloque FBD, un paso SFC y una transición SFC con cada uno de los cinco estados y comprueba tanto el token como el glifo, y `src/theme/signalTone.test.ts` comprueba el contraste de cada estado en los tres temas. La paleta y los glifos son para que una persona los juzgue a simple vista.

## Ajustar, acercar y alinear

Ladder, FBD y SFC comparten estos gestos (UX-033). Cada uno es un comando de la tabla de teclas, así que también está en la lista de comandos (`F1`) del editor, y cada uno dice lo que hizo mediante el anunciador compartido, que lee un lector de pantalla.

- **Ajustar a la vista** (`Ctrl+Alt+0`, o el botón Ajustar a la vista). FBD y SFC ajustan todo el diagrama a la ventana con un margen y nunca acercan más del 100 %, así que un diagrama de dos bloques conserva su tamaño natural; el botón de ajuste de los controles del lienzo y la tecla usan las mismas opciones. Ladder no tiene zoom: sus peldaños ya usan el ancho de la vista, así que ajustar muestra cada peldaño desde su borde izquierdo.
- **Rango de zoom.** FBD y SFC acercan de 10 % a 400 % (antes de 50 % a 150 %). Al 10 % un diagrama nueve veces más ancho que la ventana sigue entero en pantalla, lo que necesita un esquema de cien bloques; al 400 % un pin es tan grande como un botón.
- **Alineación y distribución** en FBD y SFC, sobre los bloques, pasos y transiciones seleccionados: izquierda (`Alt+Mayús+Izquierda`), derecha (`Alt+Mayús+Derecha`), arriba (`Alt+Mayús+Arriba`), abajo (`Alt+Mayús+Abajo`), centrar sobre una línea vertical (`Alt+Mayús+H`), centrar sobre una línea horizontal (`Alt+Mayús+V`) y un espacio uniforme entre tres o más elementos, de izquierda a derecha (`Ctrl+Alt+Mayús+H`) o de arriba abajo (`Ctrl+Alt+Mayús+V`). Un comando es un paso de deshacer y la selección se conserva. Alinear necesita dos elementos seleccionados y distribuir necesita tres; con menos, el comando no cambia nada y dice por qué.

Nivel de evidencia: host. `src/editors/arrange.test.ts` comprueba la aritmética con cajas de distinto tamaño, `src/editors/fbd/keyboard.test.ts` y `src/editors/sfc/keyboard.test.ts` pulsan las teclas sobre un diagrama y cuentan un gesto cada una, y `src/editors/viewBounds.test.ts` fija el rango.

## Foco en los editores visuales

Un nodo, una arista, un botón de la caja de herramientas y el campo que edita un nombre en Ladder, FBD y SFC muestran el mismo anillo de foco que cualquier otro control de Studio, en todos los temas: dos píxeles en los temas claro y oscuro, tres en alto contraste y el color de resaltado del sistema en el modo de colores forzados. La biblioteca de diagramas quita el contorno de sus nodos y aristas, así que `src/index.css` vuelve a ponerlo en ellos, y ningún archivo de los editores visuales lleva una clase de foco propia. `src/theme/focusRing.test.ts` falla cuando alguno la lleva, o cuando el anillo falta en los nodos.

Nivel de evidencia: host. La prueba lee la hoja de estilos y los archivos fuente; un recorrido que llega con el tabulador a un nodo y lee su contorno calculado está en el recorrido de temas (UX-027).

## Temas, colores forzados y movimiento reducido en los editores

Los tres editores visuales y el editor de código siguen los temas claro, oscuro y de alto contraste, el modo de colores forzados del sistema y el ajuste de movimiento reducido, como el resto de Studio. Un editor visual se dibuja solo con los tokens de `src/theme/tokens.ts`: ningún archivo de `src/editors` lleva un color de la paleta estándar, un color literal, un brillo ni una clase de foco propia, y la lista de infractores de la guardia del kit ya no tiene entradas para ellos. El contraste del texto, de las etiquetas atenuadas, de cada estado de señal y del cable que lleva TRUE está declarado para el lienzo y para un nodo, y `bun tools/ci/ux-tokens.ts` lo comprueba en los tres temas.

Con movimiento reducido la hoja de estilos acorta toda transición y animación, y la cámara de un diagrama, que anima el código, toma su duración de `animationMs` en `src/theme/motion.ts`: cero cuando el sistema pide movimiento reducido. Un cable nunca se anima; un paso SFC activo es un cable más grueso en el color de TRUE.

Nivel de evidencia: host, en la aplicación real. El recorrido 46 abre un archivo Ladder, uno FBD, uno SFC y uno de Structured Text, cambia el tema en los ajustes y lee los colores calculados del lienzo, del texto y de los cables (y el fondo y el texto propios de Monaco) frente a los tokens de ese tema. Luego emula colores forzados y comprueba que cada editor toma el lienzo del sistema, y emula movimiento reducido y comprueba que ningún elemento de un editor ni de la barra de herramientas tarda más de una centésima de segundo en cambiar. Pone el foco en un nodo con el teclado y lee el contorno calculado. No se compara ninguna captura de pantalla.

## Minimapa y estado de depuración del editor de código

El minimapa del editor de código está apagado hasta que usted lo enciende: Ajustes, Preferencias, "Mostrar el minimapa en el editor de código". La elección se guarda para su usuario. Mientras depura, el estado aparece en la barra de estado bajo la barra de herramientas, como "Depuración: En pausa en la línea N" o "Depuración: Conectado, sin pausa", y no se dibuja nada sobre el código. Los breakpoints siguen en el margen del editor.

Nivel de evidencia: host. `src/components/codeEditorDebugState.test.tsx` dibuja la barra de estado con y sin estado de depuración y lee el código fuente del editor, `src/store/editorViewSettings.test.ts` comprueba que el valor por defecto es apagado y que un almacenamiento ilegible se lee como apagado, y el recorrido 46 lee la opción de minimapa de Monaco en la aplicación real.

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

## Edición con el teclado

Toda acción de edición de los editores de Escalera, Bloques de Función y Diagrama Funcional Secuencial se puede hacer con el
teclado (LNG-012): mover un cursor, insertar un elemento, enlazar una variable entre los símbolos declarados, conectar y
borrar. La [referencia de teclado](../reference/visual-editor-keyboard.md) lista todas las teclas. Se genera de la tabla de la
que los editores leen sus teclas, así que una tecla que está en ella funciona, y una tecla que funciona está en ella.

- **El cursor.** En Escalera es una celda de un peldaño, dibujada como un marco azul; un clic en una celda lo pone allí. En los
  editores de bloques de función y de diagrama es el bloque o elemento seleccionado, y `Alt` con una flecha lo mueve al más
  cercano en esa dirección. Las flechas sin `Alt` desplazan el bloque seleccionado en el lienzo, como antes.
- **Insertar.** Una letra inserta en el cursor los elementos más comunes: `C` un contacto, `N` un contacto invertido, `O` una
  bobina en Escalera, `T` una transición y `S` un paso en un diagrama. `Insert` o `I` abre la paleta como una lista con
  búsqueda: se escribe para buscar, Arriba y Abajo eligen, Enter inserta. La caja de herramientas de cada editor se alcanza con
  Tab: sus elementos son botones que insertan en el cursor, y tiene una caja de búsqueda. Arrastrar un elemento sigue
  funcionando, e inserta con el mismo comando que la tecla.
- **Enlazar.** `F2` pide la variable del elemento bajo el cursor, de la lista de símbolos que declara el archivo. A un contacto
  se le ofrecen las variables BOOL y las salidas BOOL de bloques declarados (`Delay.Q`); a una bobina las variables BOOL que no
  son entradas; a la instancia de un bloque de función las variables de su tipo; a la condición de una transición las
  variables BOOL. Donde la lista lo permite, se puede escribir un nombre que no está declarado y se ofrece tal como se escribió.
- **Conectar.** `C` sobre un bloque lista los cables que puede tener, cada uno de una salida a una entrada que la acepta: rigen
  las reglas de los tipos de pin (LNG-013), y no se ofrece una entrada que ya tiene un cable. Se dibuja el cable elegido.
  `Shift+C` lista los cables del bloque y quita el elegido. En un diagrama funcional, `T` inserta una transición debajo del paso
  seleccionado y `S` un paso debajo de la transición seleccionada, cada uno conectado al que sigue.
- **Borrar.** `Delete` quita el elemento bajo el cursor en Escalera, y los bloques y cables seleccionados en un diagrama o en
  un diagrama funcional, y se van con el bloque los cables que tenía.

Un comando que cambia el archivo es un paso del historial de deshacer, y la selección vuelve con deshacer y rehacer (LNG-010).
Lo que hizo cada comando, o por qué se negó, se escribe en una región viva cortés del editor, que lee un lector de pantalla.

Cuatro cosas difieren de lo que hacían antes los editores. Un contacto o una bobina soltados desde la caja de herramientas ya no
se llaman `NewVar`: quedan sin enlazar y muestran `???` hasta que se enlazan. Un bloque de función soltado o insertado recibe un
nombre de instancia que nada más tiene, y la instancia se declara como variable local de su tipo. El panel de propiedades de
Escalera se abre al hacer clic en un elemento o al pulsar Enter sobre él, no cuando un comando del teclado lo selecciona. Un
doble clic en un bloque de un diagrama de bloques de función pregunta qué contiene el bloque, como hace `F2`.

Nivel de evidencia: host, y la aplicación real en el host de desarrollo. `src/editors/ld/keyboard.test.ts`,
`src/editors/fbd/keyboard.test.ts` y `src/editors/sfc/keyboard.test.ts` pulsan teclas sobre un modelo, con la tabla de teclas
en medio, y comprueban el documento, el cursor, las listas que se ofrecen y que la compilación lee lo que se escribió;
`src/editors/picker.test.ts` y `src/editors/keymap.test.ts` cubren la lista con búsqueda y la tabla. Los recorridos 28f, 28g y
28h de `bun run test:journeys` construyen un peldaño, editan un diagrama y editan un diagrama funcional con eventos de teclado
reales, guardan y compilan; el recorrido 28i suelta elementos de la caja de herramientas con eventos de arrastre del DOM. No cubierto: un lector de pantalla real (la región viva existe y su texto se prueba, no su voz), y
una forma con teclado de poner un bloque en una coordenada exacta (un bloque se pone junto al cursor y luego se desplaza con
las flechas).

## Qué se vuelve a dibujar cuando cambia un valor

Un valor observado se lee diez veces por segundo mientras corre un programa. Studio vuelve a dibujar solo lo que lo muestra
(IDE-013): la tabla Watch y el editor del archivo que tiene la variable. El Explorador, la barra de herramientas, los ajustes
y la barra de pestañas no se suscriben a las lecturas, y una lectura que vale lo mismo que antes no publica nada. Un
componente que necesita cinco de 200 valores observados se vuelve a dibujar cuando cambia uno de esos cinco, no cuando
cambia otro.

`bun tools/ci/ide-structure.ts` (lo ejecuta `bun run lint:ide`) falla si un componente o hook fuera de `src/store/` se suscribe
a todo el store o a su porción `debug`: cada región de la ventana nombra los campos que muestra
(`src/store/regionSubscriptions.ts`).

Medido sobre el store con 200 valores observados leídos 100 veces y 50 pulsaciones en un archivo de 2.000 líneas: antes, cada
uno de Explorador, barra de herramientas, Consola, área del editor y ajustes se dibujaba 150 veces y cada lector de valores
observados 100 veces; ahora las regiones que no muestran ninguno de los dos se dibujan 0 veces, la barra de pestañas y el
editor 50 veces (una por pulsación), y un lector de cinco valores 10 veces, por las 10 lecturas que los cambiaron.

Nivel de evidencia: host, al nivel del store y de sus selectores (`src/store/regionSubscriptions.test.ts`). Este repositorio
no tiene un entorno de pruebas con DOM, así que no se cuentan los dibujos de React; la Consola sigue dibujándose en cada
pulsación, porque la pestaña Problemas muestra lo que escribir borra y sus comprobaciones comparan el contador de la
compilación.

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
