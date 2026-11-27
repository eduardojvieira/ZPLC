---
slug: /ide/ai-privacy
id: ai-privacy
title: IA, privacidad y revisión humana
sidebar_label: IA y privacidad
description: Qué envía ZPLC a un proveedor que usted activó, qué oculta y qué no puede automatizar.
tags: [ide, ia, privacidad]
---

# IA, privacidad y revisión humana

La IA es opcional en ZPLC. Puede explicar, planificar y proponer un cambio, y puede sugerir acciones del editor y algunos ajustes de pantalla. No aprueba su propio resultado, no guarda nada y no opera equipos físicos. Cada propuesta le llega como algo que usted revisa y aplica con un clic.

## Camino rápido

1. Seleccione un proveedor y actívelo antes de enviar una solicitud.
2. Lea la vista previa del contexto. Nombra el programa y el resumen del proyecto que se enviarán. Quite todo lo que no quiera enviar.
3. Revise el cambio propuesto archivo por archivo, con el resultado de compilación y de escenarios de la ejecución aislada.
4. Pulse **Guardar cambio revisado** solo para un cambio que acepte.

## Qué lee el asistente

Cada solicitud del asistente integrado (Preguntar, Planificar, Editar y Depurar) puede llevar tres cosas. El host las lee del proyecto guardado, nunca del contenido del editor sin guardar.

- **El programa abierto**, en cualquiera de los cinco lenguajes: texto estructurado (`.st`), lista de instrucciones (`.il`), diagrama de escalera (`.ld.json`), diagrama de bloques de función (`.fbd.json`) o diagrama funcional secuencial (`.sfc.json`), directamente en `src`, hasta 64 KiB. El modo Editar lo necesita guardado y sin modificar, porque la propuesta se comprueba contra él. En los demás modos, un programa que contiene un patrón sensible conocido se deja fuera y la solicitud sigue sin él.
- **Un resumen del proyecto**: la lista de programas de `src` (como máximo 128), las tareas y `zplc.json` sin sus campos sensibles.
- **El contexto del proyecto**, del mismo lector que usa el servidor MCP y con los mismos límites (listas de como máximo 64 elementos, texto de como máximo 256 caracteres):
  - las piezas de la escena y las señales del mapa de la planta, los escenarios de `tests` y lo que espera cada uno;
  - después de una ejecución, las comprobaciones que fallaron (como máximo 4 escenarios, 8 aserciones de cada uno, 8 comprobaciones de cada una) y los hechos de la planta;
  - los diagnósticos con su mensaje (como máximo 256 caracteres), su lugar y el elemento del diagrama, como máximo 32;
  - en una lección, su objetivo, sus metas, la etapa en que va y sus pistas.

  Si la solicitud completa pasara de 128 KiB, ZPLC descarta, en este orden, los turnos anteriores de la conversación, el manifiesto, los escenarios que no fallaron, las piezas de la escena, las muestras de traza más antiguas y las tareas. Se conservan el mensaje, el programa abierto, las comprobaciones fallidas, los diagnósticos y el objetivo de la lección.

El modo Depurar agrega hasta 32 muestras de traza de la ejecución en el host.

En una lección el asistente da primero una pista, y una solución solo cuando usted la pide con claridad y el ajuste de ocultar soluciones está apagado. ZPLC lee ese ajuste en el proceso principal, de un archivo de la carpeta de datos de la aplicación, nunca de la solicitud. Cuando las soluciones están ocultas, o el ajuste no se puede leer, el contexto no lleva ninguna solución ni la última pista, y se le indica al asistente que solo oriente. El asistente nunca marca una lección como aprobada; solo lo hace **Comprobar**.

## Abrir el Asistente desde donde surge la pregunta

El Asistente tiene un solo nombre en toda la interfaz y cuatro formas de entrar. Cada una lo abre con su contexto ya adjunto, como una etiqueta sobre la solicitud que usted puede quitar con **Quitar el contexto adjunto** antes de enviar. La etiqueta agrega campos a la misma solicitud descrita arriba; no es una segunda copia de su proyecto.

