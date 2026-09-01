---
slug: /release-notes
id: index
title: Notas de versión
sidebar_label: Notas de versión
description: Estado de releases de ZPLC respaldado por evidencia.
tags: [releases, changelog]
---

# Notas de versión

ZPLC `v2.0.0-rc.3` es el candidato prerelease actual. No es GA, una certificación
de PLC de seguridad, una calificación de producción de placas ni un resultado HIL completo.

## Estado actual de release

Los gates no-HIL de ZPLC 2.0 están implementados y son verificables localmente:
tests host C99 y sanitizados, checks de compilador/IDE, simulación nativa, Lab/Learn
deterministas, AI/MCP restringidos, documentación bilingüe, CI exact-SHA y controles
del workflow de release. El workflow alojado ejecuta ese SHA antes de publicar;
crea checksums, un SBOM SPDX y provenance, verifica firma nativa macOS/Windows al
publicar y verifica payloads Linux reproducibles. Esos artifacts concretos no existen
hasta que el workflow alojado del tag/SHA termine correctamente.

El único gate de calificación de producto pendiente es HIL físico trazable para
Raspberry Pi Pico RP2040 y ESP32-S3-DevKitC-1-N8R8: build del SHA exacto, flash,
identidad/hash, deploy del programa, escenario golden, reboot/persistencia, salidas
seguras y evidencia de timing por perfil.

El registro actual está en `specs/008-release-foundation/artifacts/release-evidence-matrix.md` de este checkout.

## Límites de evidencia

- Evidencia host, simulación, cross-build y workflow no establece HIL, timing en
  target, comportamiento eléctrico, calificación de placa ni certificación de seguridad.
- Los artifacts Linux se verifican por payload reproducible, checksums y attestation;
  no se describen como firmados nativamente.
- AI y MCP no inician flash, deploy, force, RUN/STOP, recovery, raw serial ni shell.

No deduzcas estado GA, paridad de features, rendimiento temporal o seguridad física
a partir de esta página o de la presencia de código fuente.

## Verificación no-HIL de RC3

- Validá la versión canónica con `bun scripts/release-version.ts --check`.
- Ejecutá regresiones estructurales de release con `node --test scripts/release-artifacts.test.mjs`.
- Ejecutá regresiones de pins de workflows con `node --test scripts/workflow-action-pins.test.mjs`.
- Validá la matriz de evidencia con `python3 tools/hil/validate_release_evidence.py`.
- Generá la documentación y validá paridad EN/ES antes de presentar un candidato.

## Criterio de salida HIL

- Usá sólo el SHA exacto de release y registralo en la evidencia de ambas placas.
- Mantené flash de firmware, deploy del programa y RUN/debug como operaciones humanas separadas.
- Preservá salidas seguras en boot, fault, admisión inválida de programa y recovery.
- No publiques claims de producción, timing o seguridad si falta cualquiera de los dos registros de placas.
