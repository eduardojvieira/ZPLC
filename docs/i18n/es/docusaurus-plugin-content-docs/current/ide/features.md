---
slug: /ide/features
id: features
title: Entorno de trabajo de ZPLC
sidebar_label: Entorno de trabajo
description: La ventana de ZPLC, los proyectos, las preferencias, los controles de simulación, la observación y la depuración.
tags: [ide, user-guide]
---

# Entorno de trabajo de ZPLC

El entorno de trabajo es la ventana en la que usted trabaja. Esta página muestra dónde está cada cosa, cómo gestionar un proyecto y sus archivos, cómo ejecutar y observar un programa, y qué conserva la aplicación para usted entre sesiones. La edición propiamente dicha está en [Editores de texto y visuales](./editors.md).

Una barra de actividades y una barra lateral principal, a la izquierda, contienen el navegador del proyecto, la búsqueda, las pruebas y las lecciones. Una barra lateral secundaria opcional, a la derecha, contiene el Inspector. Un panel de resultados bajo el editor contiene Salida, Problemas, Pruebas, Enclavamientos, Laboratorio, Cambios, Agente, Traza, Observación y Terminal.

## Flujo diario

1. Trabaje en una carpeta de proyecto que usted haya elegido.
2. Compile el proyecto y resuelva los diagnósticos.
3. Ejecute una prueba de escenario o la simulación nativa, y lea su traza.
4. Verifique de qué evidencia se trata antes de sacar una conclusión de un resultado.

## Disposición, navegador y editores de configuración

De arriba abajo, la ventana tiene el menú de la aplicación, la barra de comandos (los controles de compilar, conectar y ejecutar, el nombre del proyecto y el botón de la paleta de comandos) y, una junto a otra, la **barra de actividades**, la **barra lateral principal**, el **área del editor** sobre el **panel de resultados** y la **barra lateral secundaria**; al final, la barra de estado.

- **Barra de actividades.** Proyecto, Buscar, Pruebas y Aprender. Al elegir una, cambia la barra lateral principal; la elegida se marca con una barra en su borde y un botón relleno, no solo con el color. Pruebas muestra además el panel de resultados.
- **Barra lateral principal.** Proyecto muestra el navegador, Buscar encuentra texto en el proyecto, Pruebas explica los escenarios y abre los resultados, y Aprender contiene las lecciones.
- **Barra lateral secundaria.** El Inspector. Empieza oculta para que el editor conserve su ancho; se muestra o se oculta con el botón Inspector de la barra de comandos o con **Ver > Mostrar u ocultar la barra lateral secundaria**.
- **Panel de resultados.** Se oculta con **Ver > Mostrar u ocultar el panel de resultados**.

La barra lateral principal es `Ctrl+Alt+B`, la secundaria `Ctrl+Alt+I` y el panel de resultados `Ctrl+Alt+J` (⌘⌥ en macOS). **Mostrar el navegador del proyecto** es `Ctrl+Mayús+E` y **Buscar en el proyecto** es `Ctrl+Mayús+F`. Las barras laterales visibles y la actividad elegida se conservan entre sesiones.

### Navegador por objetos PLC

Un interruptor en el encabezado del navegador elige entre dos modos, y la elección se recuerda.

- **Objetos** (el modo por defecto) agrupa el proyecto como **Programas**, **Bloques de función**, **Funciones**, **Tipos de datos**, **Variables globales**, **Tareas**, **Mapeo de E/S**, **Comunicación** y **Dispositivo**. Los cinco primeros salen de la lectura que el compilador hace de los archivos de texto estructurado y, en el caso de Programas, también de los archivos de diagramas y de lista de instrucciones; un archivo que declara varios objetos aparece bajo cada tipo. Los demás salen de `zplc.json`. Al elegir un objeto se abre su archivo en su línea, o su editor de configuración.
- **Archivos** es el árbol de archivos, con la sección Declaraciones y las carpetas de biblioteca.

### Editores de configuración

**Tareas**, **Mapeo de E/S**, **Red**, **Comunicación** y **Destino** se abren cada uno como una pestaña del área del editor, desde el navegador o desde la lista de la pestaña Configuración. Todas las pestañas editan un solo documento, `zplc.json`: **Guardar la configuración** lo escribe, y cerrar la última pestaña que lo muestra con ediciones sin guardar pregunta si desea guardar, descartar o seguir editando. La pestaña Configuración conserva los metadatos del proyecto y las preferencias de la aplicación.

### Búsqueda

La búsqueda halla texto en los archivos de texto estructurado y de lista de instrucciones del proyecto, incluidos los cambios sin guardar, distinguiendo o no mayúsculas de minúsculas, y lista las coincidencias por archivo. Al elegir una coincidencia se abre el archivo en esa línea. No busca en los diagramas, que se guardan como modelos.

### Mover los separadores