| Desde                                                                                                                                                       | Modo      | Qué se adjunta                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| Una fila de la pestaña Problemas, **Explicar con el Asistente**                                                                                             | Depurar   | El diagnóstico: su código, mensaje, archivo, línea, columna y elemento del diagrama                      |
| Una prueba fallida en la pestaña de resultados de pruebas, **Explicar este fallo**                                                                          | Depurar   | La prueba, la expectativa fallida con su instante, y lo esperado y lo observado                          |
| La guía de la lección, **Pedir una pista al Asistente**                                                                                                     | Preguntar | La lección. La solicitud pide una pista y no la solución                                                 |
| El menú contextual de un editor de Texto estructurado o de Lista de instrucciones, o **Preguntar al Asistente sobre la selección** en la paleta de comandos | Preguntar | Las líneas seleccionadas o, en un diagrama, el peldaño, el bloque, el paso o la transición seleccionados |

Los botones aparecen solo mientras haya un proveedor de IA configurado. Usted puede cambiar el modo y editar la solicitud antes de enviarla.

Los botones de modo son **Preguntar**, **Planificar**, **Editar** y **Depurar** (**Ask**, **Plan**, **Edit** y **Debug** en inglés); al pasar el puntero sobre uno se lee cuándo usarlo.

Un archivo, una línea o un elemento que la respuesta nombra (`src/Main.st:14`, `rung:r1`) es un botón cuando el proyecto abierto lo tiene, y un clic abre ese lugar. El texto que solo parece un lugar queda como texto. El Asistente nunca dice que una lección está aprobada: eso solo lo hace **Comprobar**.

**Preguntas de seguimiento.** El Asistente recuerda los últimos tres intercambios de la conversación, para que usted pueda pedir una pista y luego continuar sin explicar de nuevo. Se conservan solo en la ventana, de a lo sumo 2 KiB cada uno, y una respuesta anterior que contenga algo parecido a una clave no se vuelve a enviar. **Nueva conversación** empieza de nuevo, y también lo hace abrir otro proyecto.

## Qué no recibe nunca el asistente

| Elemento                                    | Comportamiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuración y clave del proveedor         | El endpoint y la clave nunca están en los mensajes enviados al modelo. La clave se usa solo como credencial de la solicitud. El nombre del modelo se envía al endpoint porque la solicitud lo necesita                                                                                                                                                                                                                                                                                                                                                               |
| Campos sensibles de `zplc.json`             | Se quitan `network.wifi.password`, `communication.mqtt.password`, `communication.mqtt.azureSasKey`, `communication.mqtt.clientKeyPath` y `communication.mqtt.awsClaimKeyPath`. También se quita todo campo cuyo nombre contenga password, passwd, pwd, secret, token, credential, apikey, accesskey, privatekey, saskey, clientkey, bearer o psk, o termine en pass, en cualquier combinación de mayúsculas y minúsculas, con valor o sin él. La regla es más amplia que la del propio proyecto a propósito: también se oculta un campo inofensivo con un nombre así |
| Ajustes de la aplicación                    | El guardado automático, la comprobación de actualizaciones, el desbloqueo de lecciones y ocultar soluciones no están en el contexto, y el asistente no puede proponerlos                                                                                                                                                                                                                                                                                                                                                                                             |
| Contenido del editor sin guardar            | No se envía. El host vuelve a leer el archivo guardado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Terminal, puerto serie, dispositivo o shell | Ningún campo de una solicitud puede nombrar uno. Lo que quede fuera de los campos de la solicitud (espacio de trabajo, modo, mensaje, archivo activo, diagnósticos, traza, el contexto del proyecto y los últimos intercambios de la conversación) se rechaza antes de llamar al proveedor                                                                                                                                                                                                                                                                           |

## Límite de datos

