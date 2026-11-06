---
slug: /guides/ai-and-mcp
id: ai-and-mcp
title: Usar un asistente de IA y MCP con seguridad
sidebar_label: IA y MCP
description: 'Dé a un asistente de IA acceso de lectura a un proyecto mediante el servidor MCP local, qué puede pedir, qué nunca puede hacer y cómo revisar lo que propone.'
tags: [how-to, ai, mcp, safety]
---

# Usar un asistente de IA y MCP con seguridad

`zplc-mcp` es un servidor local del Model Context Protocol. Permite que un asistente de IA inspeccione un proyecto, lea el código fuente de sus programas, lo compile, ejecute sus pruebas de escenario y lea la evidencia, de modo que el asistente trabaja con lo que dicen la compilación y el simulador y no con una conjetura. Se ejecuta en su computador y habla con el asistente por la entrada y la salida estándar. No abre ningún puerto de red ni puerto serie.

:::danger El asistente no puede tocar una máquina
Ninguna herramienta del servidor graba una placa, carga un programa, fuerza un valor, inicia o detiene un dispositivo, abre un puerto serie ni ejecuta un shell (regla 7 de AGENTS.md). Esas acciones quedan en ZPLC, donde las elige una persona. La única herramienta que no es de solo lectura, `firmware_build`, ejecuta una compilación cruzada local y se detiene ahí.
:::

## Qué puede y qué no puede hacer el asistente

| El asistente puede | El asistente no puede |
| --- | --- |
| Leer el código fuente guardado de sus programas y un resumen del proyecto | Leer contenido del editor sin guardar, ni ningún archivo fuera de la carpeta del proyecto |
| Validar el archivo del proyecto, compilar, enumerar símbolos | Escribir un programa: ninguna herramienta ni recurso del servidor escribe uno |
| Ejecutar sus pruebas de escenario en el simulador y leer la traza | Grabar, cargar, forzar, ejecutar, detener, avanzar un dispositivo ni recuperar una placa |
| Leer qué lecciones del curso aprobó (un recurso de solo lectura) | Cambiar su progreso ni desbloquear una lección |
| Describir las placas del manifiesto, sin sondear hardware | Abrir un puerto serie, un socket o un shell |

La IA dentro de ZPLC sigue el mismo límite y tiene sus propias reglas de datos: vea [IA, privacidad y revisión humana](../ide/ai-privacy.md).

## 1. Iniciar el servidor para una carpeta

El servidor sirve la única carpeta que usted nombra, y nada fuera de ella. La carpeta es la ruta absoluta de un proyecto ZPLC, un directorio real y no un enlace. Con cualquier otra carpeta, el servidor imprime `ZPLC MCP workspace is unavailable` y termina con 1.

```bash
zplc-mcp --workspace /home/me/plants/line-3
```

Desde una copia del repositorio, el mismo servidor se ejecuta desde el paquete de la aplicación ZPLC:

```bash
bun run --cwd=packages/zplc-ide mcp --workspace /home/me/plants/line-3
```

Las versiones posteriores a 2.0.0-rc.3 incluyen `zplc-mcp-<versión>-<sistema>-<arquitectura>` como ejecutable independiente, sin firmar, que se verifica como dice la [página de instalación](../getting-started/install.md#verificar-la-descarga). Dos opciones agregan lo que una carpeta de proyecto no puede contener:

- `--repository <directorio>` es una copia del repositorio de ZPLC. `boards_list`, `toolchain_inspect` y `firmware_build` la necesitan. Sin ella responden `MCP_CAPABILITY_UNAVAILABLE`.
- `--user-data <directorio>` es la carpeta donde ZPLC guarda su progreso en las lecciones. El recurso `zplc://course/progress` la necesita.

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

El servidor habla una sola revisión del protocolo, la 2026-07-28, y ninguna anterior. Su punto de entrada inicia el transporte con `legacy: 'reject'`, donde el SDK que usa serviría por defecto el protocolo de enlace inicial de 2025. El repositorio no registra el motivo de esa elección, así que tómela como el estado actual del servidor y no como una promesa. Un cliente no tiene paso `initialize`: nombra la revisión y sus capacidades en el `_meta` de cada solicitud.

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

Un cliente que abre con `initialize` de una revisión anterior recibe esta respuesta. La conexión sigue abierta para una solicitud de la revisión admitida.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32022,
    "message": "Unsupported protocol version: 2025-06-18",
    "data": { "supported": ["2026-07-28"], "requested": "2025-06-18" }
  }
}
```

Una solicitud que no nombra ninguna revisión recibe el mismo código y el mensaje `Unsupported protocol version: the request did not name a protocol version`. Una solicitud que nombra la revisión pero omite `io.modelcontextprotocol/clientCapabilities` recibe `-32602` y `Invalid _meta envelope for protocol revision 2026-07-28: io.modelcontextprotocol/clientCapabilities: missing`. En cada caso, quien debe actualizarse es el cliente. El servidor no cambia.

## 3. Pedir evidencia

Pida lo que devuelve una herramienta, para que cada afirmación del asistente tenga un resultado detrás.

| Pregunta | Herramienta o recurso | Qué devuelve |
| --- | --- | --- |
| "¿Es válido este archivo de proyecto?" | `project_validate` | `ok` y los diagnósticos |
| "¿Compila, y qué necesita?" | `compiler_check`, `symbols_list` | El tamaño del programa, los diagnósticos, los símbolos públicos |
| "¿Pasan sus escenarios?" | `tests_run`, `scenario_run` | Un resultado por escenario, con el hash de su traza |
| "¿Qué pasó en el ciclo 40?" | `trace_get`, `runtime_snapshot` | Una traza acotada y saneada de una ejecución registrada |
| "Muéstreme el programa" | `zplc://project/programs`, `zplc://project/source/{name}` | La lista de los programas de `src` con su lenguaje, y el texto y el lenguaje de uno de ellos |
| "¿Qué placas están descritas?" | `boards_list` | Las placas del manifiesto y su nivel, sin sondear hardware |
| "¿Qué lecciones están aprobadas?" | `zplc://course/progress` | Las lecciones aprobadas, cuántas están hechas y cuántas existen |

