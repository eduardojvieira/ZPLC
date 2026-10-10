---
slug: /contributing
id: index
title: Contribuir
sidebar_label: Contribuir
description: Cómo contribuir a ZPLC con límites de seguridad y evidencia claros.
tags: [contributing, open-source]
---

# Contribuir

Las contribuciones apuntan a `master` y deben dejar el repositorio más
confiable de lo que estaba. La guía del repositorio, con comandos para copiar y
pegar de cada capa, es [CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md).
Esta página es su versión corta para quienes leen el sitio.

## Camino rápido

1. Lea los [principios de ingeniería](./principles.md) y
   [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md).
2. Ejecute `bun run setup` una vez y luego la verificación de la capa que cambia
   (sección siguiente).
3. Agregue o refuerce una prueba focalizada para un cambio de comportamiento, y
   ejecute las verificaciones de la capa antes de abrir el pull request.
4. Actualice la documentación pública en inglés y español a la vez cuando cambie
   una afirmación, un flujo o una limitación visible para el usuario.
5. Abra el pull request con su plantilla: las verificaciones que ejecutó y el
   nivel de evidencia que respalda cada afirmación.

## Verificaciones por capa

Ejecute cada comando desde la raíz del repositorio. Los tiempos se midieron en un
equipo de escritorio Linux x86-64 de 12 hilos con cachés calientes.

| Capa | Comando | Tiempo típico | Qué demuestra un resultado correcto |
|---|---|---|---|
| Preparación | `bun run setup` | unos 10 s | Dependencias instaladas, compilador construido, runtime nativo construido |
| Núcleo C y runtime de host | `bun run test:core` | unos 5 s | Las suites de C pasan con los sanitizers de direcciones y de comportamiento indefinido |
| Compilador | `bun run test:compiler:ci` | unos 2 s | Pasan las pruebas del compilador y del ensamblador, y todo fallo es uno de los listados |
| Studio, CLI, conformidad | `bun run test:ide:ci` | de 30 a 60 s | Las suites de Studio y los casos de conformidad se comportan como está listado |
| Lint y tipos | `bun run lint`, `bun run typecheck` y `bun run build:ide` | unos 10 s, 20 s y 40 s | ESLint no marca nada, incluidas las reglas que rechazan una promesa sin manejar; todo programa TypeScript, con sus pruebas y scripts, pasa el comprobador de tipos; y Studio compila |
| Estructura de Studio | `bun run lint:ide` (las reglas corren después de ESLint), o `bun tools/ci/ide-structure.ts` | menos de 1 s | Ningún módulo del store importa un componente, ningún módulo de la línea de comandos importa de `electron/`, no hay ciclos de importación estáticos, y ningún módulo escrito a mano tiene más de 800 líneas, salvo los de `tools/ci/module-size-offenders.json`; esa lista y la única importación que admite (`tools/ci/layering-exceptions.json`) solo pueden reducirse |
| Análisis estático de C | `bun run lint:c` | unos 15 s | `clang-tidy` con `.clang-tidy`, cada hallazgo es un error, no marca nada en el núcleo, el HAL POSIX y la aplicación de host; también se analizan el HAL de Zephyr y `firmware/app` cuando existe una compilación de placa |
| Fuentes de las pruebas | `bun run check:test-sources` | menos de 1 s | Ninguna prueba lee el texto del código del producto ni compara el ensamblador que emitió el compilador, salvo los archivos listados para reemplazo en `tools/ci/pinned-source-offenders.json` |
| Contrato binario | `bun run contract:check` | unos 1 s | Los archivos generados coinciden con `contract.json` |
| Simulación | `bun run simulate packages/zplc-ide/projects/motor_plant` | menos de 1 s | Las pruebas de escenario del proyecto pasan en el runtime nativo |
| Recorridos de Studio | `bun run test:journeys` | de 70 a 90 s | La aplicación real pasa sus recorridos de extremo a extremo (requiere pantalla) |
| Firmware en Linux | `bun run setup:firmware` y luego `bun run test:firmware` | unos 6 min una vez, luego unos 4 min | Las suites de Zephyr pasan en `native_sim`, QEMU y los presupuestos de tamaño |
| Documentación | `bun run check:docs` | unos 50 s | Las referencias están al día, las páginas están completas, las páginas en inglés y español coinciden en estructura, todo ejemplo marcado como ejecutable compila y da el resultado que su cerco indica, y el sitio compila |
| Ensayo de publicación | `bun run release:rehearsal` | unos 10 s | Las verificaciones que el workflow de publicación ejecuta antes de construir nada |