| Elemento                | Comportamiento de ZPLC                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dirección del proveedor | Una dirección `https://`, o un modelo en este equipo por `http://` exactamente en `localhost`, `127.0.0.1` o `[::1]`. Se rechaza cualquier otra dirección, un nombre que solo empieza como `localhost`, una redirección, un usuario o una consulta. Un endpoint local no necesita clave y no se envía ninguna salvo que usted la guarde. Ejemplos: `https://api.openai.com`, `http://localhost:11434`, `http://localhost:1234`                   |
| Prueba de conexión      | **Probar la conexión** en los ajustes del Asistente envía a la dirección guardada una solicitud con la palabra `ping` y pide un solo token de respuesta, sin datos del proyecto. Responde cuánto tardó o qué falla y qué hacer: la dirección, la clave, el modelo, el límite de uso, el servidor o la red. Una dirección no permitida recibe un mensaje claro: use https, o http solo hacia localhost, 127.0.0.1 o [::1]. Nunca muestra la clave |
| Clave del proveedor     | Se guarda mediante la integración de almacenamiento seguro o bóveda del sistema operativo                                                                                                                                                                                                                                                                                                                                                        |
| Contexto automático     | El programa abierto y el resumen del proyecto de arriba, con límites de tamaño. Un patrón sensible conocido en el mensaje, los diagnósticos o la traza rechaza la solicitud antes de cualquier llamada al proveedor. En el modo Editar, el mismo patrón en el programa abierto también la rechaza. En los demás modos, el programa, las tareas y el manifiesto que contienen ese patrón se dejan fuera sin aviso, y la solicitud sigue sin ellos |
| Aviso en el mensaje     | ZPLC le advierte que no pegue secretos                                                                                                                                                                                                                                                                                                                                                                                                           |
| Cambio candidato        | Se mantiene aislado hasta que usted lo revisa y lo guarda                                                                                                                                                                                                                                                                                                                                                                                        |
| Mensaje de éxito        | Se deriva de la evidencia del compilador, de las pruebas y de la simulación, no de la prosa del proveedor                                                                                                                                                                                                                                                                                                                                        |

## Qué puede proponer el asistente

### Un conjunto de cambios de hasta cuatro archivos

En el modo Editar una propuesta es un conjunto de cambios de como máximo cuatro archivos. Cada archivo reemplaza un programa de `src`, crea un programa nuevo en `src` o reemplaza `zplc.json`. No se ofrece eliminar un archivo. Antes de que usted vea el conjunto:

- Un archivo de escalera, FBD o SFC tiene que cargarse como lo cargan los editores. Si no, la respuesta se muestra como no válida, con hasta cinco infracciones, y no se revisa nada. Un archivo que carga se reescribe en la forma estable propia de los editores.
- `zplc.json` se reescribe como lo escribe ZPLC. Se rechaza un cambio que fije un valor en un campo sensible, y también un archivo nuevo cuyo nombre la compilación lea como un programa existente.
- El conjunto completo se compila y se ejecuta con los escenarios del proyecto sobre una copia del proyecto guardado, en la simulación del host. El proyecto en disco no se toca con esta ejecución.

El documento de revisión del área del editor muestra entonces una diferencia por archivo, marcada como modificada o nueva. El botón **Guardar cambio revisado** aparece solo cuando la ejecución aislada pasó. Un programa nuevo necesita su propia tarea en el cambio de `zplc.json` del mismo conjunto, porque una tarea ejecuta exactamente un programa. Se le dice así al asistente, pero un programa sin tarea sigue permitido.

### No se escribe nada antes de guardar

Hasta que usted pulse **Guardar cambio revisado**, no se escribe ningún archivo, nada se carga en el editor como cambio sin guardar y, por lo tanto, el guardado automático no tiene nada que guardar. Si un archivo cambió en disco, o usted editó un archivo afectado, después de llegar la respuesta, la revisión dice que ya no está vigente y usted revisa de nuevo. Un archivo afectado con cambios suyos sin guardar debe guardarse primero.

### El guardado escribe archivo por archivo y no se revierte

**Guardar cambio revisado** escribe primero los programas nuevos, luego los programas reemplazados y `zplc.json` al final, con el mismo guardado que usted usa. Si una escritura falla, los archivos posteriores no se escriben y los anteriores quedan escritos. No hay reversión. La pestaña Cambios dice que la revisión no pudo completarse, y Salida lleva una línea que nombra el archivo donde se detuvo el guardado y dice cuántos archivos se escribieron, estuviera o no abierto el archivo. El almacén puede agregar su propia línea de falla, por ejemplo `Failed to save Main.st: …`. Revise el proyecto antes de compilar y use su control de versiones para volver al estado anterior.

