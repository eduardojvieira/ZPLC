---
slug: /ide/features
id: features
title: Entorno de trabajo de Studio
sidebar_label: Entorno de trabajo
description: El editor, el panel inferior, la simulación y el flujo de pruebas de ZPLC Studio 2.0.
tags: [ide, user-guide]
---

# Entorno de trabajo de Studio

El entorno de trabajo mantiene la edición en el centro. Una barra de actividades y una
barra lateral principal, a la izquierda, contienen el navegador del proyecto, la
búsqueda, las pruebas y las lecciones; una barra lateral secundaria opcional, a la
derecha, contiene el Inspector; y un panel de resultados bajo el editor contiene
Output, Problems, Tests, Interlocks, Lab, Changes, Agent, Trace, Watch y Terminal.

## Flujo diario

1. Trabaje en una carpeta de proyecto que usted elija.
2. Compile y resuelva los diagnósticos.
3. Ejecute una prueba temporal o un escenario POSIX nativo y revise su trace.
4. Verifique el origen de los resultados antes de sacar una conclusión.

## Disposición, navegador y editores de configuración

La ventana tiene estas regiones, de arriba abajo: el menú de la aplicación, la barra de
comandos (los controles de compilar, conectar y ejecutar, el nombre del proyecto y el botón
de la paleta de comandos) y, una junto a otra, la **barra de actividades**, la **barra
lateral principal**, el **área del editor** sobre el **panel de resultados** y la **barra
lateral secundaria**; al final, la barra de estado.

- **Barra de actividades.** Proyecto, Buscar, Pruebas y Aprender. Al elegir una, cambia la
  barra lateral principal; la elegida se marca con una barra en su borde y un botón
  relleno, no solo con el color. Pruebas muestra además el panel de resultados de las pruebas.
- **Barra lateral principal.** Permanece visible junto con el panel de resultados. Proyecto
  muestra el navegador; Buscar encuentra texto en el proyecto; Pruebas explica los
  escenarios y abre los resultados; Aprender contiene las lecciones.
- **Barra lateral secundaria.** El Inspector. Es opcional y empieza oculta, para que el editor
  conserve su ancho: se muestra o se oculta con el botón Inspector de la barra de comandos o con
  **Ver > Mostrar u ocultar la barra lateral secundaria**. Las paletas de bloques de los editores de escalera y
  de diagrama de bloques de función permanecen dentro de esos editores.
- **Panel de resultados.** Output, Problems, Tests, Interlocks, Lab, Changes, Agent, Trace,
  Watch y Terminal. Se oculta con **Ver > Mostrar u ocultar el panel de resultados**.

**Ver > Mostrar u ocultar la barra lateral principal** es `Ctrl+Alt+B`, la secundaria es
`Ctrl+Alt+I` y el panel de resultados es `Ctrl+Alt+J` (⌘⌥ en macOS). **Mostrar el navegador
del proyecto** es `Ctrl+Mayús+E` y **Buscar en el proyecto** es `Ctrl+Mayús+F`. Las barras
laterales visibles y la actividad elegida se conservan entre sesiones.

### Navegador por objetos PLC

El navegador tiene dos modos, que se eligen con el conmutador de su encabezado y se recuerdan:

- **Objetos** (el predeterminado) agrupa el proyecto en **Programas**, **Bloques de función**,
  **Funciones**, **Tipos de datos**, **Variables globales**, **Tareas**, **Mapeo de E/S**,
  **Comunicación** y **Dispositivo**. Los cinco primeros salen de la lectura que el compilador
  hace de los archivos de texto estructurado (un archivo que declara varios objetos aparece
  en cada tipo que declara) y, para Programas, de los archivos de diagramas y de lista de
  instrucciones. Los demás salen de `zplc.json`. Al elegir un objeto, se abre su archivo en
  su línea o su editor de configuración.
- **Archivos** es el árbol de archivos con la sección de declaraciones y las carpetas de bibliotecas.

### Editores de configuración

**Tareas**, **Mapeo de E/S**, **Red**, **Comunicación** y **Destino** se abren cada uno en una
pestaña del área del editor, desde el navegador o desde la lista de la pestaña de ajustes.
Cada pestaña contiene el mismo formulario que tenía la página de ajustes, con todos los
ajustes que ofrecía; la pestaña de ajustes conserva los metadatos del proyecto y las
preferencias de la aplicación. Todas las pestañas editan un solo documento, `zplc.json`:
**Guardar la configuración** lo escribe, y cerrar la última pestaña que lo muestra con
cambios sin guardar pregunta si guardar, descartar o seguir editando.

### Búsqueda

La búsqueda encuentra texto en los archivos de texto estructurado y de lista de instrucciones
del proyecto, incluidos los cambios sin guardar, distinguiendo o no mayúsculas, y lista las
coincidencias por archivo. Al elegir una coincidencia, se abre el archivo en esa línea. No
busca en los diagramas, que se guardan como modelos.

### Mover los separadores

Cada separador entre dos regiones es una barra delgada que se resalta bajo el puntero, se
rellena mientras se arrastra y muestra el anillo de foco cuando tiene el foco del teclado.
Con el foco en un separador, las flechas lo mueven 5 puntos, Mayús con una flecha lo mueve 15,
Inicio y Fin lo llevan a sus límites y Intro contrae o restaura el panel contiguo. Un doble
clic restaura el tamaño predeterminado. Cada uno tiene un nombre accesible e informa su
tamaño a las tecnologías de asistencia. Los tamaños de las barras laterales se conservan
entre sesiones, y la división entre el editor y el panel de resultados se conserva por proyecto.

### Tamaños de ventana

La ruta principal (abrir un proyecto, editar, compilar, simular, vigilar) cabe en una ventana
de 1366 por 768 píxeles sin controles recortados. La ventana puede ser tan pequeña como
1024 por 768: por debajo de 1100 píxeles de ancho la barra de actividades muestra solo
iconos, la barra lateral secundaria se oculta y los comandos de tema, ajustes y atajos pasan
al menú **Más comandos** de la barra de comandos.

Nivel de evidencia: host. Las pruebas unitarias de los requisitos UX-011, UX-012, UX-013 y UX-017
(`packages/zplc-ide/src/shell/`, `src/navigator/`, `src/layout/separatorSteps.test.ts`,
`src/store/useConfigEditors.test.ts`, `src/store/useShellLayout.test.ts`) y el recorrido
"The shell fits 1366 by 768 and 1024 by 768, and its separators move from the keyboard"
(`packages/zplc-ide/scripts/journeys.ts`, UX-023) los cubren en el equipo de desarrollo.
No se midió ninguna ventana empaquetada, de macOS ni de Windows.

## Proyectos recientes y restauración de sesión

