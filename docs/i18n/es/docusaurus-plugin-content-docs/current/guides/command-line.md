---
slug: /guides/command-line
id: command-line
title: Usar la línea de comandos
sidebar_label: Línea de comandos
description: 'Valide, compile y pruebe un proyecto desde una terminal o un trabajo de integración continua con zplc-cli, las mismas operaciones que usan la aplicación ZPLC y el servidor MCP.'
tags: [how-to, cli, ci]
---

# Usar la línea de comandos

`zplc-cli` ejecuta desde una terminal las operaciones de la API de herramientas de ZPLC. Son las mismas operaciones que usan la aplicación ZPLC y el servidor MCP, con el mismo resultado. Úselo en un script o en un trabajo de integración continua para validar un proyecto, compilarlo y ejecutar sus pruebas de escenario sin abrir ZPLC.

:::note Lo que nunca hace
`zplc-cli` nunca graba una placa, nunca carga un programa, nunca fuerza un valor y nunca inicia ni detiene un dispositivo. Su comando `firmware-build` es una compilación cruzada local y nada más.
:::

## Obtenerlo

- **Desde una versión publicada:** las versiones posteriores a 2.0.0-rc.3 incluyen `zplc-cli-<versión>-<sistema>-<arquitectura>` como ejecutable independiente para Linux, macOS y Windows en x64 y arm64. No necesita Node.js, Bun ni una copia del repositorio. No está firmado: verifíquelo como dice la [página de instalación](../getting-started/install.md#verificar-la-descarga).
- **Desde una copia del repositorio:** ejecute `bun run setup` una vez. Después `bun run simulate <proyecto>` ejecuta las pruebas de un proyecto, y `bun packages/zplc-ide/src/cli/index.ts <comando>` ejecuta cualquier comando.

`zplc-cli --version` imprime la versión y `zplc-cli --help` enumera todos los comandos.

## Comprobar un proyecto

Todos los comandos reciben la carpeta de un proyecto. Estos tres son los primeros que conviene ejecutar:

```bash
zplc-cli inspect packages/zplc-ide/projects/blinky_st
zplc-cli validate packages/zplc-ide/projects/blinky_st
zplc-cli check packages/zplc-ide/projects/blinky_st
```

Cada uno imprime su nombre y `passed` (`inspect passed`, `validate passed`, `check passed`) y termina con 0.

| Comando | Qué hace |
| --- | --- |
| `inspect` | Lee el archivo del proyecto y enumera sus tareas y fuentes |
| `validate` | Comprueba el archivo del proyecto y sus fuentes, sin compilar |
| `check` | Compila y descarta el programa, de modo que solo quedan los diagnósticos de la compilación |

## Compilar

```bash
zplc-cli compile packages/zplc-ide/projects/blinky_st --output blinky.zplc
zplc-cli compile packages/zplc-ide/projects/blinky_st --emit asm
```

El primer comando escribe el programa e imprime `compile passed (contract draft 6)`. El número es el borrador del contrato binario, y un entorno de ejecución de otro borrador rechaza el programa. El segundo imprime en cambio el listado de ensamblador, o lo escribe en `--output`. Un diagnóstico nombra el archivo, la línea y la columna.

`compile` también acepta un solo archivo fuente en lugar de un proyecto, y `--language ST|IL|LD|FBD|SFC` indica su lenguaje.

## Probar

```bash
zplc-cli test packages/zplc-ide/projects/blinky_st
zplc-cli scenario-run packages/zplc-ide/projects/blinky_st BlinkyST
```

`test` ejecuta todos los escenarios del proyecto en el entorno de ejecución nativo, sin interfaz y con un reloj virtual. Imprime `test passed` o la aserción fallida. `scenario-run` ejecuta un escenario por su `id`. Agregue `--output <trace.json>` para escribir la traza de la ejecución.

El entorno de ejecución debe estar compilado (`bun run build:runtime`) o indicado en `ZPLC_NATIVE_SIM_BIN`. [Pruebas de escenario](./scenario-tests.md) muestra cómo escribir un escenario.

## Otros comandos

| Comando | Qué hace |
| --- | --- |
| `zplc-cli safety-check <workspace>` | Comprueba que cada par de salidas incompatibles declarado en `zplc.json` tenga un escenario que afirme que nunca ocurre |
| `zplc-cli symbols <workspace>` | Enumera los símbolos públicos del proyecto |
| `zplc-cli migrate-preview <workspace>` | Muestra qué cambiaría migrar un archivo de proyecto de versión 1 a versión 2 |
| `zplc-cli migrate <workspace> --output <archivo>` | Escribe el archivo de proyecto de versión 2 que produce la migración |
| `zplc-cli toolchain-inspect <repositorio>` | Informa qué requisitos de compilación del firmware tiene una copia del repositorio |
| `zplc-cli firmware-build <repositorio> <ide-id>` | Una compilación cruzada local del firmware de una placa, indicada por su identificador en ZPLC |

## En un script

Agregue `--json` para una línea de JSON con la evidencia de la operación. Use el código de salida: 0 si todo salió bien, 1 cuando el comando falló o sus argumentos eran inválidos, 124 cuando una compilación o una prueba agotó su tiempo, y 130 cuando se canceló.

```bash
zplc-cli check . --json && zplc-cli test . --json
```

La [referencia de la línea de comandos](../reference/cli.md) enumera cada comando, opción y código de salida, leídos de las fuentes.

## Qué está verificado y qué no

| Parte | Verificado | Nivel |
| --- | --- | --- |
| Los comandos imprimen lo que dice esta página y terminan como ella dice | Los comandos se ejecutaron sobre el ejemplo de esta página; pruebas unitarias cubren cada operación | Host |
| Un escenario da el mismo resultado desde la línea de comandos, ZPLC y el servidor MCP | Una prueba ejecuta cada proyecto incluido, cada escenario por separado, por las tres vías | Host |
| El ejecutable independiente funciona sin Bun, Node ni copia del repositorio | Una prueba lo compila y lo ejecuta sin ningún entorno de ejecución de JavaScript en la ruta | Host |
| `firmware-build` produce una imagen que funciona | Sin probar: es una compilación cruzada | Ninguno |

## Vea también

- [Referencia de la línea de comandos](../reference/cli.md) y el [servidor MCP](../reference/mcp.md).
- [Escribir y ejecutar pruebas de escenario](./scenario-tests.md).
