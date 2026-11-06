---
slug: /contributing
id: index
title: Contribuir
sidebar_label: Contribuir
description: Cómo contribuir a ZPLC con límites de seguridad y evidencia claros.
tags: [contributing, open-source]
---

# Contribuir

Esta página es para quienes modifican ZPLC. Indica qué verificación ejecutar según la capa que se toca, qué reglas debe respetar un cambio y cómo agregar una lección, un ejemplo de documentación o un cambio al contrato binario. La guía extensa, con comandos para copiar de cada capa, es [CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md). Los cambios van a `master`, y cada uno debe dejar el repositorio más fácil de confiar que antes.

## Camino rápido

1. Lea los [principios de ingeniería](./principles.md) y [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md).
2. Ejecute `bun run setup` una vez. Luego ejecute la verificación de la capa que cambia, de la sección siguiente.
3. Para un cambio de comportamiento, agregue o refuerce una prueba específica y ejecute las verificaciones de la capa antes de abrir el pull request.
4. Cuando cambie una afirmación, un flujo o una limitación que los usuarios ven, actualice juntas la documentación en inglés y en español.
5. Complete la plantilla del pull request: las verificaciones que ejecutó y el nivel de evidencia que respalda cada afirmación.

## Verificaciones por capa

Ejecute cada comando desde la raíz del repositorio. Los tiempos se midieron el 2026-10-10 en una computadora de escritorio Linux x86-64 con cachés calientes y otros trabajos en marcha, así que tómelos como un orden de magnitud.