Un resultado correcto en un nivel nunca prueba uno superior: una prueba de host no
dice nada sobre una placa. [Pruebas del firmware en Linux](../development/firmware-testing.md)
explica qué muestra cada modo del firmware y qué no.

## Reglas de contribución

| Área | Práctica requerida |
|---|---|
| Runtime y hardware | Conserve los límites C99/HAL, los fallos safe/off y la recuperación. |
| Fronteras de confianza | Valide bytecode, IPC, rutas y entrada externa antes de modificar estado. |
| Electron | Mantenga el renderer sin privilegios y el IPC estrecho y validado. |
| Evidencia | Etiquete correctamente los resultados de host, QEMU, compilación para destino, HIL y manuales. |
| Dependencias | Agregue una sola con una necesidad concreta y una justificación arquitectónica. |
| Operaciones físicas | Separe compilar, flashear, desplegar y ejecutar o depurar; no automatice el control físico mediante IA o MCP. |

No publique, no flashee hardware, no despliegue un programa PLC ni accione equipos
sin autorización explícita.

## Ejemplos de código ejecutables

Un ejemplo de código de la documentación se verifica en CI cuando su cerco lo indica. La primera
palabra del cerco nombra el lenguaje; las palabras siguientes dicen qué verificar:

````text
```st runnable
PROGRAM Counting
VAR
    Count : INT;
END_VAR
Count := Count + 1;
END_PROGRAM
```

```st runnable expect="Count=3" scans=3 scan_ms=10
PROGRAM Counting
VAR
    Count : INT;
END_VAR
Count := Count + 1;
END_PROGRAM
```
````

| Palabra | Significado |
|---|---|
| `runnable` | El ejemplo se compila con el compilador del repositorio. Un ejemplo que no compila hace fallar `bun run check:docs`: corrija el ejemplo o quite la palabra. |
| `expect="Nombre=Valor ..."` | El ejemplo además se ejecuta en el runtime nativo y cada valor nombrado se compara después del último scan. `Nombre` es una variable del programa o una dirección directa como `%QX0.0` o `%QW0` (`Nombre:TIPO` fija el tipo de una dirección); `Valor` es `TRUE`, `FALSE` o un número. La página debe decir el resultado con palabras junto al ejemplo. |
| `scans=N`, `scan_ms=N` | Cuántos scans ejecutar (por defecto 1) y el período de cada uno en milisegundos (por defecto 10). Solo con `expect`. |
| `fragment` | El bloque es un cuerpo sin encabezado (variables y sentencias): se envuelve en `PROGRAM DocSample ... END_PROGRAM` antes de compilarlo. |
| `language=il` | El ejemplo es Instruction List, escrito en un cerco `iecst`. |

La página en inglés y su gemela en español marcan los mismos ejemplos de la misma manera, con el
mismo resultado. El ejemplo está escrito en código y por eso es igual en ambos idiomas. La
verificación es `bun run check:docs-samples`; necesita `bun run build:compiler` y, para un ejemplo
con `expect`, `bun run build:runtime`, y falla en vez de omitirse cuando falta el runtime.

## Documentos del proyecto

- [Hoja de ruta](./roadmap.md): qué está hecho, qué sigue y qué viene después.
- [Principios de ingeniería](./principles.md): la constitución en lenguaje llano.
- [Fuente de verdad](../reference/source-of-truth.md): qué archivo es la autoridad
  para cada tipo de dato.
