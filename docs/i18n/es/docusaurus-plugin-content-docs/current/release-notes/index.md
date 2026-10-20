---
slug: /release-notes
id: index
title: Notas de versión
sidebar_label: Notas de versión
description: Estado de releases de ZPLC respaldado por evidencia.
tags: [releases, changelog]
---

# Notas de versión

ZPLC `v2.0.0-rc.3` es el candidato preliminar actual. No es una versión de
disponibilidad general (GA), ni una certificación de PLC de seguridad, ni una
calificación de placas para producción, ni un resultado HIL completo.

## Estado actual de la versión

Los instaladores de rc.3 no están firmados: macOS y Windows advierten antes de
ejecutarlos, y [Primeros pasos](../getting-started/index.md) explica cómo
continuar. Provienen de una compilación preliminar de la confirmación `b379d82` y se
subieron a mano; la compilación que publicaría una versión a partir de la etiqueta
no llegó a terminar. La versión incluye sumas de verificación SHA-256 y una lista
de materiales de software SPDX.

Las verificaciones automáticas que se ejecutaron para esa confirmación son las
pruebas de host del núcleo en C99, las pruebas con sanitizadores y de fuzzing, las
pruebas de Zephyr Twister en `native_sim`, las pruebas de humo de la aplicación de
escritorio empaquetada y la compilación cruzada de los seis perfiles de placa.

Ninguna placa se ha probado en hardware: vea [Compatibilidad de hardware](../reference/capabilities-evidence.md)
y [Seguridad y limitaciones](../safety-and-limitations.md). Una afirmación sobre
hardware requiere una prueba física trazable (HIL) para la Raspberry Pi Pico RP2040
y la ESP32-S3-DevKitC-1-N8R8: compilación del SHA exacto, grabación, identidad y
hash, carga del programa, escenario de referencia, reinicio y persistencia, salidas
seguras y tiempos por perfil.

## Límites de la evidencia

- La evidencia de host, de simulación, de compilación cruzada y de flujos de
  trabajo no establece HIL, tiempos en el destino, comportamiento eléctrico,
  calificación de placas ni certificación de seguridad.
- Los artefactos de Linux se verifican por contenido reproducible, sumas de
  verificación y atestación; no se describen como firmados de forma nativa.
- La IA y el MCP no inician acciones de grabación, carga, forzado, RUN/STOP,
  recuperación, puerto serie sin procesar ni intérprete de comandos.
- El flujo de trabajo de publicación crea el borrador solo cuando todas las
  compilaciones de plataforma terminaron (cada una instala o monta y lanza antes sus
  formatos de instalador), y la verificación de reproducibilidad del contenido de
  Linux se lee en las notas de la versión sin bloquear la ejecución. Estas reglas se
  escribieron y se comprueban con pruebas estructurales; ninguna ejecución alojada de
  una publicación las ha ejecutado todavía.

No deduzca el estado GA, la paridad de funciones, el rendimiento temporal ni la
seguridad física a partir de esta página ni de la presencia del código fuente.

## Verificación de RC3 sin HIL

- Valide la versión canónica con `bun scripts/release-version.ts --check`.
- Ejecute las regresiones estructurales de la publicación con `node --test scripts/release-artifacts.test.mjs`.
- Ejecute las regresiones de las versiones fijadas de las acciones con `node --test scripts/workflow-action-pins.test.mjs`.
- Valide la matriz de evidencia con `python3 tools/hil/validate_release_evidence.py`.
- Genere la documentación y valide la paridad EN/ES antes de presentar un candidato.

## Criterio de salida HIL

- Use solo el SHA exacto de la versión y regístrelo en la evidencia de ambas placas.
- Mantenga la grabación del firmware, la carga del programa y RUN/depuración como operaciones humanas separadas.
- Conserve las salidas seguras en el arranque, ante una falla, ante la admisión de un programa inválido y en la recuperación.
- No publique afirmaciones de producción, de tiempos ni de seguridad si falta cualquiera de los dos registros de placa.