### Acciones del editor y ajustes de pantalla

Una respuesta también puede traer hasta seis propuestas, cada una mostrada como un botón con una etiqueta que dice qué hará:

- abrir un archivo de programa, ir a una línea suya, o seleccionar un peldaño, bloque, paso o transición de un diagrama de escalera, FBD o SFC;
- compilar, generar texto estructurado a partir del diagrama abierto, o cambiar al simulador, que se ofrece solo mientras no haya un dispositivo conectado;
- fijar el tema, el idioma, la densidad, el tamaño de fuente del editor o el tamaño de tabulación. El botón muestra el valor actual y el propuesto.

Cada propuesta se comprueba contra su proyecto al llegar. El archivo, la línea o el elemento tiene que existir; si no, el botón queda desactivado y dice por qué. Nada se ejecuta hasta que usted pulsa, y entonces se ejecuta como lo haría su propio clic: la misma navegación que un problema de la pestaña Problemas, el mismo comando que el menú, el mismo ajuste que la pantalla de configuración.

Nunca se puede proponer:

- ningún comando que actúe sobre un dispositivo (conectar, desconectar, cargar, ejecutar, pausar, detener, avanzar, reiniciar);
- el cambio al simulador mientras hay un dispositivo conectado, porque lo desconectaría;
- la descarga de un programa, el modo de hardware, la configuración del proveedor y su clave, la comprobación de actualizaciones, el guardado automático, el desbloqueo de lecciones y ocultar soluciones.

Una respuesta que contenga alguno de ellos se muestra como no confiable y no ofrece ningún botón. El proveedor no puede devolver llamadas a herramientas: una respuesta que lleve una se rechaza.

## Límite importante

El rechazo de patrones conocidos es una salvaguarda, no una garantía. Un literal secreto arbitrario que no coincida con un patrón conocido aún puede enviarse al proveedor seleccionado. No introduzca credenciales, claves privadas, direcciones de producción ni registros sensibles sin procesar. Revise las condiciones del proveedor y la política de su organización antes de activar un proveedor.

## Límite físico

La IA y el servidor MCP local pueden inspeccionar, validar, compilar, probar, simular y leer trazas y evidencia acotadas. No pueden grabar firmware, cargar un programa en el hardware, forzar valores, cambiar RUN o STOP, hacer una recuperación, abrir un puerto serie sin procesar ni ejecutar un shell (regla 8 de AGENTS.md). Esas acciones siguen siendo flujos humanos explícitos de la interfaz de ZPLC.

### Sin camino hacia el enlace con el dispositivo

Las herramientas del servidor MCP local son fijas: `project_inspect`, `project_validate`, `compiler_check`, `compiler_compile`, `symbols_list`, `safety_check`, `tests_run`, `scenario_run`, `simulation_start`, `simulation_step`, `runtime_snapshot`, `trace_get`, `boards_list`, `toolchain_inspect` y `firmware_build`. Ninguna recibe un puerto, un dispositivo o una sesión, ninguna abre un puerto serie ni un socket, y el programa que las sirve se compila sin los módulos que lo hacen.

Una solicitud al proveedor de IA lleva el espacio de trabajo, el modo, el mensaje, el archivo activo, los diagnósticos, las muestras de traza y el contexto del proyecto (comprobaciones fallidas, hechos de la planta, una selección, la lección en que está y el idioma de la interfaz), cada uno validado y acotado. Nunca lleva una dirección, un puerto, una sesión ni el ajuste de ocultar soluciones. El archivo activo es un programa de `src` en cualquiera de los cinco lenguajes. Todo lo demás se rechaza antes de llegar al proveedor.

Una prueba enumera las herramientas y los recursos registrados del servidor activo, comprueba el grafo de módulos del servidor y del proveedor, y ejecuta las herramientas con una trampa en cada punto de entrada de sockets y de puerto serie (`packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`). El servidor MCP local también tiene dos recursos de solo lectura que devuelven el texto y el lenguaje de un programa, y un recurso de solo lectura para su progreso en el curso. Ninguna herramienta ni recurso del servidor escribe un programa. Vea [Usar un asistente de IA y MCP con seguridad](../guides/ai-and-mcp.md).