- [Manifiesto de documentación](../reference/v1-5-canonical-docs-manifest.md): las
  páginas que deben existir en inglés y español.
- [Código de conducta](https://github.com/eduardojvieira/ZPLC/blob/master/CODE_OF_CONDUCT.md)
  y [política de seguridad](https://github.com/eduardojvieira/ZPLC/blob/master/SECURITY.md).

## Cambiar el contrato binario

Los opcodes, el layout del contenedor, los tamaños, los códigos de error y los
identificadores del formato `.zplc` se definen una sola vez, en
`tools/contract/contract.json`. Las cabeceras C, las tablas TypeScript, las
herramientas Python y las [tablas de referencia](../reference/runtime-api.md) se
generan de ese archivo, y CI falla cuando un archivo generado quedó viejo.

### Contador de borrador del contrato

Hasta que el contrato se congele, cada cambio incrementa un **contador de
borrador** (`abi.draftCounter`). El compilador y el ensamblador lo escriben en
la palabra 28 de la cabecera de cada artefacto (el campo que antes era
reservado), bajo el CRC, y cada runtime e imagen de firmware informa el suyo.
Un número distinto se rechaza y el rechazo muestra los dos:

> Program was built for contract draft 2, this runtime is draft 3

| Dónde | Qué pasa ante una diferencia |
|---|---|
| Loader (`zplc_loader_verify`) | Devuelve `ZPLC_LOADER_ERR_DRAFT` (`-17`). El contador se lee antes que la versión, los flags y el CRC, porque otro borrador puede ordenar el resto distinto. `zplc_loader_artifact_draft_counter` lo lee sin confiar en nada más. |
| Simulación nativa | `program.load` falla con la frase de arriba y el programa cargado sigue corriendo. Studio la dice antes de enviar nada. El runtime informa su contador en `session.hello` (`draft_counter`). |
| Carga al firmware | `zplc load` y `zplc sched load` responden `ERROR: Program was built for contract draft N, this runtime is draft M (-17)`. `zplc sys info --json` informa `draft_counter`. |
| Deploy a hardware desde Studio | El preflight compara el artefacto con el `draft_counter` de la placa conectada y rechaza antes de enviar nada. |
| CLI | `zplc-cli compile` indica el contador de lo que construyó. |

Un artefacto construido antes del contador lleva 0, y una imagen de firmware
que no lo informa no tiene ninguno: ambos se rechazan y la frase dice `none`.
Después de una actualización que cambia el contador, reconstruya los programas y
reflashee las placas. Un programa que una placa guardó bajo otro borrador se
rechaza al arrancar y el runtime queda trabado en estado seguro hasta que se
suba un reemplazo verificado. El contador no es la versión del producto: el único
entero de versión final se asigna y congela al cerrar la matriz de conformidad.

### Para cambiar el contrato

1. Edite `tools/contract/contract.json` y suba `abi.draftCounter` en uno.
2. Ejecute `python3 tools/contract/generate.py --record-draft "por qué cambió"`.
   Escribe todos los archivos generados y agrega el contador, la huella del
   contrato y el motivo a `tools/contract/golden/draft-ledger.json`.
3. Actualice los números que cambiaron en
   `tools/contract/golden/contract.golden.json` (`python3
   tools/contract/test_contract.py` nombra cada uno), reconstruya los artefactos
   versionados en el repositorio (`examples/*.zplc`, los fixtures `.hex`) y
   corrija cualquier test que arme una cabecera a mano.
4. Ejecute `bun run contract:check` y deje el motivo en el mensaje del commit.

`generate.py --check` falla cuando el contrato ya no coincide con la huella
registrada para su propio contador, así que un cambio no se puede commitear
bajo el número viejo. La prosa (cadenas `doc`, títulos de grupo) no forma parte
de la huella. Nunca edite ni quite una entrada del ledger que ya se commiteó.