[La referencia de MCP](../reference/mcp.md) enumera las 15 herramientas y los 15 recursos.

- **Recursos de programas.** Ambos son de solo lectura. Devuelven el código fuente guardado de un programa en cualquiera de los cinco lenguajes, dentro de los límites de tamaño del lector de proyectos. `zplc://project/source/{name}` recibe el nombre de archivo tal como se escribe en el URI (un espacio es `%20`). Un nombre que no está en `src` responde `MCP_NOT_FOUND`, un nombre con un separador responde `MCP_INVALID_ARGUMENTS`, y un proyecto que el lector rechaza responde `MCP_WORKSPACE_UNREADABLE`.
- **Progreso del curso.** El recurso lee el archivo de progreso que guarda ZPLC y responde qué lecciones están aprobadas (LRN-034). No tiene ninguna operación que escriba el progreso, y un archivo de progreso de la primera versión se migra solo en memoria, sin escribirse de nuevo. Sin `--user-data` responde `MCP_CAPABILITY_UNAVAILABLE`.
- **Escenarios.** Un escenario se ejecuta en el simulador de su computador, así que su resultado es evidencia de una ejecución simulada, no de la planta.

## 4. Revisar lo que propone el asistente

1. Ninguna herramienta ni recurso del servidor cambia su proyecto: todas las herramientas son de solo lectura, y `firmware_build` compila en un lugar efímero. Cuando el cliente del asistente edita archivos, lea el cambio como una diferencia antes de conservarlo.
2. Compile y ejecute los escenarios usted mismo, o pida `compiler_check` y `tests_run` y lea los diagnósticos.
3. Para un cambio que mueve una salida, lea la [página de seguridad](../safety-and-limitations.md) y pida `safety_check`, que comprueba la cobertura de las salidas incompatibles que declara el proyecto, antes de que el cambio se acerque a una placa.
4. Ponga un programa en una placa solo desde ZPLC, donde una persona elige la acción.

La IA dentro de ZPLC lee el programa abierto y un resumen del proyecto, y propone un conjunto de cambios de hasta cuatro archivos que usted revisa y guarda. También propone acciones del editor y ajustes de pantalla que usted aplica con un clic. Un guardado de varios archivos no tiene reversión. Todo eso está en [IA, privacidad y revisión humana](../ide/ai-privacy.md).

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El servidor enumera 15 herramientas al pedírselo; `project_validate`, `compiler_check` y `tests_run` pasan en un proyecto incluido; `boards_list` responde con `--repository`; un `initialize` de la revisión 2025-06-18 y una solicitud sin revisión se rechazan con `-32022`, y una sin `clientCapabilities` con `-32602` | Ejecutado a mano con un script que envía las solicitudes por la entrada y la salida estándar, mediante `bun run --cwd=packages/zplc-ide mcp`, en el proyecto incluido `pico_blinky_ton`; la integración continua no lo repite | Host |
| El ejecutable compilado inicia y enumera sus herramientas como lo pide un cliente 2026-07-28 | La compilación de publicación inicia el ejecutable y cuenta las herramientas | Host |
| Ninguna herramienta llega a un dispositivo, un socket o un puerto serie | Una prueba enumera las herramientas y recursos registrados del servidor activo y atrapa cada punto de entrada de sockets y de puerto serie | Host |
| Los dos recursos de programas devuelven el texto y el lenguaje de cada uno de los cinco lenguajes, y rechazan un nombre que no es un programa de `src`, un enlace y un archivo demasiado grande; el servidor no tiene ninguna herramienta que escriba | `packages/zplc-ide/src/mcp/server.test.ts` y `deviceLink.test.ts` | Host |
| El recurso del curso informa las lecciones aprobadas y no escribe nada | `packages/zplc-ide/src/mcp/server.test.ts` | Host |
| Un producto de asistente concreto funciona con la entrada de arriba | Sin verificar: no se ejecutó ningún producto cliente para esta página | Ninguno |
| El cambio de un asistente es correcto | Nunca se da por supuesto: solo la compilación y los escenarios lo dicen | Ninguno |

## Vea también

- [La referencia del servidor MCP](../reference/mcp.md) y [Usar la línea de comandos](./command-line.md).
- [IA, privacidad y revisión humana](../ide/ai-privacy.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