## Evidencia antes de aceptar

Un candidato útil incluye sus diagnósticos, el resultado de compilación, el resultado de los escenarios y la traza cuando exista. La prosa del proveedor es explicación. Las herramientas son la fuente de verificación. Si falta la evidencia o falla, rechace o revise el candidato.

## Qué está verificado y qué no

| Parte                                                                                                                                                                                                                                                                                                                                              | Verificado                                                                                                                                                 | Nivel   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| La solicitud lleva el programa abierto de cada uno de los cinco lenguajes en todos los modos y un resumen del proyecto sin campos de credenciales, y ninguno de los ajustes ni de la configuración del proveedor                                                                                                                                   | `packages/zplc-ide/electron/aiProvider.test.ts` y `electron/security.test.ts`                                                                              | Host    |
| Un conjunto de cambios tiene como máximo cuatro archivos, crea, reemplaza y cambia `zplc.json`, y rechaza una credencial, un choque de nombres, un modo incorrecto y un cambio con un campo que no conoce; las demás claves de la respuesta se ignoran, salvo las llamadas a herramientas y un `replacement` en el nivel superior, que se rechazan | `electron/aiProvider.test.ts`, `electron/security.test.ts`, `src/cli/changeSet.test.ts`                                                                    | Host    |
| Los archivos de escalera, FBD y SFC se validan y normalizan, y el manifiesto se escribe como lo escribe ZPLC                                                                                                                                                                                                                                       | `src/ai/changeSetPrepare.test.ts`, `src/components/agent/agentResponse.test.ts`                                                                            | Host    |
| El conjunto de cambios se compila y se prueba con escenarios sobre una copia, y la base no se escribe                                                                                                                                                                                                                                              | `src/cli/changeSet.test.ts` en el runtime POSIX nativo                                                                                                     | Host    |
| La revisión muestra cada archivo, nada se escribe ni se carga en el editor antes de Guardar, y Guardar escribe los programas nuevos, los reemplazados y el manifiesto en ese orden y se detiene en la primera falla                                                                                                                                | `src/components/agent/changeSetReview.test.ts`, `src/components/ConsoleChangesTrace.dom.test.tsx`                                                          | Host    |
| Un clic guarda el cambio revisado por una persona en la aplicación en ejecución, y ZPLC funciona sin el asistente                                                                                                                                                                                                                                  | Recorrido 43 de `bun run smoke:journeys`                                                                                                                   | Host    |
| Las propiedades de seguridad de la aplicación en ejecución se cumplen                                                                                                                                                                                                                                                                              | Recorrido 38 de `bun run smoke:journeys`                                                                                                                   | Host    |
| Ninguna propuesta puede ser un comando físico, la descarga, el modo de hardware o un ajuste fuera de los cinco, y el cambio al simulador no se ofrece mientras hay un dispositivo conectado; cada una se ejecuta solo con un clic                                                                                                                  | `src/ai/proposals.test.ts` (comprobado contra el registro de comandos), `src/components/agent/editorProposals.test.ts`, `ConsoleChangesTrace.dom.test.tsx` | Host    |
| El asistente no puede abrir el enlace con el dispositivo                                                                                                                                                                                                                                                                                           | `packages/zplc-ide/src/mcp/deviceLink.test.ts`, `packages/zplc-ide/electron/aiDeviceLink.test.ts`                                                          | Host    |
| Un proveedor o modelo concreto responde en el formato descrito aquí, o escribe un cambio correcto                                                                                                                                                                                                                                                  | Sin verificar: las pruebas usan un proveedor simulado, y no se ejecutó ningún proveedor para esta página                                                   | Ninguno |
| Un cambio del asistente es correcto para su planta                                                                                                                                                                                                                                                                                                 | Nunca se da por supuesto: solo la compilación y los escenarios dicen algo, y se ejecutan en el host                                                        | Ninguno |
