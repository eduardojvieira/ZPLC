---
slug: /guides/command-line
id: command-line
title: Usar la línea de comandos
sidebar_label: Línea de comandos
description: "Valide, compile y pruebe un proyecto desde una terminal o un trabajo de CI con zplc-cli, las mismas operaciones que usan Studio y el servidor MCP."
tags: [how-to, cli, ci]
---

# Usar la línea de comandos

`zplc-cli` ejecuta desde una terminal las operaciones de la API de herramientas de
ZPLC: las mismas que usan Studio y el servidor MCP, con el mismo resultado. Úsela en
un script o en un trabajo de integración continua para validar un proyecto,
compilarlo y ejecutar sus pruebas de escenario sin abrir Studio.

:::note Lo que nunca hace
`zplc-cli` nunca graba una placa, despliega un programa, fuerza un valor ni inicia o
detiene un dispositivo. Su comando `firmware-build` es una compilación cruzada local,
y nada más.
:::

## Obténgala

- **Desde una versión publicada:** las versiones posteriores a 2.0.0-rc.3 incluyen
  `zplc-cli-<versión>-<sistema>-<arquitectura>` como ejecutable independiente para
  Linux, macOS y Windows en x64 y arm64. No necesita Node.js, Bun ni una copia del
  repositorio. Tampoco está firmado: verifíquelo como indica la
  [página de instalación](../getting-started/install.md#verificar-la-descarga).
- **Desde una copia del repositorio:** `bun run setup` una vez, y luego
  `bun run simulate <proyecto>` ejecuta las pruebas de un proyecto, y
  `bun packages/zplc-ide/src/cli/index.ts <comando>` ejecuta cualquier comando.

`zplc-cli --version` imprime la versión, y `zplc-cli --help` enumera todos los
comandos.

## Compruebe un proyecto

Cada comando recibe la carpeta de un proyecto. Esto es lo que imprimen los comandos
para el ejemplo `blinky_st`:

```bash
zplc-cli inspect packages/zplc-ide/projects/blinky_st
zplc-cli validate packages/zplc-ide/projects/blinky_st
zplc-cli check packages/zplc-ide/projects/blinky_st
```

Cada uno imprime su nombre y `passed` (`inspect passed`, `validate passed`,
`check passed`) y sale con 0. `inspect` lee el archivo de proyecto y enumera sus
tareas y fuentes, `validate` comprueba el archivo de proyecto y sus fuentes sin
compilar, y `check` compila y descarta el programa, de modo que solo quedan los
diagnósticos de la compilación.

## Compile

```bash
zplc-cli compile packages/zplc-ide/projects/blinky_st --output blinky.zplc
zplc-cli compile packages/zplc-ide/projects/blinky_st --emit asm
```

El primer comando escribe el programa e imprime `compile passed (contract draft 5)`:
el número es el borrador del contrato binario, que un runtime de otro borrador
rechaza. El segundo imprime el listado de ensamblador en lugar del programa, o lo
escribe en `--output`. Un diagnóstico nombra el archivo, la línea y la columna.

## Pruebe

```bash
zplc-cli test packages/zplc-ide/projects/blinky_st
zplc-cli scenario-run packages/zplc-ide/projects/blinky_st BlinkyST
```

`test` ejecuta todos los escenarios del proyecto en el runtime nativo, sin interfaz y
con un reloj virtual, e imprime `test passed` o la aserción que falla. `scenario-run`
ejecuta un escenario por su `id`. El runtime debe estar construido
(`bun run build:runtime`) o indicado en `ZPLC_NATIVE_SIM_BIN`.
[Pruebas de escenario](./scenario-tests.md) muestra cómo escribir uno.

## Otros comandos

| Comando | Qué hace |
| --- | --- |
| `zplc-cli safety-check <workspace>` | Comprueba que cada par de salidas incompatibles declarado en `zplc.json` tenga un escenario que afirme que nunca ocurre |
| `zplc-cli symbols <workspace>` | Enumera los símbolos públicos del proyecto |
| `zplc-cli migrate-preview <workspace>` | Muestra qué cambiaría migrar un archivo de proyecto de versión 1 a versión 2 |
| `zplc-cli migrate <workspace> --output <file>` | Escribe el archivo de proyecto de versión 2 que produce la migración |
| `zplc-cli toolchain-inspect <repository>` | Informa qué requisitos de compilación de firmware tiene una copia del repositorio |
| `zplc-cli firmware-build <repository> <ide-id>` | Una compilación cruzada local del firmware de una placa, nombrada por su identificador de Studio |

## En un script

Agregue `--json` para obtener una línea de JSON con la evidencia de la operación, y
use el código de salida, que es 0 si tuvo éxito, 1 cuando el comando falló o sus
argumentos eran inválidos, 124 cuando agotó el tiempo y 130 cuando se canceló:

```bash
zplc-cli check . --json && zplc-cli test . --json
```

La [referencia de la línea de comandos](../reference/cli.md) enumera cada comando,
opción y código de salida, leídos de la fuente.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Los comandos imprimen lo que dice esta página y salen como ella dice | Los comandos se ejecutaron sobre el ejemplo para esta página; pruebas unitarias cubren cada operación | Host |
| Un escenario da el mismo resultado desde la línea de comandos, Studio y el servidor MCP | Una prueba ejecuta cada proyecto incluido, cada escenario por separado, por los tres | Host |
| El ejecutable independiente funciona sin Bun, Node ni copia del repositorio | Una prueba lo construye y lo ejecuta sin ningún entorno JavaScript en la ruta | Host |
| `firmware-build` produce una imagen que se ejecuta | No probado: es una compilación cruzada | Ninguno |

## Vea también

- [Referencia de la línea de comandos](../reference/cli.md) y el [servidor MCP](../reference/mcp.md).
- [Escribir y ejecutar pruebas de escenario](./scenario-tests.md).
