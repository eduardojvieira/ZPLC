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

| El asistente puede                                                        | El asistente no puede                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Leer el código fuente guardado de sus programas y un resumen del proyecto | Leer contenido del editor sin guardar, ni ningún archivo fuera de la carpeta del proyecto |
| Validar el archivo del proyecto, compilar, enumerar símbolos              | Escribir un programa: ninguna herramienta ni recurso del servidor escribe uno             |
| Ejecutar sus pruebas de escenario en el simulador y leer la traza         | Grabar, cargar, forzar, ejecutar, detener, avanzar un dispositivo ni recuperar una placa  |
| Leer qué lecciones del curso aprobó (un recurso de solo lectura)          | Cambiar su progreso ni desbloquear una lección                                            |
| Describir las placas del manifiesto, sin sondear hardware                 | Abrir un puerto serie, un socket o un shell                                               |

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

[La referencia de MCP](../reference/mcp.md) enumera las 18 herramientas y los 26 recursos. Cada resultado indica su `evidenceLevel` una sola vez, y el servidor da al cliente instrucciones sobre cómo trabajar.

- **Recursos de programas.** Ambos son de solo lectura. Devuelven el código fuente guardado de un programa en cualquiera de los cinco lenguajes, dentro de los límites de tamaño del lector de proyectos. `zplc://project/source/{name}` recibe el nombre de archivo tal como se escribe en el URI (un espacio es `%20`). Un nombre que no está en `src` responde `MCP_NOT_FOUND`, un nombre con un separador responde `MCP_INVALID_ARGUMENTS`, y un proyecto que el lector rechaza responde `MCP_WORKSPACE_UNREADABLE`.
- **Progreso del curso.** El recurso lee el archivo de progreso que guarda ZPLC y responde qué lecciones están aprobadas. No tiene ninguna operación que escriba el progreso, y un archivo de progreso de la primera versión se migra solo en memoria, sin escribirse de nuevo. Sin `--user-data` responde `MCP_CAPABILITY_UNAVAILABLE`.
- **Lección.** `zplc://lesson/current` responde la lección de un espacio de trabajo que ZPLC guarda en `learn-workspaces`: su objetivo, sus objetivos parciales y sus pistas, nunca su solución. Si las soluciones están ocultas se lee del ajuste del aula en `--user-data`; un ajuste ausente o ilegible, o la falta de `--user-data`, significa ocultas, y ninguna herramienta ni argumento lo cambia.
- **Respuestas acotadas.** La escena, el mapa, los escenarios y la lección se recortan a 64 elementos por lista, 256 caracteres por texto y 8 niveles de anidamiento como máximo, e indican `truncated: true` cuando se recortó algo.
- **Trazas.** `trace_get` con solo `scenarioId` responde la traza registrada completa, como en 2.0; una traza de más de 512 KiB responde `MCP_OUTPUT_LIMIT` con los modos que la leen. `mode: "changes"` responde la primera muestra, cada cambio, las muestras de las expectativas fallidas y la última muestra, y una muestra de cambio lleva solo los valores que cambiaron; `mode: "window"` responde cada muestra desde `fromMs` o `fromSample` hasta `toMs`, de `limit` en `limit`, con `nextCursor` para la página siguiente; `mode: "summary"` responde de cada señal su primer y último valor, sus transiciones, cuándo fue verdadera y el rango de un número. Estos modos devuelven además las entradas que escribió la ejecución (`includeInputs`, activo por defecto), los hechos crudos de la planta y las variables del programa o los miembros de bloques que nombra `watchSignals` (`Program.T1.ET`), leídos después de cada paso. La traza registrada y su `traceSha256` no cambian con el modo que se pida. Un nombre de señal o de variable observada erróneo responde `MCP_NOT_FOUND` con `validValues`, y una traza registrada de más de 16 MiB responde `MCP_TRACE_TOO_LARGE` con un paso siguiente.
- **Escenarios.** Un escenario se ejecuta en el simulador de su computadora, así que su resultado es evidencia de una ejecución simulada, no de la planta.

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
| Los dos recursos de programas devuelven el texto y el lenguaje de cada uno de los cinco lenguajes, y rechazan un nombre que no es un programa de `src`, un enlace y un archivo demasiado grande; el servidor no tiene ninguna herramienta que escriba                  | `packages/zplc-ide/src/mcp/server.test.ts` y `deviceLink.test.ts`                                                                                                                                                             | Host    |
| El recurso del curso informa las lecciones aprobadas y no escribe nada                                                                                                                                                                                                 | `packages/zplc-ide/src/mcp/server.test.ts`                                                                                                                                                                                    | Host    |
| Un producto de asistente concreto funciona con la entrada de arriba                                                                                                                                                                                                    | Sin verificar: no se ejecutó ningún producto cliente para esta página                                                                                                                                                         | Ninguno |
| El cambio de un asistente es correcto                                                                                                                                                                                                                                  | Nunca se da por supuesto: solo la compilación y los escenarios lo dicen                                                                                                                                                       | Ninguno |

## Vea también

- [La referencia del servidor MCP](../reference/mcp.md) y [Usar la línea de comandos](./command-line.md).
- [IA, privacidad y revisión humana](../ide/ai-privacy.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