Cada separador entre dos regiones se ilumina bajo el puntero, se rellena mientras lo arrastra y muestra el anillo de foco cuando tiene el foco del teclado. Con el foco en un separador, las teclas de flecha lo mueven 5 puntos, Mayús con una flecha lo mueve 15, Inicio y Fin lo llevan a sus límites, y Enter contrae o restaura el panel contiguo. Un doble clic restaura el tamaño por defecto. Los tamaños de las barras laterales se conservan entre sesiones, y la división entre el editor y el panel de resultados se conserva por proyecto.

### Tamaños de ventana

La ruta principal (abrir un proyecto, editar, compilar, simular, observar) cabe en una ventana de 1366 por 768 píxeles sin ningún control recortado. La ventana puede ser tan pequeña como 1024 por 768: por debajo de 1100 píxeles de ancho la barra de actividades muestra solo iconos, la barra lateral secundaria se oculta sola, y los comandos de tema, configuración y atajos pasan al menú **Más comandos** de la barra de comandos.

Nivel de evidencia: host. Las pruebas unitarias (`packages/zplc-ide/src/layout/separatorSteps.test.ts`, `packages/zplc-ide/src/store/useShellLayout.test.ts`) y un recorrido de `bun run test:journeys` los cubren en el host de desarrollo. No se midió ninguna ventana empaquetada, de macOS ni de Windows.

## Crear y abrir proyectos

**Nuevo proyecto**, en la pantalla de bienvenida y en el menú Archivo, pide cuatro cosas: el nombre del proyecto, la carpeta donde va, el destino (la simulación en esta computadora, o una placa del manifiesto) y el lenguaje del primer programa. El nombre empieza siendo el de la carpeta que usted elige, hasta que escriba otro. La carpeta contiene el proyecto mismo: ZPLC no crea ninguna carpeta dentro de ella, y rechaza una carpeta que ya contenga un `zplc.json`, un `.gitignore` o el primer programa. El proyecto nuevo tiene `src/main` en el lenguaje elegido, una lista de variables globales, una tarea principal que ejecuta ese programa y el destino elegido, y se compila sin ningún cambio.

La pantalla de bienvenida ofrece además **Abrir proyecto**, **Aprender** y los ejemplos incluidos, agrupados por tema y, dentro de un tema con varios niveles, por nivel (Principiante, Intermedio, Avanzado). Un proyecto que no se puede abrir se informa en la pantalla, junto a la acción, nunca en un cuadro de mensaje del sistema.

Nivel de evidencia: host. `packages/zplc-ide/src/project/newProject.test.ts` compila el primer programa de cada lenguaje y comprueba la tarea que lo ejecuta, y el recorrido 2b controla el diálogo en la aplicación real.

## Proyectos recientes y restauración de sesión

En **Recientes**, la pantalla de bienvenida lista hasta diez carpetas que usted abrió antes, la más reciente primero, cada una con su nombre y la fecha en que se abrió por última vez. Al elegir una se vuelve a abrir sin diálogo de carpetas. Una carpeta que se movió, se borró o se reemplazó por un enlace se muestra como no encontrada, con un botón **Olvidar**. Solo se recuerda una carpeta que usted eligió mediante el diálogo de carpetas del sistema.

Para cada proyecto, ZPLC recuerda además las pestañas abiertas, la pestaña activa, la posición del cursor y del desplazamiento de cada archivo, y el tamaño de los paneles del editor y el inferior, y los restablece la próxima vez que se abre la carpeta. En la sesión solo se guardan rutas y posiciones; el texto sin guardar se conserva aparte y solo se ofrece de vuelta después de un cierre inesperado. Una pestaña cuyo archivo ya no existe se descarta sin ningún mensaje. La lista y las sesiones viven en el directorio privado de datos de usuario de ZPLC, nunca en la carpeta del proyecto, y la sesión de un proyecto que sale de la lista se borra la próxima vez que se inicia ZPLC.

Nivel de evidencia: host. `packages/zplc-ide/electron/recentProjects.test.ts` y `packages/zplc-ide/src/utils/sessionState.test.ts` cubren la lista y el formato de la sesión, y los recorridos 12 y 14 de `bun run test:journeys` controlan la aplicación real.

## Archivos y carpetas en el árbol del proyecto

En el modo Archivos del navegador, el encabezado tiene **Nuevo archivo** y **Nueva carpeta**. Un clic derecho sobre un archivo o una carpeta, o `F2` para renombrar, abre sus acciones:

| Acción | Qué hace |
| --- | --- |
| **Renombrar** | Renombra el archivo o la carpeta en disco. Su pestaña abierta, su texto sin guardar y sus puntos de parada lo siguen, y una tarea que ejecuta un programa renombrado se actualiza en `zplc.json` cuando la configuración del proyecto no tiene ediciones sin guardar. |
| **Duplicar** | Copia un archivo junto al original como `Nombre_copy.ext` (luego `_copy2`, y así sucesivamente), a partir del texto que muestra el editor. |
| **Mover a…** | Mueve un archivo o una carpeta a otra carpeta del proyecto. Se informa de un programa movido fuera de `src`: la compilación lee solo los archivos que están directamente en `src`. |
| **Eliminar** / **Eliminar carpeta** | Lo borra del disco tras una confirmación que nombra cualquier archivo que contenga con cambios sin guardar. |
| **Nueva carpeta…** | En una carpeta: crea una carpeta dentro de ella. |