| Capa                                    | Comando                                                                                     | Tiempo típico                                 | Qué demuestra un resultado correcto                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preparación                             | `bun run setup`                                                                             | unos 10 s                                     | Dependencias instaladas, compilador construido, runtime nativo construido                                                                                                                                                                                                                                                                                                                    |
| Núcleo C y runtime de host              | `bun run test:core`                                                                         | cerca de 1 min, la primera ejecución incluida | Las suites de C pasan con los sanitizadores de direcciones y de comportamiento indefinido                                                                                                                                                                                                                                                                                                    |
| Compilador                              | `bun run test:compiler:ci`                                                                  | unos 6 s                                      | Pasan las pruebas del compilador y del ensamblador, y toda falla es una de los listados                                                                                                                                                                                                                                                                                                      |
| Aplicación, CLI, conformidad            | `bun run test:ide:ci`                                                                       | cerca de 1 min                                | Las suites de la aplicación y los casos de conformidad se comportan como está listado                                                                                                                                                                                                                                                                                                        |
| Lint y tipos                            | `bun run lint`, `bun run typecheck` y `bun run build:ide`                                   | unos 35 s, de 20 a 40 s y 15 s                | ESLint no marca nada, incluidas las reglas que rechazan una promesa sin manejar; todo programa TypeScript, con sus pruebas y scripts, pasa el comprobador de tipos; y la aplicación compila                                                                                                                                                                                                  |
| Estructura de la aplicación             | `bun run lint:ide` (las reglas corren después de ESLint), o `bun tools/ci/ide-structure.ts` | menos de 1 s                                  | Ningún módulo del almacén importa un componente, ningún módulo de la línea de comandos importa de `electron/`, no hay ciclos de importación estáticos, y ningún módulo escrito a mano tiene más de 1600 líneas, salvo los de `tools/ci/module-size-offenders.json`; esa lista y la única importación que admite (`tools/ci/layering-exceptions.json`) solo pueden reducirse                  |
| Análisis estático de C                  | `bun run lint:c`                                                                            | unos 15 s                                     | `clang-tidy` con `.clang-tidy`, cada hallazgo es un error, no marca nada en el núcleo, el HAL POSIX y la aplicación de host; también se analizan el HAL de Zephyr y `firmware/app` cuando existe una compilación de placa                                                                                                                                                                    |
| Fuentes de las pruebas                  | `bun run check:test-sources`                                                                | menos de 1 s                                  | Ninguna prueba lee el texto del código del producto ni compara el ensamblador que emitió el compilador, salvo los archivos listados para reemplazo en `tools/ci/pinned-source-offenders.json`                                                                                                                                                                                                |
| Contrato binario                        | `bun run contract:check`                                                                    | cerca de 1 s                                      | Los archivos generados coinciden con `contract.json`                                                                                                                                                                                                                                                                                                                                         |
| Simulación                              | `bun run simulate packages/zplc-ide/projects/motor_plant`                                   | menos de 1 s                                  | Las pruebas de escenario del proyecto pasan en el runtime nativo                                                                                                                                                                                                                                                                                                                             |
| Recorridos de la aplicación             | `bun run test:journeys`                                                                     | de 70 a 90 s                                  | La aplicación real pasa sus recorridos de extremo a extremo (requiere pantalla)                                                                                                                                                                                                                                                                                                              |
| Firmware en Linux                       | `bun run setup:firmware` y luego `bun run test:firmware`                                    | unos 6 min una vez, luego unos 4 min          | Las suites de Zephyr pasan en `native_sim`, QEMU y los presupuestos de tamaño                                                                                                                                                                                                                                                                                                                |
| Documentación                           | `bun run check:docs`                                                                        | unos 15 s en caliente, 1 min en frío          | Las referencias están al día, todo nombre que una página menciona existe, ninguna oración afirma una capacidad que nada ejecutado respalde, las páginas están completas, las páginas en inglés y español coinciden en estructura, todo ejemplo y fragmento de configuración marcado como tal compila y da el resultado que indica su bloque de código, toda imagen es una capturada, y el sitio compila |
| Ensayo de publicación                   | `bun run release:rehearsal`                                                                 | unos 5 s                                      | Las verificaciones que el flujo de trabajo de publicación ejecuta antes de construir nada                                                                                                                                                                                                                                                                                                    |
| Recursos de marca                       | `bun tools/ci/brand/generate-icons.ts --check`                                              | menos de 1 s                                  | Cada icono y la tarjeta social se generaron desde la única marca, `tools/brand/mark.svg`; regenérelos sin `--check` (necesita `rsvg-convert` y Python con Pillow)                                                                                                                                                                                                                            |
| Verificaciones de salida de publicación | `bun test ./tools/ci`                                                                       | unos 5 s                                      | Los nombres y contenedores de los instaladores, los registros de lanzamiento, el resultado de la ejecución y los generadores del cask y del paquete de AUR se comportan como dicen sus datos de prueba; el flujo de trabajo que los ejecuta sobre archivos producidos todavía no se ha ejecutado en CI                                                                                       |

Que pase un nivel nunca demuestra uno superior: una prueba en el host no dice nada sobre una placa. Las [pruebas del firmware](../development/firmware-testing.md) explican qué muestra cada modo del firmware y qué no.

## Reglas de contribución

| Área                   | Práctica requerida                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime y hardware     | Conserve los límites C99/HAL, las fallas hacia el estado seguro (apagado) y la recuperación.                                                                                                |
| Fronteras de confianza | Valide bytecode, IPC, rutas y entrada externa antes de modificar estado.                                                                                                                    |
| Electron               | Mantenga el renderer sin privilegios y el IPC estrecho y validado.                                                                                                                          |
| Evidencia              | Etiquete correctamente los resultados de host, QEMU, compilación para destino, HIL y manuales.                                                                                              |
| Dependencias           | Agregue una sola con una necesidad concreta y una justificación arquitectónica.                                                                                                             |
| Operaciones físicas    | Separe compilar, grabar, cargar y ejecutar o depurar; no automatice el control físico mediante IA o MCP.                                                                                    |
| Pruebas de hardware    | Una persona inicia todo comando que maneje una placa, en una terminal interactiva, y un registro dice qué imagen probó. Vea [Hardware en el lazo](../development/hardware-in-the-loop.md). |

