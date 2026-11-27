---
slug: /guides/ai-and-mcp
id: ai-and-mcp
title: Usar un asistente de IA y MCP con seguridad
sidebar_label: IA y MCP
description: 'Dé a un asistente de IA acceso de lectura a un proyecto mediante el servidor MCP local, qué puede pedir, qué nunca puede hacer y cómo revisar lo que propone.'
tags: [how-to, ai, mcp, safety]
---

# Usar un asistente de IA y MCP con seguridad

`zplc-mcp` es un servidor local del Model Context Protocol. Permite que un asistente de IA inspeccione un proyecto, lea el código fuente de sus programas, lo compile, ejecute sus pruebas de escenario y lea la evidencia, de modo que el asistente trabaja con lo que dicen la compilación y el simulador y no con una conjetura. Se ejecuta en su computadora y habla con el asistente por la entrada y la salida estándar. No abre ningún puerto de red ni puerto serie.

:::danger El asistente no puede tocar una máquina
Ninguna herramienta del servidor graba una placa, carga un programa, fuerza un valor, inicia o detiene un dispositivo, abre un puerto serie ni ejecuta un shell (regla 8 de AGENTS.md). Esas acciones quedan en ZPLC, donde las elige una persona. La única herramienta que no es de solo lectura, `firmware_build`, ejecuta una compilación cruzada local y se detiene ahí.
:::

## Qué puede y qué no puede hacer el asistente

| El asistente puede                                                                             | El asistente no puede                                                                     |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Leer el código fuente guardado de sus programas y un resumen del proyecto                      | Leer contenido del editor sin guardar, ni ningún archivo fuera de la carpeta del proyecto |
| Validar el archivo del proyecto, compilar, enumerar símbolos                                   | Escribir fuera del proyecto, escribir una credencial, borrar o renombrar un archivo       |
| Escribir un programa, `zplc.json`, un escenario o los archivos de la planta, verificados antes | Escribir mientras una lección oculta sus soluciones                                       |
| Ejecutar sus pruebas de escenario en el simulador y leer la traza                              | Grabar, cargar, forzar, ejecutar, detener, avanzar un dispositivo ni recuperar una placa  |
| Leer qué lecciones del curso aprobó (un recurso de solo lectura)                               | Cambiar su progreso ni desbloquear una lección                                            |
| Describir las placas del manifiesto, sin sondear hardware                                      | Abrir un puerto serie, un socket o un shell                                               |

La IA dentro de ZPLC sigue el mismo límite y tiene sus propias reglas de datos: vea [IA, privacidad y revisión humana](../ide/ai-privacy.md).

## 1. Iniciar el servidor para una carpeta

El servidor sirve la única carpeta que usted nombra, y nada fuera de ella. La carpeta es la ruta absoluta de un proyecto ZPLC, un directorio real y no un enlace. Un inicio que falla dice por qué en la salida de error y termina con 1, o con 2 cuando la línea de comandos es incorrecta:

| Qué falló                                    | Mensaje                                                                                        | Salida |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| Sin argumentos                               | `ZPLC MCP: no arguments given; start it with a project folder.` y el uso                       | 2      |
| Una ruta relativa                            | `ZPLC MCP: the workspace folder must be an absolute path: <ruta>`                              | 2      |
| Una carpeta que no existe                    | `ZPLC MCP: <ruta> does not exist`                                                              | 1      |
| Una carpeta que no es un proyecto            | `ZPLC MCP: <ruta> is not a ZPLC project: it has no zplc.json`                                  | 1      |
| Un `--repository` o `--user-data` incorrecto | `ZPLC MCP: repository is unavailable: <causa>` o `ZPLC MCP: user data is unavailable: <causa>` | 1      |

`zplc-mcp --version` imprime la versión y termina con 0.

`zplc-mcp --workspace <carpeta> --self-check` imprime un informe JSON: la carpeta, el nombre del proyecto, cuántas herramientas y recursos sirve, las revisiones del protocolo que atiende, si encuentra el simulador del host `zplc_runtime`, el límite de la regla 8 de AGENTS.md, y cada problema con su causa y el paso siguiente. Termina con 0 cuando el servidor está listo y con 1 cuando no. Solo mira archivos: no arranca el servidor, ningún proceso, ninguna placa ni ningún puerto. La herramienta `server_self_check` responde lo mismo, con el nombre del proyecto en lugar de la carpeta.

Los mensajes de la consola de comandos están en inglés.