ZPLC rechaza un nombre que ya está en uso, o que la compilación lee como igual al de otro programa (diferencias de mayúsculas, `main.ld` y `main.ld.json`, el mismo nombre en otra carpeta), y lo dice en el diálogo sin cambiar nada.

Un cambio hecho fuera de ZPLC se detecta mientras hay un proyecto abierto. Un archivo sin cambios sin guardar se recarga solo, y uno que se borró se cierra. Un archivo con cambios sin guardar pregunta **Conservar mi versión** o **Cargar desde el disco** (para un archivo borrado, **Conservar mi versión** o **Cerrar archivo**), y no se sobrescribe nada antes de que usted responda. Un guardado hecho por ZPLC nunca se toma por un cambio externo. Los cambios de `zplc.json` hechos fuera de ZPLC todavía no se vigilan.

Nivel de evidencia: host. `packages/zplc-ide/src/project/treeOperations.test.ts` y `packages/zplc-ide/electron/projectWatcher.test.ts` cubren las reglas, y los recorridos 23 y 24 de `bun run test:journeys` controlan la aplicación real.

## Declaraciones y carpetas de biblioteca

Bajo el árbol de archivos, el modo Archivos tiene una sección **Declaraciones**, cerrada hasta que usted la abre. Su encabezado muestra cuántas declaraciones hay y cuántos archivos no se compilan. Lista los programas, bloques de función, funciones, interfaces y tipos de datos que declaran los archivos de texto estructurado, agrupados bajo su archivo, y al elegir uno se abre su archivo con el cursor sobre su nombre.

La compilación lee los archivos de texto estructurado que están directamente en `src` y directamente en cada **carpeta de biblioteca** que `zplc.json` lista en `libraries`, y todo lo que declaran es visible para todos los programas:

```json
{ "libraries": ["lib", "vendor/acme"] }
```

Una biblioteca es una ruta relativa de nombres simples con `/`, dentro del proyecto y listada una sola vez; `src` y `tests` no son bibliotecas. **Carpeta de biblioteca…** en la sección Declaraciones agrega una y escribe `zplc.json`, su **x** la quita, y el árbol de archivos marca la carpeta como `library`. Las declaraciones de una biblioteca aparecen en la lista Declaraciones, en el grupo **Proyecto** de las paletas de diagrama de bloques de función y de escalera, y en el autocompletado y la ayuda emergente del editor de texto estructurado.

Un archivo de texto estructurado que no está en `src` ni directamente en una carpeta de biblioteca no lo lee ninguna compilación. ZPLC lo dice como lo hace la compilación: el archivo se marca como `not compiled` en el árbol, la sección lista su carpeta con un botón **Incluir como biblioteca**, y **Compilar** informa `SOURCE_NOT_COMPILED`. Una carpeta dentro de una biblioteca tampoco se lee; lístela como una biblioteca propia. Una carpeta de biblioteca que se renombra o se borra sigue en la lista, marcada "not in the project", hasta que usted la quita. Un proyecto que espera que se aplique su migración desde la versión 1 no puede cambiar sus bibliotecas hasta que la migración se aplique.

Nivel de evidencia: host. `packages/zplc-ide/src/project/libraries.test.ts` y `packages/zplc-ide/src/project/unlistedSources.test.ts` cubren las reglas, y el recorrido 32 de `bun run test:journeys` lista una biblioteca en la aplicación real y compila el proyecto con ella.

## Archivos de proyecto

**Exportar archivo del proyecto** (en el menú de opciones de compilación) escribe el proyecto abierto en un único archivo zip que usted elige en el diálogo de guardado del sistema. **Importar un archivo de proyecto** (en la pantalla de bienvenida) lo lee de vuelta en un proyecto equivalente:

1. Al elegir el archivo, se lee y no se escribe nada. Un diálogo dice qué contiene (archivos, carpetas y tamaño), de quién es el proyecto y, en un proyecto de la versión 1, las líneas de `zplc.json` que cambia su migración.
2. **Elegir una carpeta e importar** pide una carpeta vacía, escribe allí los archivos byte a byte y abre el proyecto. Una carpeta que no está vacía se rechaza, y una importación que falla deja la carpeta vacía otra vez.

El archivo contiene los archivos tal como están en disco, por lo que ZPLC le pide guardar antes los archivos modificados. Deja fuera lo que el árbol del proyecto oculta (`node_modules`, `.git`, `build`, `dist` y `.vscode`) y los enlaces. Un archivo hecho en una máquina tiene los mismos bytes que uno hecho en otra: entradas ordenadas por ruta, almacenadas sin compresión, con fecha 1980-01-01 y nombres en UTF-8. ZPLC lee archivos que escribieron otras herramientas, almacenados o comprimidos, y rechaza uno que contenga una ruta absoluta, un `..`, un nombre que dos sistemas leen de forma distinta, un enlace, una entrada cifrada, dos archivos que solo difieren en las mayúsculas, un archivo que no coincide con su suma de comprobación, más de 4096 archivos, un archivo de más de 16 MiB o más de 64 MiB en total. **Exportar proyecto**, a su lado, escribe el documento JSON de los archivos y de la configuración sin sus secretos; ese documento no se importa.