Nunca publique, grabe hardware, cargue un programa de PLC ni accione equipos sin autorización explícita.

## Agregar una lección

Una lección es un paquete de datos, de modo que agregar una no exige cambiar código de la aplicación. Los identificadores de lección tienen una única fuente, los manifiestos: la aplicación, el almacén de progreso y el recurso de curso del MCP leen un índice generado a partir de ellos, y el CI falla ante una lista de identificadores escrita a mano.

1. Cree el ejercicio como dos proyectos de ejemplo en `packages/zplc-ide/projects/`: un proyecto inicial que compila y falla el escenario, y una solución que lo pasa.
2. Cree `packages/zplc-ide/lessons/<id>/` con los archivos de la tabla siguiente.
3. Ejecute el generador y luego el CI de lecciones.

| Archivo                        | Qué contiene                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lesson.json`                  | El manifiesto: identificador, versión, módulo, nivel, prerrequisitos, lenguajes, rutas, planta, minutos estimados, los proyectos inicial y solución, y el escenario de referencia con su hash de contenido.                |
| `scenario.json`                | El escenario de referencia con el que se califica la lección. Mantenga una copia en la carpeta `tests/` del proyecto inicial para que el estudiante lo ejecute desde Pruebas; CI falla cuando la copia difiere.               |
| `text.en.json`, `text.es.json` | El texto: título, resumen, alcance, objetivos, las seis etapas (`objective`, `predict`, `edit`, `run`, `observe`, `reflect`), dos niveles de pista y la falla a corregir. Ambos archivos deben tener la misma estructura. |
| `checks.json`                  | Opcional: programas incorrectos que deben seguir en rojo, y otros programas correctos que deben pasar.                                                                                                                    |
| `reading.en.md`, `reading.es.md` | Opcional, y siempre en los dos idiomas: la página de lectura con la que abre la lección, en Markdown. Además del texto lleva bloques vivos: `ld-figure` (un peldaño de escalera de solo lectura), `ld-try` (un laboratorio que ejecuta un programa de escalera en el simulador, con entradas que el lector puede accionar), `timing` y `quiz`. El subconjunto de Markdown no admite enlaces ni HTML. |
| `reading/`                     | Los archivos de escalera (`*.ld.json`) que los bloques `ld-figure` y `ld-try` nombran con `src:`. |

El texto marca cada tiempo y cada valor que cita, para que el CI pueda compararlo con el escenario. El generador expande el marcado una sola vez; ninguna cadena de la lección se reescribe mientras la aplicación se ejecuta.

| Marca                      | Muestra                   | CI verifica                                                                                         |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| `{{t:250}}`                | `250`                     | El tiempo está en la línea de tiempo del escenario: múltiplo de su tick y no mayor que su duración. |
| `{{assertions}}`           | La cantidad de aserciones | Nada que verificar: la cantidad sale del escenario.                                                 |
| `{{v:Sig=true@30\|texto}}` | `texto`                   | El escenario afirma esos valores a 30 ms: un `AT` ahí, o un `FOR` o `ALWAYS` que lo cubra.          |

```bash
bun tools/ci/generate-lesson-index.ts                  # escribe packages/zplc-ide/src/generated/lessonIndex.ts
bun tools/ci/generate-lesson-index.ts --update-hashes  # tras editar un escenario: fija su hash y sube la versión
bun tools/ci/generate-lesson-index.ts --check          # lo que corre CI: el archivo es lo que producen los paquetes
bun run --cwd packages/zplc-ide test src/learn         # CI de lecciones; defina ZPLC_NATIVE_SIM_BIN para las pruebas con runtime
```

El CI de lecciones ejecuta cada paquete en ambos idiomas. Exige que:

- el proyecto inicial falle el escenario de referencia porque una aserción falla, y que la solución lo pase;
- cada programa incorrecto de `checks.json` siga en rojo;
- cada tiempo y cada valor que cita el texto exista en el escenario;
- cada archivo que cita el texto exista en el proyecto inicial.

## Ejemplos de código ejecutables

El CI comprueba un ejemplo de código de la documentación cuando su bloque lo pide. La primera palabra del bloque es el lenguaje; las palabras siguientes indican qué comprobar:

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

| Palabra                     | Significado                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runnable`                  | El ejemplo se compila con el compilador del repositorio. Un ejemplo que no compila hace fallar `bun run check:docs`: corrija el ejemplo o quite la palabra.                                                                                                                                                                                               |
| `expect="Nombre=Valor ..."` | El ejemplo además se ejecuta en el runtime nativo y cada valor nombrado se compara después del último ciclo. `Nombre` es una variable del programa o una dirección directa como `%QX0.0` o `%QW0` (`Nombre:TIPO` fija el tipo de una dirección); `Valor` es `TRUE`, `FALSE` o un número. La página debe decir el resultado con palabras junto al ejemplo. |
| `scans=N`, `scan_ms=N`      | Cuántos ciclos ejecutar (por defecto 1) y el período de cada uno en milisegundos (por defecto 10). Solo con `expect`.                                                                                                                                                                                                                                     |
| `fragment`                  | El bloque es un cuerpo sin encabezado (variables y sentencias): se envuelve en `PROGRAM DocSample ... END_PROGRAM` antes de compilarlo.                                                                                                                                                                                                                   |
| `language=il`               | El ejemplo es lista de instrucciones (IL), escrita en un bloque de código `iecst`.                                                                                                                                                                                                                                                                                   |

