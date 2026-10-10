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
confiable de lo que estaba.

## Camino rápido

1. Leé [AGENTS.md](https://github.com/eduardojvieira/ZPLC/blob/master/AGENTS.md), la [constitución de ingeniería](https://github.com/eduardojvieira/ZPLC/blob/master/.specify/memory/constitution.md), [VERSIONING.md](https://github.com/eduardojvieira/ZPLC/blob/master/VERSIONING.md) y el [RFC ZPLC 2.0 Foundation](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).
2. Encontrá la spec activa más cercana y mantené el work unit enfocado.
3. Para cambios de comportamiento, agregá o reforzá tests focalizados y corré
   los checks de la capa modificada.
4. Actualizá documentación pública en inglés y español cuando cambie un claim,
   flujo o limitación visible.

## Reglas de contribución

| Área | Práctica requerida |
|---|---|
| Runtime y hardware | Conservá límites C99/HAL, fallos safe/off y recuperación. |
| Fronteras de confianza | Validá bytecode, IPC, paths e input externo antes de mutar. |
| Electron | Mantené el renderer sin privilegios e IPC estrecho y validado. |
| Evidencia | Etiquetá correctamente resultados host, QEMU, build target, HIL y manual. |
| Dependencias | Agregá una sola con necesidad concreta y justificación arquitectónica. |
| Operaciones físicas | Separá build, flash, deploy y run/debug; no automatices control físico vía IA o MCP. |

No publiques, flashees hardware, despliegues un programa PLC ni actués
equipamiento sin autorización explícita. Consultá
[CONTRIBUTING.md](https://github.com/eduardojvieira/ZPLC/blob/master/CONTRIBUTING.md) para el checklist del repositorio.

## Cambiar el contrato binario

Los opcodes, el layout del contenedor, los tamaños, los códigos de error y los
identificadores del formato `.zplc` se definen una sola vez, en
`tools/contract/contract.json`. Las cabeceras C, las tablas TypeScript, las
herramientas Python y las [tablas de referencia](/reference/runtime-api) se
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
Después de una actualización que cambia el contador, reconstruí los programas y
reflasheá las placas. El contador no es la versión del producto: el único
entero de versión final se asigna y congela al cerrar la matriz de conformidad.

### Para cambiar el contrato

1. Editá `tools/contract/contract.json` y subí `abi.draftCounter` en uno.
2. Corré `python3 tools/contract/generate.py --record-draft "por qué cambió"`.
   Escribe todos los archivos generados y agrega el contador, la huella del
   contrato y el motivo a `tools/contract/golden/draft-ledger.json`.
3. Movés los números que cambiaron en
   `tools/contract/golden/contract.golden.json` (`python3
   tools/contract/test_contract.py` nombra cada uno), reconstruí los artefactos
   versionados en el repositorio (`examples/*.zplc`, los fixtures `.hex`) y
   corregí cualquier test que arme una cabecera a mano.
4. Corré `bun run contract:check` y dejá el motivo en el mensaje del commit.

`generate.py --check` falla cuando el contrato ya no coincide con la huella
registrada para su propio contador, así que un cambio no se puede commitear
bajo el número viejo. La prosa (cadenas `doc`, títulos de grupo) no forma parte
de la huella. Nunca edites ni quites una entrada del ledger que ya se commiteó.
