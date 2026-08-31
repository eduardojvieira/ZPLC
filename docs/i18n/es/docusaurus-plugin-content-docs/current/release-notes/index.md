---
slug: /release-notes
id: index
title: Notas de versión
sidebar_label: Notas de versión
description: Estado de releases de ZPLC respaldado por evidencia.
tags: [releases, changelog]
---

# Notas de versión

Este repositorio todavía no registra un artefacto publicado de ZPLC v1.5.0.
v1.5.0 sigue siendo un objetivo de release mientras desktop, hardware-in-the-loop
(HIL) y el sign-off final permanecen pendientes.

## Estado actual de release

| Área | Estado público actual | Límite de evidencia |
|---|---|---|
| Core C99 y HAL | Hay código fuente y tests automatizados | Tests host no califican una placa ni su timing |
| IDE y simulación nativa | Existe como superficie de desarrollo | Desktop y paridad con hardware requieren evidencia |
| Lenguajes IEC | Existen paths en el repositorio | Soporte de release requiere evidencia por lenguaje |
| Perfiles de placas | Catalogados en el manifest | Estar listado no implica binario, HIL ni producción |
| Timing/determinismo | Requiere medición por profile | Aquí no se publica un claim hard-real-time estable |

La matriz de evidencia es el registro de revisión de v1.5:
[`specs/008-release-foundation/artifacts/release-evidence-matrix.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/008-release-foundation/artifacts/release-evidence-matrix.md).

## Qué verifica la automatización del repositorio

- Los checks host de CMake/CTest ejercitan el core C99 en la máquina de desarrollo.
- Los checks de build, test y lint del compilador y del IDE ejercitan código del repositorio.
- Los validadores de documentación generada y paridad EN/ES detectan drift documental.
- Los validadores estructurales de placas y evidencia revisan manifests y evidencia registrada.
- La automatización de release queda configurada para producir un SBOM SPDX de
  candidato, checksums SHA-256, manifest de identidad y attestations de los
  instaladores vinculadas al SHA candidato.

Son checks de host y repositorio. No establecen HIL, timing en target ni
calificación de hardware. El checksum y manifest establecen la integridad e
identidad del archivo candidato, no autenticidad/firma ni reproducibilidad entre
runners. Este worktree local no es evidencia de release: el SHA candidato debe
correr y verificarse en el workflow alojado antes de afirmar que existe un SBOM
o una attestation.

## Aún requerido antes de publicar

- Hace falta evidencia de smoke desktop en cada sistema operativo soportado.
- Hace falta una corrida HIL trazable del SHA de release en hardware representativo.
- Siguen haciendo falta code signing/notarization, evidencia de reproducibilidad,
  HIL y el sign-off final luego de verificar el workflow alojado del candidato.
- Hace falta un sign-off humano final después de revisar la evidencia.

## ZPLC 2.0

ZPLC 2.0 es un RFC de implementación aprobado, no un release ni un compromiso
público de soporte. Avanza Studio y la orquestación en forma incremental mientras
se validan y evolucionan core, compilador, runtimes POSIX/Zephyr, protocolo nativo
y editores. Sus gates y non-goals están en
[`specs/010-zplc-2-0-foundation/spec.md`](https://github.com/eduardojvieira/ZPLC/blob/master/specs/010-zplc-2-0-foundation/spec.md).

No deduzcas un release, calificación de placa, resultado de timing, paridad de
features o propiedad de seguridad a partir de esta página o de la presencia de código.