La pantalla de bienvenida ofrece **Abrir proyecto**, **Nuevo proyecto**, **Aprender** y los ejemplos incluidos. Los ejemplos se agrupan por tema y, dentro de un tema con varios niveles, por nivel (Principiante, Intermedio, Avanzado); los nombres de niveles, lenguajes, placas y temas siguen el idioma de la interfaz. Un proyecto que no se puede abrir se informa en la pantalla, junto a la acción, nunca en un cuadro de mensaje del sistema.

La pantalla de bienvenida lista, en **Recent**, hasta diez carpetas que usted abrió antes, la más reciente primero, cada una con su nombre y la fecha de su última apertura. Al elegir una, se reabre sin diálogo de carpeta. Una carpeta que se movió, se borró o se reemplazó por un enlace aparece como no encontrada, con un botón **Forget** que la quita de la lista. Solo se recuerda una carpeta que usted eligió con el diálogo de carpetas del sistema.

Para cada proyecto, Studio recuerda además las pestañas abiertas, la pestaña activa, la posición del cursor y del desplazamiento de cada archivo, y el tamaño de los paneles del editor y del panel inferior (y si el panel inferior estaba contraído). Los vuelve a poner la próxima vez que se abre esa carpeta, desde **Recent** o con **Open project**. En la sesión solo se guardan rutas y posiciones: el texto sin guardar se conserva aparte y solo se ofrece de nuevo tras un fallo (véase Recuperar trabajo sin guardar), y una pestaña cuyo archivo ya no existe se descarta sin avisar. La lista y las sesiones se guardan en el directorio privado de datos de usuario de Studio, nunca en la carpeta del proyecto, y la sesión de un proyecto que sale de la lista se borra la próxima vez que arranca Studio.

Nivel de evidencia: host. Las pruebas unitarias del requisito IDE-008 (`packages/zplc-ide/electron/recentProjects.test.ts`, `sessionStore.test.ts`, `packages/zplc-ide/src/utils/sessionState.test.ts` y `packages/zplc-ide/src/store/sessionPersistence.test.ts`) cubren la lista y el formato de la sesión, y el recorrido 12 (restaurar la sesión) y el recorrido 14 (un proyecto reciente que ya no está) de `bun run test:journeys` manejan la aplicación real en una pantalla.

## Preferencias

Las preferencias son suyas, no de un proyecto: se aplican a todos los proyectos y se guardan para su cuenta de usuario, de modo que sobreviven a un reinicio. Se abren desde el desplegable **Preferences** de la pantalla de bienvenida, o al principio de la pestaña Project Settings dentro de un proyecto.

