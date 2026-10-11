---
slug: /guides/ai-and-mcp
id: ai-and-mcp
title: Usar un asistente de IA y MCP con seguridad
sidebar_label: IA y MCP
description: "Dar a un asistente de IA acceso de lectura a un proyecto con el servidor MCP local, qué puede pedir, qué no puede hacer nunca y cómo revisar lo que propone."
tags: [how-to, ai, mcp, safety]
---

# Usar un asistente de IA y MCP con seguridad

`zplc-mcp` es un servidor local del Model Context Protocol. Permite que un asistente de
IA inspeccione un proyecto, lo compile, ejecute sus pruebas de escenario y lea la
evidencia, de modo que el asistente trabaje con lo que dicen la compilación y el
simulador y no con una conjetura. Se ejecuta en su computadora y habla con el asistente
por la entrada y la salida estándar; no abre ningún puerto de red ni serie.

:::danger El asistente no puede tocar una máquina
Ninguna herramienta del servidor graba una placa, despliega un programa, fuerza un
valor, arranca o detiene un dispositivo, abre un puerto serie ni ejecuta una shell. Esas
acciones quedan en Studio, donde las elige una persona. La única herramienta que no es de
solo lectura, `firmware_build`, hace una compilación cruzada local y ahí termina.
:::

## 1. Iniciar el servidor para una carpeta

El servidor sirve la única carpeta que usted nombra, y nada fuera de ella. La carpeta es
la ruta absoluta de un proyecto de ZPLC, un directorio real y no un enlace; con cualquier
otra carpeta el servidor imprime `ZPLC MCP workspace is unavailable` y termina con 1:

```bash
zplc-mcp --workspace /home/me/plants/line-3
```

Desde un checkout, el mismo servidor se ejecuta desde el paquete de Studio:

```bash
bun run --cwd=packages/zplc-ide mcp --workspace /home/me/plants/line-3
```

Las versiones posteriores a 2.0.0-rc.3 incluyen `zplc-mcp-<versión>-<sistema>-<arquitectura>`
como ejecutable independiente, sin firmar, que se verifica como indica la
[página de instalación](../getting-started/install.md#verificar-la-descarga). Dos opciones
agregan lo que una carpeta de proyecto no puede contener:

- `--repository <directorio>` es un checkout de ZPLC. Lo necesitan `boards_list`,
  `toolchain_inspect` y `firmware_build`; sin ella responden `MCP_CAPABILITY_UNAVAILABLE`.
- `--user-data <directorio>` es la carpeta donde Studio guarda el progreso de las
  lecciones, para el recurso `zplc://course/progress`.

## 2. Conectar un asistente

La mayoría de los clientes que ejecutan un servidor MCP local toman un comando y sus
argumentos en una entrada de configuración. Esta es una entrada con la forma que esos
clientes leen; el archivo y su lugar son del cliente, no de ZPLC:

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

El servidor habla una sola revisión del protocolo, la 2026-07-28, y ninguna anterior. Su
punto de entrada inicia el transporte con `legacy: 'reject'`, mientras que el SDK que usa
serviría por defecto el apretón de manos de 2025; el repositorio no registra el motivo de
esa elección, así que debe tomarse como la forma en que el servidor es y no como una
promesa. Un cliente no tiene paso `initialize`: nombra la revisión y sus capacidades en el
`_meta` de cada solicitud.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list",
  "params": { "_meta": {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {} } } }
```

Un cliente que abre con `initialize` de una revisión anterior recibe esta respuesta, y la
conexión sigue abierta para una solicitud de la revisión admitida:

```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32022,
  "message": "Unsupported protocol version: 2025-06-18",
  "data": { "supported": ["2026-07-28"], "requested": "2025-06-18" } } }
```

Una solicitud que no nombra ninguna revisión recibe el mismo código y el mensaje
`Unsupported protocol version: the request did not name a protocol version`. Una que
nombra la revisión y omite `io.modelcontextprotocol/clientCapabilities` recibe `-32602` y
`Invalid _meta envelope for protocol revision 2026-07-28:
io.modelcontextprotocol/clientCapabilities: missing`. En cada caso el que debe
actualizarse es el cliente; el servidor no cambia.

## 3. Pedir evidencia

Pida lo que devuelve una herramienta, de modo que cada afirmación del asistente tenga un
resultado detrás:

| Pida | Herramienta | Qué devuelve |
| --- | --- | --- |
| «¿Es válido este archivo de proyecto?» | `project_validate` | `ok` y los diagnósticos |
| «¿Compila y qué necesita?» | `compiler_check`, `symbols_list` | El tamaño del programa, los diagnósticos y los símbolos públicos |
| «¿Pasan sus escenarios?» | `tests_run`, `scenario_run` | Un resultado por escenario, con el resumen de su traza |
| «¿Qué pasó en el ciclo 40?» | `trace_get`, `runtime_snapshot` | Una traza acotada y saneada de una ejecución registrada |
| «¿Qué placas están descritas?» | `boards_list` | Las placas del manifiesto y su nivel, sin sondear hardware |

[La referencia de MCP](../reference/mcp.md) lista las 15 herramientas y los 13 recursos.
Un escenario se ejecuta en el simulador de su computadora, así que su resultado es
evidencia de una ejecución simulada, no de la planta.

## 4. Revisar lo que propone el asistente

1. Ninguna herramienta del servidor cambia su proyecto: todas son de solo lectura y
   `firmware_build` compila en un lugar efímero. Cuando el cliente del asistente edita
   archivos, lea el cambio como una diferencia antes de conservarlo.
2. Compílelo y ejecute usted los escenarios, o pida `compiler_check` y `tests_run` y lea
   los diagnósticos.
3. Para un cambio que mueve una salida, lea la [página de seguridad](../safety-and-limitations.md)
   y pida `safety_check`, que comprueba la cobertura de las salidas incompatibles que el
   proyecto declara, antes de que el cambio se acerque a una placa.
4. Ponga un programa en una placa solo desde Studio, donde una persona elige la acción.

La IA dentro de Studio sigue el mismo límite y tiene sus propias reglas de datos:
[IA, privacidad y revisión humana](../ide/ai-privacy.md).

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| El servidor lista 15 herramientas cuando se le pide; `project_validate`, `compiler_check` y `tests_run` pasan en un proyecto incluido; `boards_list` responde con `--repository`; un `initialize` de la revisión 2025-06-18 y una solicitud sin revisión se rechazan con `-32022`, y una sin `clientCapabilities` con `-32602` | Ejecutado a mano con un script que envía las solicitudes por la entrada y la salida estándar, con `bun run --cwd=packages/zplc-ide mcp`, sobre el proyecto incluido `pico_blinky_ton`; CI no lo repite | Host |
| El ejecutable construido arranca y lista sus herramientas como lo pide un cliente 2026-07-28 | La compilación de la versión arranca el ejecutable y cuenta las herramientas | Host |
| Ninguna herramienta llega a un dispositivo, un socket o un puerto serie | Una prueba lista las herramientas y los recursos registrados del servidor activo y atrapa cada punto de entrada de sockets y de puerto serie | Host |
| Un producto de asistente concreto funciona con la entrada de arriba | No verificado: no se ejecutó ningún producto cliente para esta página | Ninguno |
| El cambio de un asistente es correcto | Nunca se da por supuesto: solo lo dicen la compilación y los escenarios | Ninguno |

## Vea también

- [La referencia del servidor MCP](../reference/mcp.md) y [Usar la línea de comandos](./command-line.md).
- [IA, privacidad y revisión humana](../ide/ai-privacy.md).
- [Seguridad y limitaciones](../safety-and-limitations.md).