La página en inglés y su gemela en español marcan los mismos ejemplos del mismo modo y declaran el mismo resultado. El código es idéntico en ambos idiomas. La comprobación es `bun run check:docs-samples`. Requiere `bun run build:compiler` y, para un ejemplo con `expect`, `bun run build:runtime`; si falta el runtime, falla en lugar de omitirse.

## Fragmentos de configuración, escenarios e imágenes

Una página que muestra un fragmento de `zplc.json`, un escenario, una entrada de placa o una captura de la aplicación se comprueba según lo que dice su bloque:

| Bloque              | Qué hace la comprobación                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `json zplc-fragment` | Las claves se combinan con un proyecto mínimo para el simulador del host, se contrastan con `packages/zplc-ide/zplc.schema.json` (una clave que el esquema no nombra es un error) y se compilan. Un fragmento con `board=<id del IDE>` se combina con un proyecto para esa placa, y toda dirección de `io.inputs` y `io.outputs` debe ser un canal de la placa, salvo que figure en `io.virtual`. |
| `json zplc-scenario` | El escenario se escribe en la carpeta `tests` de un proyecto cuyo programa es el primer ejemplo `runnable` de texto estructurado de la misma página, y toda expectativa debe pasar en el runtime nativo.                                                                                                                                                                                          |
| `json zplc-board`    | La entrada la comprueba el validador del manifiesto de placas (`firmware/zephyr/scripts/zplc_boards.py`) junto con el manifiesto de este repositorio: una clave que falta, una dirección errónea, un canal que las reglas rechazan o un nombre que ya tiene otra placa es un error.                                                                                                               |
| `![alt](/img/...)`   | La imagen debe figurar en `docs/static/img/manifest.json`, que escribe `bun run docs:screenshots` con el commit del que se construyó la aplicación: una página no muestra ninguna imagen que la automatización no haya capturado.                                                                                                                                                                 |

La página en inglés y su gemela en español muestran los mismos fragmentos y escenarios. Las comprobaciones son `bun run check:docs-config` y `bun tools/docs/capture-screenshots.ts --check`.

## Documentos del proyecto

