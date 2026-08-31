---
slug: /release-notes
id: index
title: Notas de versión
sidebar_label: Notas de versión
description: Estado de releases de ZPLC respaldado por evidencia.
tags: [releases, changelog]
---

# Notas de versión

ZPLC `v2.0.0-rc.1` es el candidato prerelease actual. No es un release GA, un
resultado HIL, una calificación de placas ni una certificación de seguridad.

## Estado actual de release

| Área | Estado público actual | Límite de evidencia |
|---|---|---|
| Core C99 y HAL | Hay código fuente y tests automatizados | Tests host no califican una placa ni su timing |
| IDE y simulación nativa | Existen la simulación nativa supervisada y el candidato de Studio | El comportamiento host no establece paridad desktop ni de hardware |
| Lenguajes IEC | Existen paths en el repositorio | Soporte de release requiere evidencia por lenguaje |
| Perfiles de placas | Catalogados en el manifest | Estar listado no implica binario, HIL ni producción |
| Timing/determinismo | Requiere medición por profile | Aquí no se publica un claim hard-real-time estable |

La matriz de evidencia sigue siendo el registro de revisión para el baseline actual de catálogo/evidencia:
[`specs/008-release-foundation/artifacts/release-evidence-matrix.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/008-release-foundation/artifacts/release-evidence-matrix.md).

## Qué verifica la automatización del repositorio

- Los checks host de CMake/CTest ejercitan el core C99 en la máquina de desarrollo.
- Los checks de build, test y lint del compilador y del IDE ejercitan código del repositorio.
- Los validadores de documentación generada y paridad EN/ES detectan drift documental.
- Los validadores estructurales de placas y evidencia revisan manifests y evidencia registrada.
- La automatización de release queda configurada para producir un SBOM SPDX de
  candidato, checksums SHA-256 y un manifest de identidad vinculados al SHA candidato.

Son checks de host y repositorio. No establecen HIL, timing en target ni
calificación de hardware. El checksum y manifest establecen la integridad e
identidad del archivo candidato, no autenticidad/firma ni reproducibilidad entre
runners. Este worktree local no es evidencia de release: el SHA candidato debe
correr y verificarse en el workflow alojado antes de afirmar que existe un SBOM
o una attestation.

## Aún requerido antes de GA

- Hace falta evidencia de smoke desktop en cada sistema operativo soportado.
- Hace falta una corrida HIL trazable del SHA de release en hardware representativo.
- Siguen haciendo falta code signing/notarization, evidencia de reproducibilidad,
  HIL y el sign-off final luego de verificar el workflow alojado del candidato.
- Hace falta un sign-off humano final después de revisar la evidencia.

## Alcance RC de ZPLC 2.0

`v2.0.0-rc.1` es el primer candidato prerelease público del trabajo incremental
de ZPLC 2.0: endurecimiento de la frontera de confianza, contratos canónicos de
proyecto/compilador/tools, simulación host supervisada, el workbench Studio y
fundaciones restringidas de AI/MCP/Lab/Learn. Los gates y non-goals restantes están en
[`specs/010-zplc-2-0-foundation/spec.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).

No deduzcas estado GA, calificación de placa, resultado de timing, paridad de
features o propiedad de seguridad a partir de esta página o de la presencia de código.