```bash
zplc-mcp --workspace /home/me/plants/line-3
```

Desde una copia del repositorio, el mismo servidor se ejecuta desde el paquete de la aplicación ZPLC:

```bash
bun run --cwd=packages/zplc-ide mcp --workspace /home/me/plants/line-3
```

Las versiones posteriores a 2.0.0-rc.3 incluyen `zplc-mcp-<versión>-<sistema>-<arquitectura>` como ejecutable independiente, sin firmar, que se verifica como dice la [página de instalación](../getting-started/install.md#verificar-la-descarga). Dos opciones agregan lo que una carpeta de proyecto no puede contener:

- `--repository <directorio>` es una copia del repositorio de ZPLC. `boards_list`, `toolchain_inspect` y `firmware_build` la necesitan. Sin ella responden `MCP_CAPABILITY_UNAVAILABLE`.
- `--user-data <directorio>` es la carpeta donde ZPLC guarda su progreso en las lecciones. El recurso `zplc://course/progress` la necesita, y `zplc://lesson/current` lee de ella si las soluciones están ocultas.

## 2. Conectar un asistente

La mayoría de los clientes que ejecutan un servidor MCP local reciben un comando y sus argumentos en una entrada de configuración. Esta entrada tiene la forma que leen esos clientes. El archivo y su ubicación son del cliente, no de ZPLC.

```json
{
  "mcpServers": {
    "zplc": {
      "command": "zplc-mcp",
      "args": ["--workspace", "/home/me/plants/line-3"]
    }
  }
}
```

### Una acción en la aplicación

Abra el proyecto, luego abra **Preferencias** y busque **Conectar un agente de IA (MCP)**. Elija **Claude Code**, **Cursor** o **VS Code**. El panel muestra el archivo exacto y el texto exacto que escribiría, todo dentro de la carpeta del proyecto:

| Cliente     | Archivo            | Clave             |
| ----------- | ------------------ | ----------------- |
| Claude Code | `.mcp.json`        | `mcpServers.zplc` |
| Cursor      | `.cursor/mcp.json` | `mcpServers.zplc` |
| VS Code     | `.vscode/mcp.json` | `servers.zplc`    |

- **Escribir la configuración** le pide confirmar y luego escribe solo el texto que usted vio. Sus otras entradas se conservan. Si el archivo ya existe, el anterior se guarda al lado como `<archivo>.bak`; la primera copia nunca se sobrescribe, las siguientes son `.bak.1`, `.bak.2` y así hasta diez, y ZPLC se niega a escribir cuando ya hay diez. También se niega a escribir si `.cursor` o `.vscode` es un enlace, para que una escritura nunca salga de la carpeta del proyecto. El nuevo se escribe en un archivo temporal que luego se renombra, así que una falla nunca deja un archivo a medias. Un archivo que no es JSON válido (los comentarios incluidos) se rechaza y se deja como estaba.
- **Copiar el comando** copia la línea `claude mcp add zplc -- zplc-mcp --workspace "<carpeta>"` para Claude Code, o el fragmento de la entrada para Cursor y VS Code.
- La entrada contiene el comando `zplc-mcp`, `--workspace` y, cuando ZPLC la conoce, `--user-data`. Nunca contiene una clave ni un secreto. ZPLC encuentra `zplc-mcp` por sí mismo: primero `ZPLC_MCP_BIN`, que debe ser la ruta completa de un archivo ejecutable, y luego las carpetas de su `PATH`. La entrada contiene la ruta completa que encontró. `zplc-mcp` es un archivo aparte de la versión, no forma parte de la aplicación: descargue el de su sistema. Cuando ZPLC no lo encuentra, el panel lo dice y mantiene apagados **Escribir la configuración** y **Ejecutar la autocomprobación** hasta que defina `ZPLC_MCP_BIN` o agregue su carpeta al `PATH` y vuelva a iniciar ZPLC.
- **Ejecutar la autocomprobación** ejecuta `zplc-mcp --self-check` sobre el proyecto abierto y muestra si está listo, con la causa y el siguiente paso de cada problema. Solo lee archivos: no toca un dispositivo, un puerto serie ni la red.

El panel trabaja sobre la carpeta abierta, así que en una lección rellena por usted la carpeta de la lección, `<userData>/learn-workspaces/<lessonId>`, y la carpeta de `--user-data`. Esa carpeta es `~/.config/zplc` en Linux, `~/Library/Application Support/zplc` en macOS y `%APPDATA%\zplc` en Windows.

### La revisión del protocolo

El servidor atiende las dos eras del protocolo, como lo hace por defecto el SDK que usa. Un cliente de la revisión 2026-07-28 no tiene paso `initialize`: nombra la revisión y sus capacidades en el `_meta` de cada solicitud.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Un cliente de la era 2025, como la 2025-11-25, abre con `initialize`, luego `notifications/initialized`, y enumera las herramientas como antes. El servidor responde con la revisión que el cliente pidió. Una solicitud que no nombra ninguna revisión se atiende como una de esa era anterior.

## 3. Pedir evidencia

Pida lo que devuelve una herramienta, para que cada afirmación del asistente tenga un resultado detrás.

| Pregunta                               | Herramienta o recurso                                               | Qué devuelve                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "¿Es válido este archivo de proyecto?" | `project_validate`                                                  | `ok` y los diagnósticos                                                                                           |
| "¿Compila, y qué necesita?"            | `compiler_check`, `symbols_list`                                    | El tamaño del programa, los diagnósticos, los símbolos públicos                                                   |
| "¿Pasan sus escenarios?"               | `tests_run`, `scenario_run`                                         | Un resultado por escenario, con el hash de su traza                                                               |
| "¿Qué pasó en el ciclo 40?"            | `trace_get`, `runtime_snapshot`                                     | Una traza acotada y saneada de una ejecución registrada                                                           |
| "Muéstreme el programa"                | `zplc://project/programs`, `zplc://project/source/{name}`           | La lista de los programas de `src` con su lenguaje, y el texto y el lenguaje de uno de ellos                      |
| "¿Qué placas están descritas?"         | `boards_list`                                                       | Las placas del manifiesto y su nivel, sin sondear hardware                                                        |
| "¿Qué lecciones están aprobadas?"      | `zplc://course/progress`                                            | Las lecciones aprobadas, cuántas están hechas y cuántas existen                                                   |
| "¿Qué ofrece la planta?"               | `plant_inspect`, `zplc://project/scene`, `zplc://project/plant-map` | Las piezas de la escena, las señales que ofrece, el mapa de planta y los puntos del mapa que el programa no tiene |
| "¿Qué escenarios hay?"                 | `scenarios_list`, `zplc://project/scenario/{scenarioId}`            | Cada escenario con sus tiempos y expectativas, y el archivo completo de uno                                       |
| "¿Qué pide esta lección?"              | `zplc://lesson/current`                                             | El objetivo, los objetivos parciales y las pistas de la lección, nunca su solución                                |
| "¿Cómo se escribe un archivo Ladder?"  | `zplc://formats/{ld,fbd,sfc,scene,plant-map,scenario}`              | El JSON Schema, los valores aceptados y ejemplos resueltos del formato                                            |

[La referencia de MCP](../reference/mcp.md) enumera las 26 herramientas y los 26 recursos. Cada resultado indica su `evidenceLevel` una sola vez, y el servidor da al cliente instrucciones sobre cómo trabajar.

- **Recursos de programas.** Ambos son de solo lectura. Devuelven el código fuente guardado de un programa en cualquiera de los cinco lenguajes, dentro de los límites de tamaño del lector de proyectos. `zplc://project/source/{name}` recibe el nombre de archivo tal como se escribe en el URI (un espacio es `%20`). Un nombre que no está en `src` responde `MCP_NOT_FOUND`, un nombre con un separador responde `MCP_INVALID_ARGUMENTS`, y un proyecto que el lector rechaza responde `MCP_WORKSPACE_UNREADABLE`.
- **Progreso del curso.** El recurso lee el archivo de progreso que guarda ZPLC y responde qué lecciones están aprobadas. No tiene ninguna operación que escriba el progreso, y un archivo de progreso de la primera versión se migra solo en memoria, sin escribirse de nuevo. Sin `--user-data` responde `MCP_CAPABILITY_UNAVAILABLE`.
- **Lección.** `zplc://lesson/current` responde la lección de un espacio de trabajo que ZPLC guarda en `learn-workspaces`: su objetivo, sus objetivos parciales y sus pistas, nunca su solución. Si las soluciones están ocultas se lee del ajuste del aula en `--user-data`; un ajuste ausente o ilegible, o la falta de `--user-data`, significa ocultas, y ninguna herramienta ni argumento lo cambia.
- **Respuestas acotadas.** La escena, el mapa, los escenarios y la lección se recortan a 64 elementos por lista, 256 caracteres por texto y 8 niveles de anidamiento como máximo, e indican `truncated: true` cuando se recortó algo.
- **Trazas.** `trace_get` con solo `scenarioId` responde la traza registrada completa, como en 2.0; una traza de más de 512 KiB responde `MCP_OUTPUT_LIMIT` con los modos que la leen. `mode: "changes"` responde la primera muestra, cada cambio, las muestras de las expectativas fallidas y la última muestra, y una muestra de cambio lleva solo los valores que cambiaron. Cuenta cada cambio de una señal del programa, también los valores REAL; un hecho de planta `fact:` que no es un número entero, como la posición de una caja, cuenta solo cuando `signals` lo nombra; `mode: "window"` responde cada muestra desde `fromMs` o `fromSample` hasta `toMs`, de `limit` en `limit`, con `nextCursor` para la página siguiente (una página que pasaría de 512 KiB se corta a las muestras que caben); `mode: "summary"` responde de cada señal su primer y último valor, sus transiciones, cuándo fue verdadera y el rango de un número. Estos modos devuelven además las entradas que escribió la ejecución (`includeInputs`, activo por defecto), los hechos crudos de la planta y las variables del programa o los miembros de bloques que nombra `watchSignals` (`Program.T1.ET`), leídos después de cada paso. La traza registrada y su `traceSha256` no cambian con el modo que se pida. Un `scenarioId`, un nombre de señal o de variable observada erróneo responde `MCP_NOT_FOUND` con `validValues`, y una traza registrada de más de 16 MiB responde `MCP_TRACE_TOO_LARGE` con un paso siguiente.
- **Escenarios.** Un escenario se ejecuta en el simulador de su computadora, así que su resultado es evidencia de una ejecución simulada, no de la planta.
- **Escribir archivos del proyecto.** `workspace_write` crea o reemplaza de uno a ocho archivos del proyecto: un programa de `src` en cualquiera de los cinco lenguajes, `zplc.json`, un escenario de `tests`, `scene.json` y `plant-map.json`. `workspace_check_write` ejecuta la misma verificación y no escribe nada. Un archivo se escribe solo cuando carga como lo carga ZPLC y el proyecto sigue cargando; un lote rechazado no escribe nada, y cada diagnóstico nombra el archivo, el lugar y los valores aceptados. Un archivo Ladder, FBD o SFC se guarda en la forma estable de los editores. El servidor rechaza una ruta fuera del proyecto, un `..`, una ruta absoluta, un enlace simbólico, cualquier otro archivo y una credencial en `zplc.json` (`MCP_SENSITIVE_FIELD`, que nombra el campo y nunca su valor). Cada archivo se escribe en un archivo temporal a su lado y se renombra, así que un lector ve el archivo anterior o el nuevo; un lote de varios archivos no es atómico como conjunto, y cuando un renombrado falla se restauran los archivos ya escritos. Ninguna herramienta borra ni renombra un archivo: hágalo en ZPLC o en el disco. En una lección que oculta sus soluciones, `workspace_write` se rechaza (`MCP_SOLUTIONS_HIDDEN`).
- **Depurar en la simulación privada.** `debug_session_start` compila el proyecto guardado y arranca en su computadora una simulación que el servidor ejecuta solo para el asistente, en 0 ms sobre un reloj virtual, con la escena y el mapa de planta cuando el proyecto tiene los dos. Responde un `sessionId`, y las otras cinco herramientas lo reciben: `debug_breakpoints` detiene el programa en una línea de ST o IL, o en un escalón o una celda de LD, un bloque de FBD, o una etapa, una transición o una acción de SFC (`rung:r1`, `block:ton_1`, `step:s1`); la detención ocurre en medio del ciclo, en ese lugar. `debug_step` ejecuta un número de ciclos, un tiempo, o hasta un punto de interrupción; `debug_set_inputs` fija entradas del programa por nombre, u opera una señal del panel, emite una pieza o provoca una falla en una parte de la escena; `debug_inspect` lee variables, los miembros de un bloque de función como un `TON`, las etapas SFC activas, y las señales y los hechos de la planta, siempre por nombre, nunca por dirección. Una entrada que maneja la escena se rechaza (`MCP_DEBUG_INPUT_OWNED_BY_PLANT`), y un archivo, un lugar o un nombre erróneo responde `MCP_NOT_FOUND` con `validValues`. Como máximo hay dos sesiones abiertas a la vez (`MCP_DEBUG_SESSION_LIMIT` las nombra); una sesión se detiene tras 300 s sin una llamada, y todas se detienen cuando el cliente se desconecta, con su proceso y sus archivos temporales. Los puntos de interrupción necesitan un proyecto con una sola tarea. Esta simulación nunca llega a la simulación que usted ejecuta en ZPLC, a una placa ni a un puerto serie (regla 8 de AGENTS.md), y sus resultados son evidencia del host, no del hardware. En una lección la sesión ejecuta su propio programa, nunca la solución.

## 4. Revisar lo que propone el asistente

1. Ninguna herramienta ni recurso del servidor cambia su proyecto: todas las herramientas son de solo lectura, y `firmware_build` compila en un lugar efímero. Cuando el cliente del asistente edita archivos, lea el cambio como una diferencia antes de conservarlo.
2. Compile y ejecute los escenarios usted mismo, o pida `compiler_check` y `tests_run` y lea los diagnósticos.
3. Para un cambio que mueve una salida, lea la [página de seguridad](../safety-and-limitations.md) y pida `safety_check`, que comprueba la cobertura de las salidas incompatibles que declara el proyecto, antes de que el cambio se acerque a una placa.
4. Ponga un programa en una placa solo desde ZPLC, donde una persona elige la acción.

La IA dentro de ZPLC lee el programa abierto y un resumen del proyecto, y propone un conjunto de cambios de hasta cuatro archivos que usted revisa y guarda. También propone acciones del editor y ajustes de pantalla que usted aplica con un clic. Un guardado de varios archivos no tiene reversión. Todo eso está en [IA, privacidad y revisión humana](../ide/ai-privacy.md).

## Qué está verificado y qué no

| Parte                                                                                                                                                                                                                                                                  | Verificado                                                                                                                                                                                                                    | Nivel   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| El servidor enumera 15 herramientas al pedírselo; `project_validate`, `compiler_check` y `tests_run` pasan en un proyecto incluido; `boards_list` responde con `--repository`; un cliente que abre con `initialize` de la revisión 2025-11-25 enumera las herramientas | Ejecutado a mano con un script que envía las solicitudes por la entrada y la salida estándar, mediante `bun run --cwd=packages/zplc-ide mcp`, en el proyecto incluido `pico_blinky_ton`; la integración continua no lo repite | Host    |
| El ejecutable compilado inicia y enumera sus herramientas como lo pide un cliente 2026-07-28                                                                                                                                                                           | La compilación de publicación inicia el ejecutable y cuenta las herramientas                                                                                                                                                  | Host    |
| Ninguna herramienta llega a un dispositivo, un socket o un puerto serie                                                                                                                                                                                                | Una prueba enumera las herramientas y recursos registrados del servidor activo y atrapa cada punto de entrada de sockets y de puerto serie                                                                                    | Host    |
| Los dos recursos de programas devuelven el texto y el lenguaje de cada uno de los cinco lenguajes, y rechazan un nombre que no es un programa de `src`, un enlace y un archivo demasiado grande; solo `workspace_write` escribe, dentro del proyecto                   | `packages/zplc-ide/src/mcp/server.test.ts` y `deviceLink.test.ts`                                                                                                                                                             | Host    |
| `workspace_write` escribe los cinco lenguajes, `zplc.json`, un escenario, una escena y un mapa de planta solo cuando pasan `workspace_check_write`, deja un archivo rechazado byte a byte y rechaza una ruta fuera del proyecto, un enlace y una credencial            | `packages/zplc-ide/src/mcp/workspaceWrite.test.ts`                                                                                                                                                                            | Host    |
| El recurso del curso informa las lecciones aprobadas y no escribe nada                                                                                                                                                                                                 | `packages/zplc-ide/src/mcp/server.test.ts`                                                                                                                                                                                    | Host    |
| Un producto de asistente concreto funciona con la entrada de arriba                                                                                                                                                                                                    | Sin verificar: no se ejecutó ningún producto cliente para esta página                                                                                                                                                         | Ninguno |
| El cambio de un asistente es correcto                                                                                                                                                                                                                                  | Nunca se da por supuesto: solo la compilación y los escenarios lo dicen                                                                                                                                                       | Ninguno |

## Vea también

- [La referencia del servidor MCP](../reference/mcp.md) y [Usar la línea de comandos](./command-line.md).
- [IA, privacidad y revisión humana](../ide/ai-privacy.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