Nivel de evidencia: host. `packages/zplc-ide/electron/projectArchiveZip.test.ts` cubre el formato, los rechazos y un viaje de ida y vuelta sobre carpetas reales, y el recorrido 30 de `bun run test:journeys` exporta e importa un proyecto en la aplicación real.

## Cerrar con cambios sin guardar

ZPLC nunca descarta un archivo modificado sin preguntar. Cerrar una pestaña modificada, cerrar el proyecto, cerrar la ventana y salir de la aplicación preguntan cada uno si guardar, descartar o cancelar; **Cancelar** y Escape lo dejan todo como estaba, y un guardado que falla mantiene el archivo abierto y modificado. Cerrar el proyecto ofrece **Guardar todo y cerrar**, **Descartar los cambios y cerrar** y **Seguir editando**. Los atajos de recarga (`Ctrl+R`, `Ctrl+Mayús+R`, `Cmd+R`) no existen en una compilación empaquetada.

## Recuperar trabajo sin guardar

ZPLC guarda una copia de cada archivo modificado en su directorio privado de datos de usuario un segundo después de que usted deja de escribir, y como mínimo cada pocos segundos mientras sigue escribiendo. Guardar un archivo, descartarlo, o cerrar el proyecto o la ventana y responder **Guardar** o **Descartar** elimina la copia, de modo que una salida normal no deja nada.

Si ZPLC se cerró de golpe o falló, abra el proyecto otra vez. Un diálogo **Recuperar cambios sin guardar** lista cada archivo que tenía texto modificado, con la hora en que se guardó la copia. **Restaurar** devuelve el texto al editor, todavía sin guardar; **Descartar** elimina la copia. Cerrar el diálogo no decide nada, y las copias se vuelven a ofrecer la próxima vez. Una copia igual al archivo en disco, o cuyo archivo ya no existe, se elimina sin preguntar.

Límites: un proyecto conserva copias de 64 archivos como máximo y de unos 64 MB de texto, y los cambios de la configuración del proyecto (`zplc.json`) todavía no se copian.

Nivel de evidencia: host. `packages/zplc-ide/electron/recoveryStore.test.ts` cubre el almacén, los mensajes y los tiempos, y el recorrido 19 de `bun run test:journeys` mata la aplicación real con SIGKILL, la inicia de nuevo y restaura el archivo.

## Preferencias

Las preferencias son suyas, no de un proyecto: se aplican a todos los proyectos y se guardan para su cuenta de usuario. Ábralas desde el desplegable **Preferencias** de la pantalla de bienvenida, o en la parte superior de la pestaña Configuración del proyecto dentro de un proyecto.