| Preferencia | Opciones | Valor inicial |
|---|---|---|
| Theme | Light, Dark, High contrast | Sistema |
| Editor font size | De 10 a 32 px | 14 px |
| Tab size | 2, 3, 4 u 8 espacios | 4; la sangría propia de un archivo no la reemplaza |
| Density | Comfortable, Compact | Comfortable; compact reduce el espaciado de toda la ventana |
| Language | Automático, English, Español | Automático: sigue el idioma del sistema operativo y fija toda la interfaz y las lecciones de Learn (vea [Idioma de la interfaz](#idioma-de-la-interfaz)) |
| Autosave | Desactivado, o tras 5, 15, 30 o 60 segundos sin escribir | Desactivado |
| Check for a newer release when Studio starts | Activada o desactivada, y un botón **Check now** | Desactivada |

El autoguardado escribe los archivos modificados con el mismo guardado que **Save all**, sin una línea en Output por cada guardado; un archivo que no se puede escribir sigue modificado y se informa. Junto con las copias de recuperación, un fallo cuesta como máximo lo escrito en el último segundo.

La comprobación de actualizaciones consulta las versiones publicadas de este proyecto en GitHub y dice si la última es más nueva que la compilación en ejecución. No envía nada sobre usted, no descarga nada ni instala nada; la respuesta es una versión y un enlace. No se ejecuta hasta que usted la activa o pulsa **Check now**.

Nivel de evidencia: host. `packages/zplc-ide/src/utils/appSettings.test.ts`, `src/store/useAppSettings.test.ts`, `src/store/autosave.test.ts`, `electron/updateCheck.test.ts` y `electron/updateCheckIpc.test.ts` cubren las preferencias, el autoguardado y la comprobación de actualizaciones (requisitos IDE-007 e IDE-010), y el recorrido 21 (las preferencias se aplican y persisten por usuario) de `bun run test:journeys` las cambia en la aplicación real y la reinicia.

## Idioma de la interfaz

La preferencia **Language** elige el idioma de Studio: **Automático**, **English** o **Español**. Automático, el valor por defecto, sigue el idioma del sistema operativo (`es`, `es-AR` y `es-MX` dan español; cualquier otro idioma da inglés). La elección se aplica de inmediato, sin reiniciar, y fija también el idioma de las lecciones de Learn y el `lang` de la ventana. El texto en español es español latinoamericano neutro, con formas impersonales o de «usted», como en un manual industrial.

Todo texto de la interfaz está en dos catálogos, `packages/zplc-ide/src/i18n/en.ts` (la fuente) y `es.ts`. Los textos de cada pantalla viven en un módulo propio, `packages/zplc-ide/src/i18n/catalog/<pantalla>.ts` (`console.ts`, `mqtt.ts`, `toolbarMsg.ts`, `examples.ts`, etc.), que reúne los dos idiomas y que `en.ts` y `es.ts` combinan. El nombre del producto se escribe una vez para el renderer (`src/productName.ts`) y una vez para el proceso principal (`electron/productName.ts`); los catálogos y el título de la ventana lo interpolan, y `electron/productName.test.ts` comprueba que ambos coinciden con el título de `index.html`. Para agregar un texto:

1. Agregue la clave y su texto en inglés al módulo de la pantalla (o a `en.ts` si el texto es compartido): un nombre con puntos desde la pantalla hasta el texto (`welcome.open.title`), `{name}` donde va un valor, y un par `.one` y `.other` para una cantidad.
2. Agregue la misma clave, en español, al mismo módulo (o a `es.ts`). Una clave que falta o que sobra es un error de TypeScript, y un `{name}` distinto es un fallo de `tools/ci/i18n-guard.ts`.
3. Escríbalo en el componente con `const { t, tn } = useT()` y `t('welcome.open.title')`, o `tn('explorer.migration.review', count)` para un plural. Fuera de un componente (un menú, un diálogo, un error) use `t` de `src/i18n`.

El texto va en minúsculas salvo la inicial (sentence case), sin signos de exclamación, sin términos internos y, en español, sin voseo (UX-030); la guarda falla ante cualquiera de los cuatro. `bun run lint:ide` ejecuta la guarda: falla ante un texto escrito en un componente (texto JSX, o una cadena en `aria-label`, `placeholder`, `alt`, `label`, `tooltip`, `title` o `description`) y ante un catálogo que incumple esas reglas. Los componentes que aún tienen texto escrito dentro están en `tools/ci/i18n-offenders.json`, una lista que solo puede disminuir.

Nivel de evidencia: host. `packages/zplc-ide/src/i18n/i18n.test.tsx`, `tools/ci/i18n-guard.test.ts` y `src/utils/appSettings.test.ts` cubren los catálogos, la preferencia de idioma y la guarda (requisitos UX-029, UX-030 y UX-031).

## Menú de la aplicación, paleta de comandos y atajos

Studio mantiene una sola lista de comandos, y toda forma de iniciar un comando la lee: el menú de la aplicación, la paleta de comandos, los atajos de teclado, las indicaciones de atajo de las descripciones emergentes y la referencia de atajos. Por eso un comando hace lo mismo desde cualquier lugar.

- **Menú de la aplicación.** Archivo, Edición, Ver, Proyecto, Compilación, En línea, Depuración y Ayuda, en Windows, Linux y macOS por igual (macOS agrega su menú de la aplicación y un menú Ventana). El menú está en el idioma de la preferencia **Idioma** y cambia con ella. Una compilación empaquetada no tiene elementos de recarga ni de herramientas de desarrollo. El menú Ver conserva el zoom de la página: Acercar, Alejar y Tamaño real, con Ctrl y más, Ctrl y menos, y Ctrl y 0 (Cmd en macOS). El menú Edición contiene los elementos del portapapeles y de deshacer del sistema que usan los editores y los campos de texto.
- **Paleta de comandos.** Pulse Ctrl+Mayús+P (Cmd+Mayús+P en macOS), escriba unas letras de un comando, elija con las flechas y pulse «Intro». La paleta lista todos los comandos, de modo que cada uno se alcanza desde el teclado aunque no tenga atajo. Un comando que no aplica ahora (por ejemplo Cargar sin conexión) aparece como no disponible y no se ejecuta.
- **Referencia de atajos.** Abra **Ayuda** > **Atajos de teclado**, o pulse Ctrl+K y después Ctrl+S, para ver cada comando con su atajo. Las descripciones emergentes de la barra de herramientas muestran el mismo atajo después del nombre del botón.

| Atajo | Comando |
|---|---|
| Ctrl+S | Guardar |
| Ctrl+B | Compilar el proyecto |
| F5 | Ejecutar, o reanudar si está en pausa |
| Mayús+F5 | Detener |
| F6 | Pausar |
| F10 | Avanzar un ciclo |
| F8 | Reiniciar el runtime |
| Ctrl+Mayús+P | Paleta de comandos |
| Ctrl+K, después Ctrl+S | Atajos de teclado |

En macOS, Cmd reemplaza a Ctrl. Los atajos que actúan sobre un programa (F5, F6, F10, F8, Mayús+F5) dejan a los campos de texto sus propias teclas.

**Comandos que actúan sobre un dispositivo.** Conectar, Desconectar, Cargar, Ejecutar, Pausar, Detener, Avanzar y Reiniciar ejecutan la misma acción que el botón de la barra de herramientas del mismo nombre, con las mismas comprobaciones y la misma confirmación: Cargar sigue pidiendo confirmación antes de enviar un programa. Elegirlos desde el menú o la paleta no agrega ninguna forma de evitarlas. Son controles para la persona que está ante el teclado: las herramientas MCP y el proveedor de IA opcional no tienen acceso a los comandos y no pueden grabar, cargar, forzar, ejecutar ni detener nada. Un elemento de menú de un comando que el estado actual no ofrece no se ejecuta, y la salida lo indica.

Nivel de evidencia: host. `packages/zplc-ide/src/commands/commands.test.ts` y `electron/appMenu.test.ts` (requisitos UX-014 y UX-015) comprueban que dos comandos no comparten atajo, que cada elemento de menú y cada entrada de la paleta es un comando registrado, que cada comando tiene título en ambos idiomas y la forma del menú en Windows, Linux y macOS con un sustituto de la plataforma. El menú nativo no se ha ejecutado en Windows ni en macOS.

## Estados vacío, de carga y de error

Un panel que no tiene nada que mostrar dice por qué y ofrece el paso siguiente, en lugar de quedar en blanco. Salida, Problemas, Trazado, Variables vigiladas, el Explorador del proyecto, el Inspector y la pestaña Pruebas (cuando no hay una carpeta de proyecto abierta) muestran un título, una frase y un botón. Cuando el botón representa un comando (Compilar el proyecto, Avanzar un ciclo, Conectar, Abrir proyecto) es ese comando, de modo que hace lo mismo que el menú y la paleta y se deshabilita mientras el comando no está disponible. Variables vigiladas ofrece **Agregar una variable** y el Explorador ofrece **Nuevo archivo**.

Un indicador de carga aparece solo cuando una operación tarda más de 300 ms, de modo que un panel rápido nunca muestra un indicador intermitente. Un estado de error nombra lo que falló y tiene un botón de recuperación; el banco de trabajo que no se carga muestra uno con **Reintentar**. Los tres estados son componentes del kit (`EmptyState`, `LoadingState`, `ErrorState`) y aparecen en la galería de componentes de las compilaciones de desarrollo.

## Inicio de la ventana

Studio abre la ventana oculta y la muestra cuando la página ya se pintó, con el color del tema que usted eligió, de modo que un tema oscuro no parpadea en blanco al iniciar. El título de la ventana es el nombre del producto. El idioma y el tema se informan al proceso principal cada vez que cambian y se guardan en un archivo pequeño del directorio privado de datos de Studio, de modo que el siguiente inicio ya tiene el idioma del menú y el color de ventana correctos; un archivo ausente o dañado vuelve al inglés y al tema del sistema.

Nivel de evidencia: host. `packages/zplc-ide/electron/shellPreferences.test.ts`, `src/components/panelStates.test.tsx`, `src/ui/kit.test.tsx` y `src/ui/logic/delay.test.ts` (requisitos UX-016 y UX-021) cubren el color de la ventana, las preferencias guardadas, los estados vacío, de carga y de error y el retraso de 300 ms. La ventana no se ha observado en Windows ni en macOS.

## Archivos y carpetas en el árbol del proyecto

En el modo Archivos del navegador, el encabezado tiene **New File** y **New Folder**. Un clic derecho sobre un archivo o una carpeta (o F2 para renombrar) abre sus acciones:

| Acción | Qué hace |
|---|---|
| **Rename** | Renombra el archivo o la carpeta en disco. Su pestaña abierta, su texto sin guardar y sus puntos de parada lo siguen, y una tarea que ejecuta un programa renombrado se actualiza en `zplc.json` (cuando la configuración del proyecto no tiene ediciones sin guardar). |
| **Duplicate** | Copia un archivo junto al original como `Nombre_copy.ext` (o `_copy2`, y así), a partir del texto que muestra el editor. |
| **Move to...** | Mueve un archivo o una carpeta a otra carpeta del proyecto. Un programa que sale de `src` se avisa: la compilación lee solo los archivos que están directamente en `src`. |
| **Delete** / **Delete folder** | Lo elimina del disco tras una confirmación que nombra los archivos con cambios sin guardar que contiene. |
| **New folder...** | Sobre una carpeta: crea una carpeta dentro de ella. |

Studio rechaza un nombre que ya existe, o que la compilación leería como igual al de otro programa (diferencias de mayúsculas, `main.ld` y `main.ld.json`, el mismo nombre en otra carpeta), y lo dice en el diálogo sin cambiar nada. Una carpeta vacía se muestra en el árbol.

Un cambio hecho fuera de Studio se detecta mientras hay un proyecto abierto. Un archivo sin cambios sin guardar se recarga solo, y uno que se borró se cierra; un archivo con cambios sin guardar pregunta **Keep my version** o **Load from disk** (para un archivo borrado, **Keep my version** o **Close file**) y nada se sobrescribe antes de que usted responda. Un guardado hecho por Studio nunca se toma por un cambio externo. Los archivos nuevos y los eliminados aparecen en el árbol. Los cambios externos a `zplc.json` todavía no se vigilan.

Nivel de evidencia: host. `packages/zplc-ide/src/project/treeOperations.test.ts`, `src/store/useIDEStore.test.ts` (operaciones del árbol, sobre el servicio de proyecto real en una carpeta temporal), `src/store/externalChanges.test.ts`, `electron/projectWatcher.test.ts` y `electron/projectFiles.test.ts` cubren las reglas, y los recorridos 23 (operaciones del árbol del proyecto) y 24 (cambios hechos fuera de Studio) de `bun run test:journeys` manejan la aplicación real.

## Cobertura de enclavamientos declarados

Un proyecto puede declarar pares de salidas que nunca deben estar activas a la vez, en `safety.incompatibleOutputs` de
`zplc.json`. La pestaña **Interlocks** comprueba que los escenarios guardados afirmen cada par con un `NEVER` exacto, y
lista cada par como **Covered** o **Missing exact NEVER coverage**. Es una vista propia, no parte de Problems ni de
Tests. Necesita un proyecto guardado abierto en la aplicación de escritorio y el `zplc.json` vinculado, y dice qué
hacer cuando no puede ejecutarse. Comprueba los escenarios, no la máquina: no establece seguridad física, tiempos ni
certificación. `zplc-cli safety-check` y la herramienta MCP `safety_check` dan la misma respuesta.

Nivel de evidencia: host. `src/components/InterlockCoverage.test.tsx` dibuja la vista,
`workspaceSafetyPresentation.test.ts` cubre la respuesta, y el recorrido 33 de `bun run test:journeys` ejecuta la
comprobación en la aplicación real.

## Un resultado desde Studio, la CLI y las herramientas MCP

Una prueba de escenario da el mismo resultado desde donde se ejecute. La pestaña **Tests** de Studio, `zplc-cli test` y
`zplc-cli scenario-run`, y las herramientas MCP `tests_run` y `scenario_run` llaman a la misma Tool API, sobre el mismo
runtime POSIX nativo con el mismo reloj virtual, de modo que una aserción temporal (`AT`, `WITHIN`, `FOR`,
`EVENTUALLY`, `ALWAYS`, `NEVER`, `UNTIL`, `RISING`, `FALLING`) se juzga sobre las mismas muestras. El veredicto, el hash
del programa compilado, el hash y la longitud de la traza grabada de cada escenario y, donde un punto de entrada las
muestra, las aserciones y las salidas muestreadas son iguales. Una aserción que falla falla igual desde cada uno, y la
CLI termina con código 1.

Nivel de evidencia: host. `src/cli/scenarioParity.test.ts` ejecuta cada proyecto incluido, cada escenario por separado
y un proyecto con una aserción que falla a través de la Tool API, la CLI, el despachador MCP y el presentador de
Studio, y compara los resultados. No cubre una placa.

## Declaraciones y carpetas de biblioteca

Bajo el árbol de archivos, el modo Archivos del navegador tiene una sección **Declarations** (cerrada hasta que usted la abre con su
encabezado, que muestra cuántas hay y cuántos archivos no se compilan). Lista las declaraciones del proyecto: los
programas, bloques de función, funciones, interfaces y tipos de datos que declaran sus archivos Structured Text,
agrupados bajo su archivo. Elegir una abre su archivo con el cursor en su nombre. La lista cubre los archivos que lee la
compilación y sigue lo que usted escribe.

La compilación lee los archivos Structured Text directamente en `src` y directamente en cada **carpeta de biblioteca**
que `zplc.json` lista en `libraries` (CMP-046), y todo lo que declaran es visible para cada programa:

```json
{ "libraries": ["lib", "vendor/acme"] }
```

Una biblioteca es una ruta relativa de nombres simples con `/`, dentro del proyecto, listada una vez; `src` y `tests`
no son bibliotecas. **Library folder...** en la sección Declarations agrega una (y escribe `zplc.json`), su **x** la
quita, y el árbol de archivos marca la carpeta como `library`. Las declaraciones de una biblioteca aparecen en la lista
de Declarations, en las paletas de los editores FBD y LD (el grupo **Project**) y en el autocompletado y el hover del
editor ST.

Un archivo Structured Text que no está en `src` ni directamente en una carpeta de biblioteca no lo lee ninguna
compilación, y Studio lo dice como la compilación: el archivo se marca `not compiled` en el árbol, la sección lista su
carpeta con un botón **List as library**, y **Build** informa `SOURCE_NOT_COMPILED`. Tampoco se lee una carpeta dentro de
una biblioteca; lístela como biblioteca propia. Una carpeta de biblioteca que se renombra o se elimina queda en la
lista, marcada "not in the project", hasta que usted la quita. Un proyecto que espera que se aplique su migración de
versión 1 no puede cambiar sus bibliotecas hasta que se aplique.

Nivel de evidencia: host. `src/project/libraries.test.ts`, `src/project/unlistedSources.test.ts`,
`src/store/projectSources.test.ts` y `src/langsvc/assist.test.ts` cubren las reglas, las fuentes
y los servicios del editor; el recorrido 32 de `bun run test:journeys` lista una biblioteca en la aplicación real,
comprueba el árbol, la paleta de Ladder y el cursor, y compila el proyecto con ella.

## Archivos de proyecto

**Export Project Archive** (menú Build options) escribe el proyecto abierto en un solo archivo, un zip, que usted elige
en el diálogo de guardado del sistema. **Import a project archive** (pantalla de bienvenida) lo vuelve a leer como un
proyecto equivalente:

1. Elegir el archivo lo lee y no escribe nada. Un diálogo dice qué contiene (sus archivos, carpetas y tamaño), de quién
   es el proyecto y, para un proyecto de versión 1, las líneas que cambia la migración en `zplc.json`.
2. **Choose a folder and import** pide una carpeta vacía, escribe allí los archivos byte por byte y abre el proyecto. Una
   carpeta que no está vacía se rechaza, y una importación que falla deja la carpeta vacía otra vez.

El archivo contiene los archivos tal como están en disco, por eso Studio le pide guardar antes los archivos
modificados. Deja fuera lo que el árbol del proyecto oculta (`node_modules`, `.git`, `build`, `dist` y `.vscode`) y los
enlaces. Un archivo hecho en una máquina tiene los mismos bytes que uno hecho en otra: entradas ordenadas por ruta,
guardadas sin compresión, con fecha 1980-01-01 y nombres en UTF-8. Studio lee archivos que escribieron otras
herramientas (guardados o comprimidos) y rechaza uno que contenga una ruta absoluta, un `..`, un nombre que dos
sistemas leen distinto, un enlace, una entrada cifrada, dos archivos que solo difieren en mayúsculas, un archivo que no
coincide con su suma de verificación, más de 4096 archivos, un archivo de más de 16 MiB o más de 64 MiB en total.
**Export Project**, a su lado, sigue escribiendo el documento JSON de los archivos y la configuración (sin sus
secretos); ese documento no se importa.

Nivel de evidencia: host. `electron/projectArchiveZip.test.ts` y `electron/projectArchive.test.ts` cubren el formato,
los rechazos y un viaje de ida y vuelta en carpetas reales; el recorrido 30 de `bun run test:journeys` exporta e importa
un proyecto en la aplicación real y compara las dos carpetas.

## Cerrar con cambios sin guardar

Studio nunca descarta un archivo modificado sin preguntar. Cerrar una pestaña modificada, cerrar el proyecto, cerrar la ventana y salir de la aplicación preguntan, cada uno, si guardar, descartar o cancelar; **Cancel** (y Escape) dejan todo como estaba, y un guardado que falla mantiene el archivo abierto y modificado. Cerrar el proyecto ofrece **Save all and close**, **Discard changes and close** y **Continue editing**. Los atajos de recarga (Ctrl+R, Ctrl+Shift+R, Cmd+R) no existen en una compilación empaquetada: el menú no tiene entrada de recarga y las teclas se descartan. Un entorno de desarrollo solo recarga pasando por la misma pregunta.

Nivel de evidencia: host. El recorrido 10 (cerrar con cambios sin guardar: pestaña y ventana) y el recorrido 22 (Close Project pregunta antes de cerrar) de `bun run test:journeys` manejan la aplicación real; `packages/zplc-ide/electron/appMenu.test.ts` y `closeGuardIpc.test.ts` fijan el menú y los atajos de recarga. El atajo de recarga no se puede inyectar en el proceso principal con el protocolo de DevTools que usan los recorridos, así que la pregunta de recarga está cubierta por pruebas unitarias y por la lectura del manejador registrado, no por un recorrido.

## Recuperar trabajo sin guardar

Studio guarda una copia de cada archivo modificado en su directorio privado de datos de usuario un segundo después de que usted deja de escribir (y como mínimo cada pocos segundos mientras sigue escribiendo). Guardar un archivo, descartarlo, cerrarlo con **Discard**, o cerrar el proyecto o la ventana y responder **Save** o **Discard** elimina la copia, de modo que una salida normal no deja nada.

Si Studio se cerró de golpe o falló, abra el proyecto otra vez: un diálogo **Recover unsaved changes** lista cada archivo que tenía texto modificado, con su nombre y la hora en que se guardó la copia. **Restore** devuelve el texto al editor, todavía sin guardar; **Discard** elimina la copia. Cerrar el diálogo no decide nada y las copias se ofrecen de nuevo la próxima vez. Una copia igual al archivo en disco, o cuyo archivo ya no existe, se elimina sin preguntar. Las copias de los proyectos que salen de la lista Recent se borran cuando arranca Studio.

Límites: un proyecto conserva copias de a lo sumo 64 archivos y unos 64 MB de texto. Los cambios en la configuración del proyecto (`zplc.json`) todavía no se copian.

Nivel de evidencia: host. Las pruebas unitarias del requisito IDE-006 (`packages/zplc-ide/electron/recoveryStore.test.ts`, `recoveryStoreIpc.test.ts`, `packages/zplc-ide/src/store/recoveryPersistence.test.ts`, `src/utils/recoveryOffer.test.ts` y `src/ipc/recoveryBridge.test.ts`) cubren el almacén, los mensajes y los tiempos, y el recorrido 19 (recuperar archivos modificados tras un fallo) de `bun run test:journeys` mata con SIGKILL el proceso de la aplicación real, la arranca de nuevo y restaura el archivo.

## Un fallo se queda en su región

Si el editor, el panel inferior o la barra de herramientas lanzan una excepción al dibujarse, esa región muestra qué se detuvo y un botón **Retry**, y el resto de la ventana sigue funcionando, así que todavía puede guardar sus archivos. **Retry** vuelve a dibujar solo esa región. Si el fallo está fuera de toda región, toda la ventana muestra el mismo mensaje con **Retry** y una forma de cerrar el proyecto; la ventana nunca queda en blanco.

Nivel de evidencia: host. El recorrido 20 (una región que falla no deja la ventana en blanco) de `bun run test:journeys` hace fallar cada una de las tres regiones en la aplicación real, comprueba que las otras dos siguen funcionando y que Retry devuelve la región caída; `packages/zplc-ide/src/components/ErrorBoundary.test.tsx` cubre la lógica de la región.

## E/S en vivo

Durante una simulación nativa, la pestaña **Watch**, que se abre sola al iniciar la
simulación, empieza con **E/S en vivo**: el faceplate del programa en ejecución. Lee el
mapa de E/S del programa cargado, así que lista todas las entradas y todas las salidas
con su propio nombre, sea cual sea. Las entradas son cada variable mapeada a la imagen de
entrada (`AT %IX0.3`, `AT %IW2`) y cada `VAR_INPUT` de un programa; las salidas son cada
variable mapeada a la imagen de salida (`AT %QX0.5`). Cada fila tiene su tipo, su
dirección y su valor en vivo, y una salida se lee con el mismo vocabulario que la tabla
Watch: TRUE, FALSE y un valor que no se ha leído son cada uno un glifo y una palabra, y un
valor forzado dice que está forzado.

Una entrada se opera con el control que corresponde a su tipo. Un BOOL tiene un
interruptor (**Poner TRUE** / **Poner FALSE**) que cambia solo su propio bit, y un
pulsador (**Mantener**) que lo deja en TRUE mientras se pulsa, con el ratón o con
Espacio o Enter, y lo suelta al soltarlo. Un entero de hasta 16 bits tiene un control
deslizante sobre el rango de su tipo; cada otro tipo numérico tiene una casilla numérica
con **Aplicar**, que también admite un valor escrito en los tipos pequeños. Un valor que
no cabe en el tipo se rechaza con un mensaje antes de escribir nada.

Un cambio llega al programa en un límite de scan, nunca dentro de un scan: el runtime
encola la escritura y la aplica cuando empieza el scan siguiente. La fila dice
**Pendiente hasta el próximo scan** desde que se actúa hasta que el runtime tiene el
valor, y luego **Aplicado** un momento, y la aplicación anuncia el cambio aplicado a un
lector de pantalla. Una pulsación y una liberación que caen entre dos scans las ve cada
una un scan completo. Cuando el runtime no puede aplicar un cambio (la simulación está
detenida, en pausa, falló, o el simulador no informa la capacidad) los controles quedan
deshabilitados y el panel dice por qué con palabras. Un programa en pausa puede estar
reteniendo un scan en un punto de interrupción, y un cambio nunca llega a un scan que ya
empezó, así que un programa en pausa se edita desde la tabla Watch, cuya escritura se toma
de inmediato como siempre se tomó la de un depurador. **Forzar** mantiene la entrada en su valor
actual (y **Aplicar** cambia entonces el valor forzado), para los tipos de hasta 32 bits
que transporta un forzado; al liberarlo la entrada vuelve a quedar libre.

El faceplate escribe con la escritura de memoria tipada, en la dirección y con el ancho del
mapa de depuración; el runtime conserva `simulation.input.set` para los tres nombres de
motor de los programas iniciales. Ni el agente ni el servidor MCP pueden operar el
faceplate: no tienen ninguna herramienta que fije una entrada o escriba memoria. En
hardware, las entradas se fuerzan desde la tabla watch.

Nivel de evidencia: host. `packages/zplc-ide/src/runtime/declaredInputs.test.ts`,
`ioMap.test.ts` y `faceplateState.test.ts` cubren las listas, la codificación de cada tipo
numérico, el rango de un control deslizante y el estado pendiente;
`src/components/Faceplate.test.tsx` cubre lo que el faceplate muestra y dice;
`test_native_runtime_session.c` prueba que una escritura espera al inicio del scan
siguiente; y el recorrido 50 de `bun run test:journeys` opera un interruptor, un pulsador
y un control deslizante de un proyecto con nombres propios en la aplicación real, también
solo con el teclado, y ve que la salida del programa lo sigue (requisitos LRN-017,
IDE-024). Evidencia de host POSIX nativo, no de hardware.

## Plantas en vivo

La pestaña **Laboratorio** empieza con **Planta en vivo**: el motor, la cinta transportadora, el tanque o el cruce peatonal de una lección, en lazo cerrado con el programa simulado. Una planta se dibuja como un esquema bidimensional. Lee las salidas del programa (la orden del motor, la cinta, la bomba, las luces) y maneja los sensores que el programa lee como entradas (a velocidad, pieza presente, nivel bajo y alto, atasco, solicitud peatonal), una vez por ciclo del runtime: la planta avanza con el contador de ciclos y nunca con un reloj, de modo que sigue al programa y no la frecuencia de refresco de la ventana.

Una planta se vincula al programa con una asignación explícita, un archivo de datos `plant-map.json` que toda lección que nombra una planta incluye junto a su inicio (`packages/zplc-ide/lessons/<lección>/plant-map.json`): señal de la planta hacia `Programa.Nombre`. El panel ofrece las asignaciones que se vinculan con todos los puntos de E/S del programa cargado; ninguna señal se encuentra adivinando el nombre de una variable. El faceplate queda bajo la planta, de modo que puede accionar una entrada y ver cómo reacciona la planta.

**Reanudar / Pausar la planta**, **Avanzar un ciclo** (disponible en pausa, avanza exactamente un ciclo), **Reiniciar la planta** y las acciones de falla de la planta son botones, por lo que el teclado llega a todos. Las acciones de falla son: atascar el motor; atascar la cinta y hacer metálica la próxima pieza; fallar la bomba; un peatón pulsa el botón y bloquear el cruce. Un botón de falla indica si está activo. Cada luz del dibujo es un símbolo y una palabra (por ejemplo `● ORDEN ACTIVO`, `▲ ATASCO FAULT`), nunca solo color; nada brilla ni pulsa, y el dibujo se redibuja cuando la planta avanza, así que la reducción de movimiento no tiene nada que desactivar. El equivalente en texto del estado (por ejemplo «Motor atascado a 0 milésimas») es el nombre accesible del dibujo, se muestra debajo y se anuncia cuando cambia la situación (atascado, a velocidad, trabado, bajo), no en cada ciclo.

La planta es determinista: usa aritmética entera en milésimas con un paso fijo, y no usa reloj, números aleatorios ni coma flotante, de modo que el mismo programa y la misma secuencia de entradas dan la misma traza en cualquier plataforma. Una prueba de referencia fija el hash de la traza de cada planta.

La ejecución registrada de un escenario sigue disponible bajo **Repetición de una ejecución registrada**, e indica que es una repetición de una ejecución registrada en el host POSIX nativo, no está en vivo y no es evidencia del runtime, del hardware ni de HIL.

Nivel de evidencia: host. `packages/zplc-ide/src/plants/plantEngine.test.ts` cubre cada planta y las trazas de referencia, `plantMap.test.ts` y `lessonPlantMaps.test.ts` la asignación contra el inicio real compilado de cada lección con planta, `plantLoop.test.ts` el lazo cerrado sobre un programa simulado, `plantFacts.test.ts` y `PlantView.test.tsx` el equivalente en texto y los dibujos, y el recorrido 51 de `bun run test:journeys` ejecuta la lección del motor en la aplicación real: acciona una entrada, ve reaccionar la planta, la pausa, avanza y la atasca solo con el teclado, y ve los anuncios y la etiqueta de repetición (requisitos LRN-018; en parte LRN-019, LRN-020, LRN-021, LRN-037). Evidencia del host POSIX nativo, no de hardware. Los hashes de traza no se compararon entre ejecutores de Linux, macOS y Windows: solo se ejecutó en Linux.

## Notificaciones

El resultado de una compilación, un guardado, un despliegue, un cambio de conexión
y una ejecución de pruebas aparece abajo a la derecha de la ventana como una
notificación. Cada una dice qué pasó y tiene **Details**, que abre el panel con la
evidencia: **Output** para un guardado, una compilación correcta, un despliegue y
una conexión; **Problems** para una compilación fallida; **Tests** para una
ejecución de pruebas. Una operación larga (una compilación, una ejecución de
escenarios, un despliegue, una conexión) muestra una barra de progreso mientras
corre, y una compilación y una ejecución de pruebas muestran además **Cancel**: una
compilación cancelada no conserva ningún artefacto, y una ejecución cancelada
detiene su runtime nativo.

Un éxito se va solo tras unos segundos. Un fallo, una advertencia (por ejemplo un
dispositivo que recibió una compilación anterior) y una cancelación permanecen
hasta que usted las descarta. La notificación es un resumen: todos los mensajes que
Studio escribía antes en el panel Output siguen ahí.

Nivel de evidencia: host. `packages/zplc-ide/src/store/notifications.test.ts` cubre
el modelo (progreso, la acción de cancelar, cuánto permanece cada resultado, el
límite de la lista) y `src/components/NotificationsList.test.tsx` el dibujo; el
recorrido 36 de `bun run test:journeys` guarda, compila, conecta, ejecuta y cancela
una ejecución larga de pruebas y rompe la compilación en la aplicación real, y
sigue **Details** de cada notificación hasta su panel (requisito IDE-021). Una
notificación de despliegue necesita un dispositivo y no la cubre ningún recorrido.

## Qué se carga al iniciar

La pantalla de bienvenida es lo primero que muestra Studio, y se carga sin el editor de código, los editores visuales
ni la configuración del proyecto. Cada uno se carga la primera vez que abre un archivo de su tipo o la configuración, y
el área del editor dice "Loading editor..." durante ese instante. Studio incluye la parte de Monaco que usa (el editor,
la búsqueda, el plegado, las sugerencias, el hover, ir a la definición y a las referencias, y la vista de diferencias),
y no sus servicios de lenguaje de CSS, HTML, JSON y TypeScript ni sus otros lenguajes. El instalador no contiene mapas
de fuentes.

Nivel de evidencia: host. `packages/zplc-ide/scripts/welcomeBundle.test.ts` compila Studio y lee los fragmentos que la
página de bienvenida carga al iniciar y los archivos que empaqueta el instalador; el recorrido 29 (la pantalla de
bienvenida no carga ningún editor) de `bun run test:journeys` comprueba lo mismo en el host de desarrollo de la
aplicación real. No se inspeccionó ningún instalador empaquetado.

## Editores

ST es la vía principal con servicio de lenguaje. LD, FBD y SFC abren, editan,
guardan, copian y deshacen sus modelos; el ST que generan es un artefacto, no una
fuente de la que se pueda volver al modelo. IL es una vía de compatibilidad, en
la medida en que el compilador la acepta.

## Simulación y hardware

La simulación POSIX nativa es la forma de ejecutar un programa en su equipo.
Requiere la aplicación de escritorio, que incluye el runtime nativo. Donde el
runtime nativo no puede arrancar, y en la compilación web, la simulación corre en
el runtime WebAssembly, y la barra de estado lo dice y lista lo que no tiene (sin
bloques de comunicación, sin serie, sin pines, con el timing de un navegador):
ver [Runtime del navegador](../runtime/browser-runtime.md). Las acciones de hardware
están separadas: compilar el firmware del runtime, grabarlo, desplegar un
programa compilado y, después, ejecutar o depurar. Una persona inicia cada una.

## Learn

Learn tiene dos partes: el **inicio de Learn**, una página que muestra el curso, y la vista **Learn** de la barra lateral primaria, que contiene la lección en la que usted trabaja. Esto es lo que ofrece hoy:

- Diez lecciones, en español y en inglés (el selector está en el panel; por defecto sigue el idioma de la aplicación). Cada lección es un paquete de datos, `packages/zplc-ide/lessons/<id>/`, con su texto en ambos idiomas, objetivos de aprendizaje, dos niveles de pista, un escenario de referencia con su hash de contenido y el proyecto de ejemplo del que usted parte: un archivo en Structured Text, o un archivo Ladder en la lección 5.
- Las lecciones están en un curso: `packages/zplc-ide/lessons/course.json` enumera en orden los doce módulos del currículo, cada uno con un nivel (Fundamentos, Intermedio, Avanzado), el módulo que requiere y las pistas que ofrece (Simulación, Hardware), y cada lección indica su módulo, nivel, prerrequisitos y pistas en su propio manifiesto. Una lección que no admite una pista explica por qué y qué hacer en su lugar. El generador `bun tools/ci/generate-lesson-index.ts` valida el archivo y la ubicación de cada lección (el módulo existe, mismo nivel, pistas que el módulo ofrece, ningún prerrequisito en un módulo posterior) e incorpora el curso al índice de lecciones generado. Seis módulos todavía no tienen lecciones y quedan vacíos hasta que se escriba el esquema del curso; Studio los muestra vacíos, sin inventar ninguna lección.
- Cada lección recorre seis etapas (en inglés Objective, Predict, Edit, Run, Observe y Reflect), el punto de control esperado de cada etapa permanece oculto hasta que usted lo pide, y las dos pistas se abren a pedido. Cada pista que usted abre queda registrada en su progreso. La solución de referencia se abre solo después de que usted lo confirma, y el progreso registra que la vio.
- **Abrir el espacio de trabajo**, en la vista Learn de la barra lateral (o **Iniciar** en el inicio de Learn), crea el espacio de trabajo de la lección a partir de su proyecto inicial y lo abre, sin paso de copia. La primera vez usted elige una carpeta para él; cada inicio posterior vuelve a abrir la misma carpeta. **Restaurar el proyecto inicial** devuelve los archivos del proyecto inicial después de que usted lo confirma; los archivos que usted agregó se conservan. Usted edita su espacio de trabajo, lo guarda y presiona **Verificar** (**Check** en inglés). Studio ejecuta su programa guardado contra el escenario del paquete de la lección, identificado por su hash de contenido, en un proceso propio que **Cancelar** detiene; los archivos de escenario de su carpeta nunca se leen, de modo que editar un escenario allí no produce un aprobado. Una lección se da por completada cuando todas las aserciones de ese escenario pasaron. Una verificación que falla enumera cada aserción que falló con su instante, los valores esperados y observados, y la dirección de esa muestra en la traza registrada. El registro de calificación contiene el identificador y la versión de la lección, el hash del escenario, el hash del programa, la versión del runtime y la hora. Todavía puede ejecutar el escenario de su carpeta desde **Tests**; esa ejecución no es la calificación.
- Studio guarda su progreso en un único archivo versionado de su directorio de datos de usuario: lecciones aprobadas con su registro de calificación, lecciones en curso, la última lección (el panel la vuelve a abrir), y las pistas y soluciones usadas (la solución de referencia se abre a pedido). El archivo de progreso de una versión anterior se migra y se deja donde estaba. **Exportar progreso** e **Importar progreso** (**Export progress** e **Import progress** en inglés) trasladan, en el inicio de Learn, el documento completo como un archivo; una importación se valida, se combina con la calificación más reciente primero y conserva las lecciones que esta versión no conoce. Un archivo rechazado dice por qué (demasiado grande, no es JSON, no es un archivo de progreso, una versión que este Studio no puede leer, o dañado) y deja su progreso como estaba.
- El **inicio de Learn** es una página propia que se abre sin un proyecto abierto y sin red: desde **Learn** en la pantalla de bienvenida, desde el elemento **Learn** de la barra de actividades y desde **Abrir el inicio del curso** en el menú Ayuda. Enumera las pistas (Simulación, Hardware) y los doce módulos en orden, cada uno con su nivel, el módulo que requiere y su tiempo estimado, y bajo cada módulo sus lecciones con su estado en palabras, nunca solo con color: Bloqueada, Disponible, En curso o Aprobada. Una lección indica qué pistas admite y, para una pista que no admite, por qué y qué hacer en su lugar. **Continuar** retoma la última lección en la que trabajó, o comienza el curso si usted es un estudiante nuevo. Escape o **Cerrar** vuelve al editor, que queda como estaba.
- Una lección está bloqueada hasta que se aprueban las lecciones que requiere, y el inicio dice cuáles. **Desbloquear todas las lecciones**, en el inicio, levanta el bloqueo de todas: es un ajuste guardado y Studio anuncia el cambio. Una lección que usted ya inició o aprobó no vuelve a bloquearse. En la vista Learn de la barra lateral no se puede elegir una lección bloqueada.
- Learn nunca inicia una operación física: solo copia un proyecto y abre **Tests**.
- Un resultado es evidencia de host de la simulación nativa, no evidencia de hardware.

Una vía para una placa de aprendizaje y las lecciones de los seis módulos vacíos son trabajo futuro (los requisitos LRN). Nada de esta página los promete. Para agregar una lección, vea [Contribuir](../contributing/index.md#agregar-una-lección).

Nivel de evidencia: host. `packages/zplc-ide/src/learn/lessonCi.test.ts` ejecuta cada paquete de lección en ambos idiomas (el starter falla su escenario, la solución lo pasa y cada tiempo y valor que cita el texto está en el escenario), `packages/zplc-ide/src/learn/lessonCheck.test.ts` califica programas en el runtime nativo, `packages/zplc-ide/electron/ipcRegistry.test.ts` cubre la verificación de lección y los canales de progreso en el borde IPC, y los recorridos 39 y 39b ejecutan la verificación en la aplicación real.

## Límite de la depuración

Los watches, los traces, los breakpoints y los forces solo muestran lo que el
adaptador conectado puede informar. Un trace en host no es evidencia de hardware
ni de HIL; forzar un valor o cambiar RUN/STOP en un sistema físico exige la
autorización expresa de una persona y un procedimiento de seguridad del sitio.
Las herramientas de IA y MCP no pueden forzar valores ni cambiar RUN/STOP;
consulte [IA y privacidad](./ai-privacy.md).

## Pausa, reanudación, paso y Stop

La pausa, la reanudación y el paso conservan donde está el estado lógico del programa, y Stop lo descarta. La tabla vale para la simulación nativa y para el scheduler de Zephyr de una placa conectada.

| Acción | Imagen de salidas | Forzados | El scan |
|---|---|---|---|
| Pausa | Se conserva | Se conservan | Pausa entre scans. |
| Paso | Se conserva y muestra el scan ejecutado | Se conservan | Ejecuta un scan completo, o termina el scan detenido en un breakpoint. |
| Reanudación | Se conserva | Se conservan | Un scan detenido en un breakpoint continúa desde ahí. |
| Stop | Se pone a cero | Se borran | Cada tarea vuelve a su punto de entrada, y se descarta un scan que un breakpoint interrumpió. |

Una falla borra la imagen y los forzados igual que Stop. En una placa, la pausa, el paso y Stop además llevan las salidas físicas a su estado seguro, apagadas. [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada) tiene la tabla completa y las pruebas de Zephyr que la respaldan, ejecutadas en `native_sim` y QEMU sin medición en una placa. Para la simulación nativa, las verificaciones están en `firmware/lib/zplc_core/tests/test_native_runtime_session.c`, donde Stop además pone a cero la imagen de entradas.

## Accesibilidad

Studio está construido para que su recorrido principal pueda usarse con teclado y con un lector de pantalla. Aquí se indica qué demuestran las comprobaciones automáticas y qué no.

- **Nombres.** Cada campo de un formulario tiene una etiqueta que el lector de pantalla lee con él, y cada botón que muestra solo un icono tiene un nombre. Una regla de CI (la guarda del kit de componentes) hace fallar la compilación ante un campo o un botón de solo icono sin nombre, y una comprobación en la aplicación en ejecución enumera cualquier control sin nombre en las pantallas principales.
- **Anuncios.** Studio mantiene dos regiones vivas ocultas para toda la ventana: una cortés para los resultados y una asertiva para las fallas. El resultado de una compilación, un guardado, un despliegue, una ejecución de pruebas y un cambio de conexión se anuncia por ellas, con su detalle, igual que una variable que se fuerza o se libera. Un error, y un forzado que ya no está confirmado, se anuncian de inmediato. Si el programa está en ejecución o detenido se lee de la barra de estado, que conserva su propio estado persistente.
- **Teclado.** El recorrido desde abrir un proyecto hasta una lección de Learn puede completarse solo con el teclado: abrir, editar, compilar, simular, observar, forzar, la pregunta de despliegue y la verificación de la lección. Tab y Mayús+Tab recorren la pantalla en orden de lectura, y la paleta de comandos (Ctrl+Mayús+P) llega a todos los comandos. Un comando que muestra un panel, como **Mostrar las variables vigiladas**, deja el foco en él. En el editor de código Tab escribe un tabulador; pulse Ctrl+M para que Tab mueva el foco fuera, y púlselo de nuevo para volver. Escape cierra un diálogo, la paleta y la referencia de atajos y devuelve el foco al control que los abrió, y Tab sale de un diagrama después de su último nodo.
- **Zoom.** Ctrl y más, Ctrl y menos, y Ctrl y 0 (Cmd en macOS) amplían, reducen y restablecen la página. Están en el menú **Ver**.
- **Qué se comprueba.** El contraste se calcula a partir de los colores de los temas claro, oscuro y de alto contraste. Además se ejecuta una comprobación en la aplicación real, en Bienvenida, los editores (Texto Estructurado, Ladder, diagrama de bloques de función y gráfico de funciones secuenciales), cada pestaña del panel de resultados, las barras laterales, la configuración, la paleta de comandos, la referencia de atajos y la pregunta de despliegue, en cada uno de los tres temas. Para cada texto visible calcula el contraste con aquello sobre lo que se dibuja (4,5 a 1, o 3 a 1 para texto grande), y falla ante un control sin nombre, un control que no muestra nada cuando tiene el foco del teclado, un identificador repetido, una referencia a algo que no está en la página, una pantalla sin región principal y un diálogo sin nombre. Estas comprobaciones son estructurales y calculadas; no son una prueba con un lector de pantalla. Revisar el recorrido principal con un lector de pantalla en Windows y en macOS es una tarea manual que se hace antes del lanzamiento general, y su resultado se registra en la lista de verificación de la versión.