- [Hoja de ruta](./roadmap.md): qué está hecho, qué sigue y qué viene después.
- [Principios de ingeniería](./principles.md): la constitución en lenguaje llano.
- [Fuente de verdad](../reference/source-of-truth.md): qué archivo es la autoridad para cada tipo de dato.
- [Código de conducta](https://github.com/eduardojvieira/ZPLC/blob/master/CODE_OF_CONDUCT.md) y [política de seguridad](https://github.com/eduardojvieira/ZPLC/blob/master/SECURITY.md).

## Cambiar el contrato binario

Los opcodes, la disposición del contenedor, los tamaños, los códigos de error y los identificadores del formato `.zplc` se definen una sola vez, en `tools/contract/contract.json`. Los encabezados de C, las tablas de TypeScript, las herramientas de Python y las [tablas de referencia](../reference/runtime-api.md) se generan a partir de él, y el CI falla cuando un archivo generado está desactualizado.

### Contador de borrador del contrato

Mientras el contrato no esté congelado, cada cambio suyo aumenta un **contador de borrador** (`abi.draftCounter`). El compilador y el ensamblador lo escriben en la palabra 28 del encabezado de todo artefacto (el campo que antes estaba reservado), bajo el CRC, y cada imagen de runtime y de firmware informa el suyo. Un número distinto se rechaza, y el rechazo muestra ambos:

> Program was built for contract draft 2, this runtime is draft 3

| Dónde                                     | Qué pasa ante una diferencia                                                                                                                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cargador (`zplc_loader_verify`)           | Devuelve `ZPLC_LOADER_ERR_DRAFT` (`-17`). El contador se lee antes que la versión, los indicadores y el CRC, porque otro borrador puede ordenar el resto distinto. `zplc_loader_artifact_draft_counter` lo lee sin confiar en nada más. |
| Simulación nativa                         | `program.load` falla con la frase de arriba y el programa cargado sigue corriendo. La aplicación ZPLC la dice antes de enviar nada. El runtime informa su contador en `session.hello` (`draft_counter`).                                |
| Carga al firmware                         | `zplc load` y `zplc sched load` responden `ERROR: Program was built for contract draft N, this runtime is draft M (-17)`. `zplc sys info --json` informa `draft_counter`.                                                               |
| Carga a hardware desde la aplicación ZPLC | La verificación previa compara el artefacto con el `draft_counter` de la placa conectada y rechaza antes de enviar nada.                                                                                                                |
| CLI                                       | `zplc-cli compile` indica el contador de lo que construyó.                                                                                                                                                                              |

Un artefacto compilado antes del contador lleva 0, y una imagen de firmware que no informa ninguno carece de contador. Ambos se rechazan, y la frase dice `none`. Después de una actualización que cambia el contador, recompile los programas y vuelva a grabar las placas. Un programa que una placa guardó bajo otro borrador se rechaza en el arranque, y el runtime queda enclavado en estado seguro hasta que se cargue un reemplazo verificado. El contador no es la versión del producto: el entero de versión final se asigna y se congela al cerrar la matriz de conformidad.

### Para cambiar el contrato

1. Edite `tools/contract/contract.json` y aumente `abi.draftCounter` en uno.
2. Ejecute `python3 tools/contract/generate.py --record-draft "why it changed"`. Escribe todos los archivos generados y agrega el contador, la huella del contrato y el motivo a `tools/contract/golden/draft-ledger.json`.
3. Actualice los números que cambiaron en `tools/contract/golden/contract.golden.json` (`python3 tools/contract/test_contract.py` nombra cada uno), recompile los artefactos versionados en el repositorio (`examples/*.zplc` y los archivos `.hex` de prueba) y corrija toda prueba que arme un encabezado a mano.
4. Ejecute `bun run contract:check` e indique el motivo en el mensaje del commit.

`generate.py --check` falla cuando el contrato ya no coincide con la huella registrada para su propio contador, de modo que un cambio no puede confirmarse con el número anterior. La prosa (las cadenas `doc` y los títulos de grupo) no forma parte de la huella. Nunca edite ni elimine una entrada del registro que ya se confirmó.