| Preferencia | Opciones | Por defecto |
| --- | --- | --- |
| Tema | Claro, Oscuro, Alto contraste | Sistema |
| Tamaño de letra del editor | 10 a 32 px | 14 px |
| Tamaño de tabulación | 2, 3, 4 u 8 espacios | 4; la sangría propia de un archivo no la reemplaza |
| Densidad | Cómoda, Compacta | Cómoda; la compacta escala el espaciado de toda la ventana |
| Idioma | Automático, English, Español | Automático: sigue el idioma del sistema operativo (vea [Idioma de la interfaz](#idioma-de-la-interfaz)) |
| Guardado automático | Desactivado, o después de 5, 15, 30 o 60 segundos sin escribir | Desactivado |
| Buscar una versión más reciente al iniciar ZPLC | Activado o desactivado, y un botón **Buscar ahora** | Desactivado |

El guardado automático escribe los archivos modificados con el mismo guardado que **Guardar todo**, sin una línea en Salida por cada guardado. Un archivo que no se puede escribir sigue modificado y se informa. Junto con las copias de recuperación, un cierre inesperado cuesta como máximo lo escrito en el último segundo.

La búsqueda de actualizaciones consulta las versiones de GitHub de este proyecto para obtener la última versión publicada e indica si es más reciente que la compilación en ejecución. No envía nada sobre usted, no descarga nada y no instala nada; la respuesta es una versión y un enlace. No se ejecuta nunca hasta que usted la activa o pulsa **Buscar ahora**.

Nivel de evidencia: host. `packages/zplc-ide/src/utils/appSettings.test.ts`, `packages/zplc-ide/src/store/autosave.test.ts` y `packages/zplc-ide/electron/updateCheck.test.ts` cubren los ajustes, el guardado automático y la búsqueda de actualizaciones, y el recorrido 21 de `bun run test:journeys` los cambia en la aplicación real y la reinicia.

## Idioma de la interfaz

La preferencia **Idioma** elige el idioma de ZPLC: **Automático**, **English** o **Español**. Automático, el valor por defecto, sigue el idioma del sistema operativo (`es`, `es-AR` y `es-MX` dan español; cualquier otro idioma da inglés). La elección se aplica al instante, sin reiniciar, y fija también el idioma de las lecciones de Aprender. El texto en español es español latinoamericano neutro con formas impersonales o de "usted", como en un manual industrial.

El idioma y el tema se guardan además en un archivo pequeño del directorio privado de datos de usuario de ZPLC, de modo que el siguiente arranque ya tiene el idioma del menú y el color de ventana correctos. Un archivo ausente o dañado vuelve al inglés y al tema del sistema.

Nivel de evidencia: host. `packages/zplc-ide/src/i18n/i18n.test.tsx` y `packages/zplc-ide/electron/shellPreferences.test.ts` cubren los catálogos, el ajuste y las preferencias guardadas.

## Menú de la aplicación, paleta de comandos y atajos

ZPLC mantiene una sola lista de comandos, y cada forma de iniciar un comando la lee: el menú de la aplicación, la paleta de comandos, los atajos de teclado, las indicaciones de las descripciones emergentes y la referencia de atajos. Un comando hace, por tanto, lo mismo se inicie desde donde se inicie.

- **Menú de la aplicación.** Archivo, Edición, Ver, Proyecto, Compilación, En línea, Depurar y Ayuda, igual en Windows, Linux y macOS. El menú está en el idioma de la preferencia **Idioma**. Una compilación empaquetada no tiene elemento de recarga ni de herramientas de desarrollo. El menú Ver conserva el zoom de la página: Acercar, Alejar y Tamaño real, en `Ctrl` y más, menos y 0 (`Cmd` en macOS).
- **Paleta de comandos.** Pulse `Ctrl+Mayús+P` (`Cmd+Mayús+P` en macOS), escriba unas letras de un comando, elija con las flechas y pulse Enter. La paleta lista todos los comandos, así que cada uno es accesible desde el teclado aunque no tenga atajo. Un comando que no se aplica ahora, como Cargar sin una conexión, se lista como no disponible y no se ejecuta.
- **Referencia de atajos.** Abra **Ayuda** > **Atajos de teclado**, o pulse `Ctrl+K` y luego `Ctrl+S`, para ver cada comando con su atajo.

| Atajo | Comando |
| --- | --- |
| `Ctrl+S` | Guardar |
| `Ctrl+B` | Compilar el proyecto |
| `F5` | Ejecutar, o reanudar si está en pausa |
| `Mayús+F5` | Detener |
| `F6` | Pausar |
| `F10` | Avanzar un ciclo |
| `F8` | Reiniciar el runtime |
| `Ctrl+Mayús+P` | Paleta de comandos |
| `Ctrl+K`, luego `Ctrl+S` | Atajos de teclado |

`Cmd` reemplaza a `Ctrl` en macOS. Los atajos que actúan sobre un programa (`F5`, `F6`, `F10`, `F8`, `Mayús+F5`) dejan a un campo de texto sus propias teclas.

**Comandos que actúan sobre un dispositivo.** Conectar, Desconectar, Cargar, Ejecutar, Pausar, Detener, Avanzar y Reiniciar ejecutan la misma acción que el botón de la barra de herramientas del mismo nombre, con las mismas comprobaciones y la misma confirmación: Cargar sigue preguntando antes de enviar un programa. Son controles para la persona que está ante el teclado. Las herramientas MCP y el proveedor de IA opcional no tienen acceso a ellos, y no pueden grabar firmware, cargar, forzar, ejecutar ni detener nada.

Nivel de evidencia: host. `packages/zplc-ide/src/commands/commands.test.ts` y `packages/zplc-ide/electron/appMenu.test.ts` comprueban que ningún par de comandos comparte un atajo, que cada elemento de menú y cada entrada de la paleta es un comando registrado, que cada comando tiene un título en ambos idiomas, y la forma del menú en Windows, Linux y macOS con un sustituto de la plataforma. El menú nativo no se ha ejecutado en Windows ni en macOS.

## Simulación y hardware

La simulación nativa es la forma de ejecutar un programa en su computadora. Necesita la aplicación de escritorio, que incluye el runtime nativo. Donde el runtime nativo no puede arrancar, la simulación se ejecuta en el runtime WebAssembly; la barra de estado lo dice y lista lo que no tiene (sin bloques de comunicación, sin serie, sin pines, el tiempo de la ventana de la aplicación). Vea [Runtime de software](../runtime/browser-runtime.md).

Las acciones de hardware son aparte: compilar el firmware del runtime, grabarlo, cargar un programa compilado, y luego ejecutar y depurar. Una persona inicia cada una de ellas. Vea [Cargar un programa](./deployment.md).

## Pausa, reanudación, paso y Stop

La pausa, la reanudación y el paso mantienen el estado lógico del programa donde está, y Detener lo descarta. La tabla vale para la simulación nativa y para el planificador de Zephyr de una placa conectada.

| Acción | Imagen de salida | Forzados | El ciclo |
| --- | --- | --- | --- |
| Pausar | Se conserva | Se conservan | Pausa entre ciclos. |
| Avanzar un ciclo | Se conserva, y muestra el ciclo ejecutado | Se conservan | Ejecuta un ciclo completo, o termina el ciclo detenido en un punto de parada. |
| Reanudar | Se conserva | Se conservan | Un ciclo detenido en un punto de parada continúa desde allí. |
| Detener | A cero | Se borran | Cada tarea vuelve a su punto de entrada, y se descarta un ciclo que interrumpió un punto de parada. |

Una falla borra la imagen y los forzados igual que Detener. En una placa, la pausa, el paso y Detener además llevan las salidas físicas a su estado seguro, apagadas. [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada) tiene la tabla completa y las pruebas de Zephyr que la respaldan, ejecutadas en `native_sim` y QEMU sin medir ninguna placa. Para la simulación nativa, las comprobaciones están en `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, donde Detener también pone a cero la imagen de entrada.

## La tabla de observación

Agregue una variable a la tabla de observación escribiendo su nombre; el campo ofrece las variables y los miembros del programa cargado mientras escribe. Para editar un valor, dele el foco y pulse Enter o `F2`, o haga doble clic. **Enter** escribe el valor, **Mayús+Enter** lo prepara, y **Escribir los valores preparados** escribe de una vez todo lo preparado (**Descartar lo preparado** lo descarta). Un valor preparado nunca se escribe por sí solo. La lista **Formato de visualización** muestra los valores por tipo, en decimal, hexadecimal, binario, como real o como tiempo, y un valor escrito como `16#FF`, `2#101` o `T#1s500ms` se lee en esa notación. El encabezado de una columna ordena las filas, y una tercera pulsación restaura el orden en que se agregaron las variables. **Liberar todos los forzados** se ofrece mientras hay forzados activos.

Nivel de evidencia: host. `packages/zplc-ide/src/components/watchTable.test.ts` cubre los formatos, los valores escritos, el orden y el autocompletado.

## E/S en vivo

Durante una simulación nativa, la pestaña **Observación** se abre sola y empieza con **E/S en vivo**, el panel del programa en ejecución. Lee el mapa de E/S del programa cargado, así que lista cada entrada y cada salida con su propio nombre. Las entradas son cada variable asociada a la imagen de entrada (`AT %IX0.3`, `AT %IW2`) y cada `VAR_INPUT` de un programa; las salidas son cada variable asociada a la imagen de salida (`AT %QX0.5`). Cada fila tiene su tipo, su dirección y su valor en vivo, con el mismo vocabulario que la tabla de observación: TRUE, FALSE y un valor que no se ha leído son cada uno un glifo y una palabra, y un valor forzado dice que está forzado.

Una entrada se opera con el control que corresponde a su tipo:

- Un `BOOL` tiene un interruptor (**Poner TRUE** y **Poner FALSE**) que cambia solo su propio bit, y un pulsador (**Mantener**) que lo deja en TRUE mientras se pulsa, con el ratón o con Espacio o Enter.
- Un entero de hasta 16 bits tiene un control deslizante sobre el rango de su tipo.
- Cada otro tipo numérico tiene una casilla numérica con **Aplicar**.
- Un valor que no cabe en el tipo se rechaza con un mensaje antes de escribir nada.

Un cambio llega al programa en un límite de ciclo, nunca dentro de uno: el runtime pone la escritura en cola y la aplica cuando empieza el ciclo siguiente. La fila dice **Pendiente hasta el próximo ciclo** desde que usted actúa hasta que el runtime tiene el valor, y luego **Aplicado** un momento. Cuando el runtime no puede aplicar un cambio (la simulación está detenida, en pausa o en falla, o el simulador no informa la capacidad), los controles se deshabilitan y el panel dice por qué. Un programa en pausa se edita desde la tabla de observación, cuya escritura se toma al instante. **Forzar** mantiene una entrada en su valor actual, y **Aplicar** cambia entonces el valor forzado, en los tipos de hasta 32 bits; liberar el forzado devuelve la entrada.

Ni el agente ni el servidor MCP pueden operar el panel de E/S en vivo. En hardware, las entradas se fuerzan desde la tabla de observación.

Nivel de evidencia: host, simulación POSIX nativa, no hardware. `packages/zplc-ide/src/runtime/declaredInputs.test.ts` y `packages/zplc-ide/src/components/Faceplate.test.tsx` cubren las listas, la codificación de cada tipo numérico y lo que dice el panel, `test_native_runtime_session.c` demuestra que una escritura espera al inicio del ciclo siguiente, y el recorrido 50 de `bun run test:journeys` opera un interruptor, un pulsador y un control deslizante en la aplicación real.

## Plantas en vivo

La pestaña **Laboratorio** empieza con **Planta en vivo**: el motor, la cinta transportadora, el tanque o el cruce peatonal de una lección, funcionando en lazo cerrado con el programa simulado. Una planta se dibuja como un esquema bidimensional. Lee las salidas del programa y maneja los sensores que el programa lee como entradas, una vez por ciclo: la planta avanza con el contador de ciclos y nunca con un reloj, así que sigue al programa y no a la frecuencia de refresco de la ventana.

Una planta se asocia al programa mediante una asignación explícita, un archivo de datos `plant-map.json` que cada lección que nombra una planta incluye junto a su proyecto inicial. Ninguna señal se encuentra adivinando el nombre de una variable. El panel de E/S en vivo está bajo la planta, así que usted opera una entrada y ve reaccionar a la planta.

**Reanudar** / **Pausar la planta**, **Avanzar un ciclo** (habilitado mientras está en pausa, avanza exactamente un ciclo), **Reiniciar la planta** y las acciones de falla son botones, de modo que el teclado llega a todos. Las acciones de falla son: bloquear el motor; atascar la cinta y hacer que la pieza siguiente sea metálica; hacer fallar la bomba; una persona peatona pulsa el botón y bloquear el cruce. Cada lámpara del dibujo es un glifo y una palabra, nunca solo un color, y nada brilla ni pulsa. El equivalente en texto del estado es el nombre accesible del dibujo y se anuncia cuando cambia la situación, no en cada ciclo.

La planta es determinista: usa aritmética entera en milésimas con un paso fijo, y ningún reloj, número aleatorio ni coma flotante, así que el mismo programa y el mismo guion de entradas dan la misma traza en todas las plataformas. La ejecución registrada de un escenario sigue estando en **Repetición de una ejecución registrada**, que dice que es una repetición de una ejecución registrada del host POSIX nativo.

Nivel de evidencia: host, simulación POSIX nativa, no hardware. `packages/zplc-ide/src/plants/plantEngine.test.ts` cubre cada planta y las trazas de referencia, y el recorrido 51 de `bun run test:journeys` ejecuta la lección del motor en la aplicación real solo con el teclado. Los hashes de las trazas se compararon solo en Linux.

## Límite de la depuración

Las observaciones, las trazas, los puntos de parada y los forzados muestran solo lo que el adaptador conectado puede informar. Una traza del host no es evidencia de hardware, y forzar o ejecutar y detener en un sistema físico necesita autoridad humana explícita y un procedimiento de seguridad de la instalación. Las herramientas de IA y MCP no pueden forzar valores ni cambiar ejecutar y detener; vea [IA y privacidad](./ai-privacy.md).

## Cobertura de enclavamientos declarados

Un proyecto puede declarar pares de salidas que nunca deben estar activas a la vez, en `safety.incompatibleOutputs` de `zplc.json`. La pestaña **Enclavamientos** comprueba que los escenarios guardados afirmen cada par con un `NEVER` exacto, y lista cada par como **Cubierto** o **Falta la cobertura exacta de NEVER**. Necesita un proyecto guardado abierto en la aplicación de escritorio y dice qué hacer cuando no puede ejecutarse. Comprueba los escenarios, no la máquina: no establece seguridad física, tiempo ni certificación. `zplc-cli safety-check` y la herramienta MCP `safety_check` dan la misma respuesta.

Nivel de evidencia: host. `packages/zplc-ide/src/components/InterlockCoverage.test.tsx` renderiza la vista, y el recorrido 33 de `bun run test:journeys` ejecuta la comprobación en la aplicación real.

## Un resultado desde la aplicación, la CLI y las herramientas MCP

Una prueba de escenario da el mismo resultado se ejecute donde se ejecute. La pestaña **Pruebas**, `zplc-cli test`, `zplc-cli scenario-run` y las herramientas MCP `tests_run` y `scenario_run` llaman todas a la misma API de herramientas sobre el mismo runtime nativo con el mismo reloj virtual, de modo que una aserción temporal (`AT`, `WITHIN`, `FOR`, `EVENTUALLY`, `ALWAYS`, `NEVER`, `UNTIL`, `RISING`, `FALLING`) se juzga sobre las mismas muestras. El veredicto, el hash del programa compilado y el hash y la longitud de la traza registrada de cada escenario son iguales, y una aserción que falla falla igual desde cada una, con la CLI saliendo con el código 1.

Nivel de evidencia: host. `packages/zplc-ide/src/cli/scenarioParity.test.ts` ejecuta cada proyecto incluido por la API de herramientas, la CLI, el despachador MCP y el presentador, y compara los resultados. No cubre una placa.

## Notificaciones, mensajes y fallas

- **Notificaciones.** El resultado de una compilación, un guardado, una carga, un cambio de conexión y una ejecución de pruebas aparece abajo a la derecha como una notificación. Cada una dice qué pasó y tiene **Detalles**, que abre el panel con la evidencia: **Salida** para un guardado, una compilación correcta, una carga y una conexión, **Problemas** para una compilación fallida, **Pruebas** para una ejecución de pruebas. Una operación larga muestra una barra de progreso, y una compilación y una ejecución de pruebas muestran además **Cancelar**: una compilación cancelada no conserva ningún artefacto, y una ejecución cancelada detiene su runtime nativo. Un éxito desaparece solo tras unos segundos; una falla, una advertencia y una cancelación permanecen hasta que usted las descarta.
- **Problemas.** La vista Problemas lista primero los errores, luego las advertencias y luego la información, y al activar un problema se abre su archivo en su línea y su columna. Un mensaje escrito en **Salida**, o un problema hallado, mientras otra vista está visible pone un contador en la pestaña de esa vista hasta que usted la abre.
- **Estados vacío, de carga y de error.** Un panel sin nada que mostrar dice por qué y ofrece el paso siguiente. Un indicador de carga aparece solo cuando una operación tarda más de 300 ms. Un estado de error nombra lo que salió mal y tiene un botón de recuperación.
- **Una falla se queda en su región.** Si el editor, el panel inferior o la barra de herramientas lanzan una excepción al dibujarse, esa región muestra qué se detuvo y un botón **Reintentar**, y el resto de la ventana sigue funcionando, así que todavía puede guardar. Si la falla está fuera de toda región, la ventana entera muestra el mismo mensaje con **Reintentar** y una forma de cerrar el proyecto.

Nivel de evidencia: host. `packages/zplc-ide/src/store/notifications.test.ts` y `packages/zplc-ide/src/components/ErrorBoundary.test.tsx` cubren los modelos, y los recorridos 20 y 36 de `bun run test:journeys` rompen regiones y compilaciones en la aplicación real y siguen **Detalles** hasta su panel. Una notificación de carga necesita un dispositivo y ningún recorrido la cubre.

## Accesibilidad

ZPLC está construido para que su ruta principal pueda usarse con un teclado y un lector de pantalla. Esto es lo que demuestran las comprobaciones automáticas, y lo que no.

- **Nombres.** Cada campo de un formulario tiene una etiqueta que un lector de pantalla lee con él, y cada botón que solo muestra un icono tiene un nombre. Una regla de integración continua hace fallar la compilación ante un campo o un botón de solo icono sin nombre.
- **Anuncios.** Dos regiones vivas ocultas, una cortés para los resultados y una asertiva para las fallas, anuncian el resultado de una compilación, un guardado, una carga, una ejecución de pruebas, un cambio de conexión y una variable forzada o liberada. Si el programa está en ejecución se lee en la barra de estado.
- **Teclado.** La ruta desde abrir un proyecto hasta una lección de Aprender se puede completar solo con el teclado: abrir, editar, compilar, simular, observar, forzar, la pregunta de carga y la comprobación de la lección. Tab y Mayús+Tab recorren la pantalla en el orden de lectura, y la paleta de comandos llega a todos los comandos. En el editor de código Tab escribe un tabulador; pulse `Ctrl+M` para que Tab saque el foco, y otra vez para volver. Escape cierra un diálogo y devuelve el foco al control que lo abrió.
- **Controles y densidad.** Todos los controles salen de un solo kit de componentes, y una regla de integración continua hace fallar la compilación ante un control nativo ajeno al kit, una descripción emergente nativa, un color suelto o un texto de menos de 11 píxeles. La preferencia **Densidad** cambia el tamaño de los controles, las filas y el espaciado de toda la ventana.
- **Zoom.** `Ctrl` y más, menos y 0 (`Cmd` en macOS) agrandan, reducen y restablecen la página, desde el menú **Ver**.
- **Qué se comprueba.** El contraste se calcula a partir de los colores de los temas claro, oscuro y de alto contraste, y se ejecuta una comprobación en la aplicación real en Bienvenida, los cuatro editores, cada pestaña del panel de resultados, las barras laterales, la configuración, la paleta, la referencia de atajos y la pregunta de carga, en cada tema. Falla ante un texto por debajo de 4,5 a 1 (3 a 1 para texto grande), un control sin nombre, un control que no muestra nada con el foco, un identificador repetido, una pantalla sin región principal y un diálogo sin nombre. Estas comprobaciones son estructurales y calculadas, no una prueba con un lector de pantalla. Comprobar la ruta principal con un lector de pantalla en Windows y en macOS es una tarea manual que se hace antes de la versión general, y su resultado se registra en la lista de verificación de la versión.

El nivel de evidencia de estas comprobaciones es host: una ventana en Linux, no en Windows ni en macOS.

## Aprender {#learn}

Aprender es el curso interactivo dentro de la aplicación. Tiene un **inicio de Aprender**, una página que muestra el curso y se abre sin ningún proyecto abierto y sin red, y una vista **Aprender** en la barra lateral principal que contiene la lección en la que usted trabaja. Cada lección le da un proyecto inicial en el lenguaje de la lección, recorre las etapas Objetivo, Predecir, Editar, Ejecutar, Observar y Reflexionar, y evalúa su programa guardado contra el escenario de referencia de la lección en la simulación nativa, en un proceso propio que **Cancelar** detiene. Su progreso se guarda en un solo archivo del directorio de datos de usuario, y puede exportarlo e importarlo desde el inicio de Aprender.

Un resultado en Aprender es evidencia de host de la simulación nativa, no evidencia de hardware, y Aprender nunca inicia una operación física. El curso, sus módulos y sus lecciones se describen en [Aprender](../learn/index.md); para el personal docente, vea [Educadores](../learn/educators.md).
